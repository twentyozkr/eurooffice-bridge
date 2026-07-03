// eo-bridge 정적 서버 (Bun) — 브릿지 페이지 + plugin 서빙
//
// 실행: bun serve.mjs   (기본 9030)
// - 임베더와 다른 origin 에서 서빙하는 것이 격리 구조의 전제
// - plugin/config.json 은 에디터(DS origin)가 fetch 하므로 CORS 허용 필요
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 9030)

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
    if (path.includes('..')) return new Response('bad path', { status: 400 })

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
