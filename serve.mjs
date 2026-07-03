// eo-bridge 정적 서버 (Bun) — 브릿지 페이지 + plugin 서빙
//
// 실행: bun serve.mjs   (기본 9030)
// - 임베더와 다른 origin 에서 서빙하는 것이 격리 구조의 전제
// - plugin/config.json 은 에디터(DS origin)가 fetch 하므로 CORS 허용 필요
//
// 배포 env (없으면 로컬 개발 기본값):
//   EO_ALLOWED_PARENT_ORIGINS  임베더 origin 목록 (콤마 구분, 예: https://works.example.com)
//   EO_DS_URL                  DocumentServer 주소 (브라우저 관점, 예: https://ds.example.com)
//   PORT                       리슨 포트 (기본 9030)
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

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname === '/' ? '/host.html' : url.pathname
    // standalone 경로 라우트: /excel /docs /slides → host.html (문서 타입은 bridge.js 가 경로에서 판별)
    if (['/excel', '/docs', '/slides'].includes(path)) path = '/host.html'
    if (path.includes('..')) return new Response('bad path', { status: 400 })

    if (path === '/config.js') {
      return new Response(CONFIG_JS, {
        headers: { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' },
      })
    }
    if (path === '/healthz') return new Response('ok', { status: 200 })

    const file = Bun.file(join(import.meta.dir, path))
    if (!(await file.exists())) return new Response('not found', { status: 404 })

    const ext = path.slice(path.lastIndexOf('.'))
    return new Response(file, {
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  },
})
console.log(`[eo-bridge] http://localhost:${server.port}`)
