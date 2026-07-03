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
  const BRIDGE_VERSION = '0.1.0'
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
        user: { id: 'eo-bridge-user', name: p.userName || '사용자' },
        customization: {
          autosave: true,
          forcesave: true,
          compactHeader: true,
          // 좌측 상단 로고: 아이콘(이미지)은 유지하되 외부(GitHub) 클릭 링크만 무효화.
          // 임베더가 eo:load 의 logo 로 자체 브랜딩(image/url) 주입 가능.
          // euro-office 는 §7(b) 로고 강제 조항이 제거된 순수 AGPL 이라 커스터마이징 합법
          logo: p.logo || { url: '' },
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

  // ------------------------------------------------------------- 부팅
  const script = document.createElement('script')
  script.src = `${DS_URL}/web-apps/apps/api/documents/api.js`
  script.onload = () => {
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
