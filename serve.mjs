// eo-bridge 정적 서버 (Bun) — 브릿지 페이지 + plugin + 데모 문서 서버
//
// 실행: bun serve.mjs   (기본 9030)
// - 임베더와 다른 origin 에서 서빙하는 것이 격리 구조의 전제
// - plugin/config.json 은 에디터(DS origin)가 fetch 하므로 CORS 허용 필요
//
// 배포 env (없으면 로컬 개발 기본값):
//   EO_ALLOWED_PARENT_ORIGINS  임베더 origin 목록 (콤마 구분, 예: https://works.example.com)
//   EO_DS_URL                  DocumentServer 주소 (예: https://ds.example.com)
//   EO_PUBLIC_URL              이 서버의 공개 주소 — DS 가 데모 문서를 가져갈 때 사용
//                              (미설정 시 http://host.docker.internal:PORT — 로컬 Docker DS 용)
//   EO_DEMO_DOCS               'false' 로 데모 문서 서버 비활성화
//   PORT                       리슨 포트 (기본 9030)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 9030)

// /config.js — env 를 브릿지 페이지로 주입 (window.EO_BRIDGE_CONFIG)
const runtimeConfig = {}
if (process.env.EO_ALLOWED_PARENT_ORIGINS) {
  runtimeConfig.allowedParentOrigins = process.env.EO_ALLOWED_PARENT_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
if (process.env.EO_DS_URL) runtimeConfig.dsUrl = process.env.EO_DS_URL
if (process.env.EO_STANDALONE_STATUS_URL) {
  runtimeConfig.standaloneStatusUrl = process.env.EO_STANDALONE_STATUS_URL
}
const CONFIG_JS = `window.EO_BRIDGE_CONFIG = ${JSON.stringify(runtimeConfig)}\n`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

// ---------------------------------------------------------------- 데모 문서 서버
// standalone 페이지가 임베더 없이도 완전 동작하도록 하는 최소 문서 서빙/저장.
// 실제 연동에서는 임베더 측 문서 서버가 이 역할을 한다 (PROTOCOL.md 참고).
const DEMO_ENABLED = process.env.EO_DEMO_DOCS !== 'false'
const DEMO_SRC = join(import.meta.dir, 'demo-files')
const DEMO_DATA = join(process.env.TMPDIR || '/tmp', 'eo-bridge-demo')
// DS(서버측)가 문서를 가져갈 때 쓰는 이 서버의 주소
const DEMO_PUBLIC_URL = process.env.EO_PUBLIC_URL || `http://host.docker.internal:${PORT}`
// callback 의 편집본 URL host 치환용 (서버 관점 DS 주소)
const DS_FETCH_URL = process.env.EO_DS_URL || 'http://localhost:9080'

const OOXML = 'application/vnd.openxmlformats-officedocument'
const DEMO_TYPES = {
  xlsx: { ct: `${OOXML}.spreadsheetml.sheet`, docType: 'cell', title: '새 스프레드시트.xlsx' },
  docx: { ct: `${OOXML}.wordprocessingml.document`, docType: 'word', title: '새 문서.docx' },
  pptx: { ct: `${OOXML}.presentationml.presentation`, docType: 'slide', title: '새 프레젠테이션.pptx' },
}
const DEMO_BOOT = Date.now().toString(36)
// 세션 단위 상태: 'xlsx:shared'(협업) / 'xlsx:<sid>'(개인) — sid = 브라우저 식별자
const demoState = {}
const stateOf = (type, sid) => {
  const k = `${type}:${sid || 'shared'}`
  if (!demoState[k]) demoState[k] = { version: 1, savedCount: 0 }
  return demoState[k]
}
// 개인 세션은 각자 파일 사본(p-<sid>.<type>), 협업은 공유 파일(sample.<type>)
const demoFileName = (type, sid) => (sid ? `p-${sid}.${type}` : `sample.${type}`)
const demoPath = (type, sid) => join(DEMO_DATA, demoFileName(type, sid))
const demoKey = (type, sid) =>
  `eo-demo-${type}-${sid || 'shared'}-${DEMO_BOOT}-v${stateOf(type, sid).version}`
const sanitizeSid = (raw) => (raw || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)

async function ensureDemoFile(type, sid) {
  mkdirSync(DEMO_DATA, { recursive: true })
  if (!(await Bun.file(demoPath(type, sid)).exists())) {
    const src = Bun.file(join(DEMO_SRC, `sample.${type}`))
    if (await src.exists()) await Bun.write(demoPath(type, sid), src)
  }
}

async function ensureDemoFiles() {
  for (const t of Object.keys(DEMO_TYPES)) await ensureDemoFile(t, '')
}

async function handleDemo(url, req) {
  const type = url.searchParams.get('type') || 'xlsx'
  if (!DEMO_TYPES[type]) return Response.json({ error: 'bad type' }, { status: 400, headers: CORS })
  const sid = sanitizeSid(url.searchParams.get('session'))

  if (url.pathname === '/demo/status') {
    await ensureDemoFile(type, sid)
    const st = stateOf(type, sid)
    return Response.json(
      {
        key: demoKey(type, sid),
        version: st.version,
        savedCount: st.savedCount,
        doc: {
          url: `${DEMO_PUBLIC_URL}/demo/files/${demoFileName(type, sid)}`,
          callbackUrl: `${DEMO_PUBLIC_URL}/demo/callback?type=${type}${sid ? `&session=${sid}` : ''}`,
          title: sid
            ? DEMO_TYPES[type].title
            : DEMO_TYPES[type].title.replace(/\.(xlsx|docx|pptx)$/, ` (협업).$1`),
          fileType: type,
          documentType: DEMO_TYPES[type].docType,
        },
      },
      { headers: CORS },
    )
  }

  const fileMatch = url.pathname.match(/^\/demo\/files\/(sample|p-[a-zA-Z0-9-]+)\.(xlsx|docx|pptx)$/)
  if (fileMatch) {
    return new Response(Bun.file(join(DEMO_DATA, `${fileMatch[1]}.${fileMatch[2]}`)), {
      headers: { ...CORS, 'Content-Type': DEMO_TYPES[fileMatch[2]].ct },
    })
  }

  // 파일 업로드 — 올린 파일이 해당 세션의 현재 문서가 됨 (version bump → 새 key)
  if (url.pathname === '/demo/upload' && req.method === 'POST') {
    const bytes = await req.arrayBuffer()
    const head = new Uint8Array(bytes.slice(0, 2))
    if (head[0] !== 0x50 || head[1] !== 0x4b) {
      return Response.json({ ok: false, error: 'OOXML 파일이 아님' }, { status: 400, headers: CORS })
    }
    await Bun.write(demoPath(type, sid), bytes)
    const st = stateOf(type, sid)
    st.version += 1
    console.log(`[demo] ${type}${sid ? `:${sid}` : ''} 업로드 → v${st.version}`)
    return Response.json({ ok: true, key: demoKey(type, sid) }, { headers: CORS })
  }

  // ONLYOFFICE 저장 callback — status 2(닫힘)/6(강제) 에 편집본 URL
  if (url.pathname === '/demo/callback' && req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    console.log(`[demo] callback(${type}${sid ? `:${sid}` : ''}) status=${body.status}`)
    if ((body.status === 2 || body.status === 6) && body.url) {
      try {
        // DS 가 자기 관점 주소로 URL 을 만들 수 있어 host 를 서버 관점 DS 주소로 치환
        const u = new URL(body.url)
        const hostUrl = `${DS_FETCH_URL}${u.pathname}${u.search}`
        let res = await fetch(hostUrl)
        if (!res.ok) res = await fetch(body.url) // 치환 실패 시 원본 시도
        if (res.ok) {
          const st = stateOf(type, sid)
          st.savedCount += 1
          st.version += 1
          await Bun.write(demoPath(type, sid), await res.arrayBuffer())
          console.log(`[demo] ${type}${sid ? `:${sid}` : ''} 저장 → v${st.version}`)
        }
      } catch (e) {
        console.error(`[demo] 저장 실패: ${e}`)
      }
    }
    return Response.json({ error: 0 }, { headers: CORS })
  }

  return new Response('not found', { status: 404, headers: CORS })
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    let path = url.pathname === '/' ? '/host.html' : url.pathname
    // standalone 경로 라우트 → host.html (문서 타입/모드는 bridge.js 가 경로에서 판별)
    //   /excel /docs /slides          = 개인 모드 (브라우저별 문서)
    //   /collabo(/excel|/docs|/slides) = 협업 모드 (공유 문서 동시편집)
    const STANDALONE = ['/excel', '/docs', '/slides']
    if (
      STANDALONE.includes(path) ||
      path === '/collabo' ||
      STANDALONE.some((p) => path === `/collabo${p}`)
    ) {
      path = '/host.html'
    }
    if (path.includes('..')) return new Response('bad path', { status: 400 })

    if (DEMO_ENABLED && path.startsWith('/demo/')) return handleDemo(url, req)

    if (path === '/config.js') {
      return new Response(CONFIG_JS, {
        headers: { ...CORS, 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' },
      })
    }
    if (path === '/healthz') return new Response('ok', { status: 200 })

    const file = Bun.file(join(import.meta.dir, path))
    if (!(await file.exists())) return new Response('not found', { status: 404 })

    const ext = path.slice(path.lastIndexOf('.'))
    return new Response(file, {
      headers: {
        ...CORS,
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    })
  },
})
if (DEMO_ENABLED) await ensureDemoFiles()
console.log(`[eo-bridge] http://localhost:${server.port} (demo docs: ${DEMO_ENABLED ? 'on' : 'off'})`)
