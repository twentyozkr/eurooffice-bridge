# eo-bridge

EuroOffice(ONLYOFFICE 포크) DocumentServer 를 상용 앱에서 **AGPL 격리 구조**로 임베드하기 위한
브릿지 레이어. 임베더는 이 페이지를 iframe 으로 띄우고 [`PROTOCOL.md`](./PROTOCOL.md) 의
postMessage 프로토콜로만 상호작용한다 — AGPL 코드(api.js / DocsAPI / 에디터 plugin)는
전부 이 저장소(공개, AGPL v3) 안에 격리된다.

```
임베더 앱 (비공개)        eo-bridge (이 저장소, AGPL)        DocumentServer (AGPL)
BridgeClient ←postMessage→ host.html + bridge.js ←DocsAPI→ euro-office 컨테이너
              (별도 origin)  + plugin (메시지 에이전트)
```

## 구성

| 파일 | 역할 |
|---|---|
| `host.html` + `bridge.js` | 브릿지 페이지 — api.js 로드, DocEditor 생성, 프로토콜 디스패치 |
| `plugin/` | 에디터 내부 메시지 에이전트 — placeholder 삽입/셀 조회 (MessageChannel) |
| `serve.mjs` | 정적 서버 (Bun, 기본 9030) |
| `PROTOCOL.md` | 임베더 경계의 정본 |

## 실행

```bash
# 1. DocumentServer (사설 IP 문서 URL 허용 패치 필요 — 아래 참고)
docker run -d --name eurooffice-poc -p 9080:80 -e JWT_ENABLED=false \
  ghcr.io/euro-office/documentserver:latest

# 2. 브릿지
bun serve.mjs        # http://localhost:9030
```

임베더에서: `<iframe src="http://localhost:9030/host.html" />` → `eo:ready` 수신 후
`eo:load` 로 문서 로드. 문서 서빙/저장 callback 은 임베더 측 문서 서버 몫이다 (프로토콜 문서 참고).

### DocumentServer 컨테이너 패치 (필수, 1회)

```bash
./ds-setup.sh eurooffice-poc
```

새 컨테이너마다 실행 — ① 사설 IP 문서 URL 허용(request-filtering) ② 에디터 로고 클릭의
기본 GitHub 링크 무효화(web-apps 번들 패치 — `customization.logo` 는 라이선스 canBranding
게이트에 막혀 config 로는 불가). About 다이얼로그의 출처 표기는 유지한다.

`bridge.js` 의 `ALLOWED_PARENT_ORIGINS`(임베더 origin) 와 `DS_URL`(`?ds=` 쿼리로 override) 을
배포 환경에 맞게 조정한다.

## 라이선스

**AGPL-3.0** — [`LICENSE`](./LICENSE). `plugin/plugins.js` 는 ONLYOFFICE sdkjs-plugins 의
클라이언트 셔틀(AGPL, © Ascensio System SIA)을 vendored 한 것이다.
