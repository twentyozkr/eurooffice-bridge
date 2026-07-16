/*
 * eo-bridge core (AGPL v3)
 *
 * 구조:  임베더(부모 창) ←postMessage→ [이 페이지] ←DocsAPI→ 에디터 iframe
 *                                          ↑ MessageChannel
 *                                       plugin (에디터 내부, 같은 origin 서빙)
 *
 * - 임베더와의 경계는 PROTOCOL.md v1
 * - plugin 과는 MessageChannel 로 직결 (plugin 이 connect 핸드셰이크를 시작)
 */
;(() => {
  const BRIDGE_VERSION = '0.9.0'
  const PROTOCOL_V = 1

  // 배포 설정은 serve.mjs 가 env 로부터 생성하는 /config.js (window.EO_BRIDGE_CONFIG) 로 주입.
  // 없으면 로컬 개발 기본값.
  const CFG = window.EO_BRIDGE_CONFIG || {}
  const ALLOWED_PARENT_ORIGINS = CFG.allowedParentOrigins || [
    'http://localhost:9000',
    'http://127.0.0.1:9000',
  ]

  // DocumentServer 주소 (브라우저 관점). ?ds= 쿼리 > env 설정 > 로컬 기본값
  const DS_URL =
    new URLSearchParams(location.search).get('ds') || CFG.dsUrl || 'http://localhost:9080'

  const PLUGIN_GUID = 'asc.{7A1F5E92-4B3C-4D68-9A20-3F84C1E7B052}'

  let parentOrigin = null // 첫 유효 요청에서 고정
  let docEditor = null
  let pluginPort = null
  let pluginReqSeq = 0
  const pluginPending = new Map() // id -> {resolve, timer}

  // ---------------------------------------------------------------- utils
  function emit(type, payload) {
    if (!parentOrigin) return
    window.parent.postMessage({ v: PROTOCOL_V, type, payload }, parentOrigin)
  }

  function respond(id, type, payload) {
    if (!parentOrigin) return
    window.parent.postMessage({ v: PROTOCOL_V, id, type: `${type}:result`, payload }, parentOrigin)
  }

  // plugin 은 documentReady 직후에야 connect 되므로 잠시 기다려준다
  async function waitPluginPort(timeoutMs = 10000) {
    const t0 = Date.now()
    while (!pluginPort && Date.now() - t0 < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200))
    }
    return pluginPort
  }

  async function callPlugin(type, payload, timeoutMs) {
    await waitPluginPort()
    return new Promise((resolve) => {
      if (!pluginPort) return resolve({ ok: false, error: 'plugin not connected' })
      const id = `p${++pluginReqSeq}`
      const timer = setTimeout(() => {
        pluginPending.delete(id)
        resolve({ ok: false, error: 'plugin timeout' })
      }, timeoutMs || 10000)
      pluginPending.set(id, { resolve, timer })
      pluginPort.postMessage({ id, type, ...payload })
    })
  }

  // ------------------------------------------------- plugin 핸드셰이크 수신
  // plugin(에디터 내부 iframe, 같은 origin 서빙)이 window.parent.parent(=여기)로
  // MessageChannel port 를 넘겨준다.
  window.addEventListener('message', (event) => {
    if (event.origin === location.origin && event.data?.type === 'eo-plugin:connect') {
      pluginPort = event.ports[0]
      pluginPort.onmessage = (e) => {
        const msg = e.data || {}
        if (msg.id && pluginPending.has(msg.id)) {
          const { resolve, timer } = pluginPending.get(msg.id)
          clearTimeout(timer)
          pluginPending.delete(msg.id)
          resolve(msg)
        } else if (msg.type === 'selectionChanged') {
          emit('eo:selectionChanged', { address: msg.address, value: msg.value })
        }
      }
      return
    }
  })

  // ------------------------------------------------------- 사용자 식별
  // 임베더가 eo:load 의 user 로 실제 사용자를 넘기는 것이 정석.
  // 없으면 브라우저별 고유 식별자를 생성해 localStorage 에 유지 (협업 시 서로 구분됨)
  function localUser() {
    try {
      const saved = JSON.parse(localStorage.getItem('eo-bridge-user') || 'null')
      if (saved?.id && saved?.name) return saved
    } catch {
      /* 파싱 실패 시 재생성 */
    }
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    const user = { id: `eo-${Date.now().toString(36)}-${suffix}`, name: `사용자-${suffix}` }
    try {
      localStorage.setItem('eo-bridge-user', JSON.stringify(user))
    } catch {
      /* 저장 불가 환경이면 세션 한정 */
    }
    return user
  }

  // ------------------------------------------------------- 에디터 로드/파기
  function destroyEditor() {
    if (docEditor) {
      try {
        docEditor.destroyEditor()
      } catch {
        /* already gone */
      }
      docEditor = null
    }
    pluginPort = null
    // DocsAPI 가 div 를 iframe 으로 교체하므로 mount 지점을 재생성
    const root = document.getElementById('editor-root')
    root.innerHTML = '<div id="editor"></div>'
  }

  function loadDocument(p) {
    destroyEditor()
    const mode = p.mode === 'view' ? 'view' : 'edit'
    const config = {
      documentType: p.docType || 'cell',
      width: '100%',
      height: '100%',
      document: {
        fileType: p.fileType || 'xlsx',
        key: p.key,
        title: p.title || 'document.xlsx',
        url: p.url,
        permissions: { edit: mode === 'edit', download: true, print: true },
      },
      editorConfig: {
        mode,
        lang: p.lang || 'ko-KR',
        user: p.user?.id && p.user?.name ? { id: p.user.id, name: p.user.name } : localUser(),
        customization: {
          autosave: true,
          forcesave: true,
          compactHeader: true,
          // 임베더 테마 동기화 (v1.2) — eo:load 의 theme: 'light'|'dark' 를 DS uiTheme 으로 매핑.
          // 생략 시 DS 기본(사용자 로컬 설정) 유지.
          ...(p.theme === 'dark'
            ? { uiTheme: 'theme-dark' }
            : p.theme === 'light'
              ? { uiTheme: 'theme-light' }
              : {}),
          // 좌측 상단 로고: 아이콘(이미지)은 유지하되 외부(GitHub) 클릭 링크만 무효화.
          // 임베더가 eo:load 의 logo 로 자체 브랜딩(image/url) 주입 가능.
          // euro-office 는 §7(b) 로고 강제 조항이 제거된 순수 AGPL 이라 커스터마이징 합법
          logo: p.logo || { url: '' },
          // ui: 'compact' — 인라인 임베드용 슬림 UI (v1.1).
          // 좌측 아이콘 바·우측 패널 숨김 + 툴바 접힘(탭 줄만 남고 탭 클릭 시 도구 표시).
          // 수식줄·하단 상태바(시트 탭/줌)는 유지.
          // leftMenu/rightMenu:false 는 DS 의 canBrandingExt 라이선스 게이트에 막혀 있어
          // ds/Dockerfile·ds-setup.sh 의 게이트 해제 패치가 적용된 DS 에서만 동작한다.
          // toolbarNoTabs 는 DS 9.3 에서 툴바 아이콘이 깨져 쓰지 않는다.
          ...(p.ui === 'compact'
            ? {
                compactToolbar: true,
                hideRightMenus: true,
                leftMenu: false,
                rightMenu: false,
              }
            : {}),
        },
      },
      events: {
        onDocumentReady: () => emit('eo:documentReady', { key: p.key }),
        onError: (e) =>
          emit('eo:error', {
            code: e?.data?.errorCode ?? -1,
            message: e?.data?.errorDescription ?? String(e?.data ?? e),
          }),
      },
    }
    // DS JWT — 임베더의 문서서버가 서명한 토큰. JWT_ENABLED=true 인 DS 는 이 토큰의
    // 보안 필드(url/key/callbackUrl/permissions)를 신뢰 원천으로 사용한다 (v1.1).
    if (p.token) config.token = p.token
    if (mode === 'edit') {
      if (p.callbackUrl) config.editorConfig.callbackUrl = p.callbackUrl
      config.editorConfig.plugins = {
        autostart: [PLUGIN_GUID],
        pluginsData: [`${location.origin}/plugin/config.json`],
      }
    }
    docEditor = new window.DocsAPI.DocEditor('editor', config)
  }

  // --------------------------------------------------- 임베더 요청 디스패치
  window.addEventListener('message', async (event) => {
    if (!ALLOWED_PARENT_ORIGINS.includes(event.origin)) return
    const msg = event.data
    if (!msg || msg.v !== PROTOCOL_V || typeof msg.type !== 'string' || !msg.id) return
    parentOrigin = event.origin

    const { id, type, payload = {} } = msg
    switch (type) {
      case 'eo:load': {
        try {
          loadDocument(payload)
          respond(id, type, { ok: true })
        } catch (e) {
          respond(id, type, { ok: false, error: String(e?.message ?? e) })
        }
        break
      }
      case 'eo:insertPlaceholder': {
        const r = await callPlugin('insertPlaceholder', { dataName: payload.dataName })
        respond(id, type, r)
        break
      }
      case 'eo:getActiveCell': {
        const r = await callPlugin('getActiveCell', {})
        respond(id, type, r)
        break
      }
      case 'eo:destroy': {
        destroyEditor()
        respond(id, type, { ok: true })
        break
      }
      default:
        respond(id, type, { ok: false, error: `unknown type: ${type}` })
    }
  })

  // ---------------------------------------------------- standalone 모드
  // 임베더 없이 직접 열린 경우: 문서 서버 status 를 스스로 조회해 에디터를 띄운다.
  // 쿼리: ?type=xlsx|docx|pptx  ?mode=edit|view  ?status=<status 엔드포인트>
  const IS_EMBEDDED = window.parent !== window

  function showNotice(msg) {
    document.getElementById('editor-root').innerHTML =
      `<div style="display:flex;height:100%;align-items:center;justify-content:center;` +
      `font-family:sans-serif;color:#6b7280;font-size:14px;padding:24px;text-align:center">${msg}</div>`
  }

  async function bootStandalone() {
    const params = new URLSearchParams(location.search)
    // 기본은 같은 origin 의 내장 데모 문서 서버 — 브릿지 단독으로 완전 동작
    const statusBase =
      params.get('status') || CFG.standaloneStatusUrl || `${location.origin}/demo/status`
    // 모드: /collabo 프리픽스 = 협업(공유 문서), 그 외 = 개인(브라우저별 문서)
    const isCollabo = location.pathname === '/collabo' || location.pathname.startsWith('/collabo/')
    const subPath = isCollabo
      ? location.pathname.replace(/^\/collabo/, '') || '/excel'
      : location.pathname
    // 문서 타입: ?type= 쿼리 > 경로(/docs, /slides, /excel) > xlsx
    const PATH_TYPES = { '/docs': 'docx', '/slides': 'pptx', '/excel': 'xlsx' }
    const type = params.get('type') || PATH_TYPES[subPath] || 'xlsx'
    const session = isCollabo ? '' : localUser().id

    async function loadCurrent() {
      const statusUrl = new URL(statusBase)
      statusUrl.searchParams.set('type', type)
      if (session) statusUrl.searchParams.set('session', session)
      const s = await (await fetch(statusUrl)).json()
      loadDocument({
        docType: s.doc.documentType,
        fileType: s.doc.fileType,
        mode: params.get('mode') || 'edit',
        key: s.key,
        url: s.doc.url,
        title: s.doc.title,
        callbackUrl: s.doc.callbackUrl,
      })
    }

    try {
      await loadCurrent()
      setupStandaloneOpenButton(type, session, statusBase, loadCurrent)
    } catch {
      showNotice(
        `standalone 모드: 문서 서버(${statusBase}) 접속 실패.<br/>` +
          `문서 서버가 떠 있어야 하며, ?status= 쿼리로 다른 엔드포인트를 지정할 수 있습니다.`,
      )
    }
  }

  // standalone 전용 "불러오기" 플로팅 버튼 — 문서 서버의 upload 엔드포인트로 교체 후 재로드
  function setupStandaloneOpenButton(type, session, statusBase, reload) {
    const uploadBase = statusBase.replace(/\/status$/, '/upload')
    if (uploadBase === statusBase) return // status 엔드포인트 규약이 다르면 버튼 생략

    const label = document.createElement('label')
    label.textContent = '📂 불러오기'
    label.style.cssText =
      'position:fixed;right:16px;bottom:56px;z-index:100;background:#111827d9;color:#fff;' +
      'padding:8px 14px;border-radius:8px;cursor:pointer;font:13px sans-serif;user-select:none'
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `.${type}`
    input.style.display = 'none'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      label.textContent = '⏳ 업로드 중…'
      try {
        const uploadUrl = new URL(uploadBase)
        uploadUrl.searchParams.set('type', type)
        if (session) uploadUrl.searchParams.set('session', session)
        const r = await (await fetch(uploadUrl, { method: 'POST', body: file })).json()
        if (!r.ok) throw new Error(r.error || 'upload 실패')
        await reload()
      } catch (e) {
        alert(`불러오기 실패: ${e?.message ?? e}`)
      } finally {
        label.textContent = '📂 불러오기'
        input.value = ''
      }
    })
    label.appendChild(input)
    document.body.appendChild(label)
  }

  // ------------------------------------------------------------- 부팅
  const script = document.createElement('script')
  script.src = `${DS_URL}/web-apps/apps/api/documents/api.js`
  script.onload = () => {
    if (!IS_EMBEDDED) {
      bootStandalone()
      return
    }
    // 임베더가 아직 parentOrigin 을 안 줬으므로 allowlist 전체에 ready 통지
    for (const origin of ALLOWED_PARENT_ORIGINS) {
      try {
        window.parent.postMessage(
          { v: PROTOCOL_V, type: 'eo:ready', payload: { version: BRIDGE_VERSION } },
          origin,
        )
      } catch {
        /* 대상 origin 아님 */
      }
    }
  }
  script.onerror = () => {
    if (!IS_EMBEDDED) {
      showNotice(`DocumentServer(${DS_URL}) api.js 로드 실패 — DS 가 떠 있는지 확인하세요.`)
      return
    }
    for (const origin of ALLOWED_PARENT_ORIGINS) {
      try {
        window.parent.postMessage(
          {
            v: PROTOCOL_V,
            type: 'eo:error',
            payload: { code: -100, message: `DocumentServer(${DS_URL}) api.js 로드 실패` },
          },
          origin,
        )
      } catch {
        /* 대상 origin 아님 */
      }
    }
  }
  document.head.appendChild(script)
})()
