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

## 배포 (Dokploy / 컨테이너)

동봉된 `Dockerfile` 로 그대로 배포한다 (정적 서버, 상태 없음). 환경변수:

| env | 설명 | 예 |
|---|---|---|
| `EO_ALLOWED_PARENT_ORIGINS` | 임베더 origin allowlist (콤마 구분) — **미설정 시 localhost 만 허용** | `https://works.example.com` |
| `EO_DS_URL` | DocumentServer 주소 | `https://ds.example.com` |
| `EO_PUBLIC_URL` | 이 서버의 공개 주소 — DS 가 데모 문서를 가져갈 때 사용 (미설정 시 로컬 Docker 용 `host.docker.internal`) | `https://bridge.example.com` |
| `EO_DEMO_DOCS` | `false` 로 내장 데모 문서 서버 끄기 | |
| `PORT` | 리슨 포트 (기본 9030) | |

### standalone / 데모 문서 서버

`/excel` `/docs` `/slides` 경로(또는 `host.html?type=`)로 직접 열면 내장 데모 문서
서버(`/demo/*`)로 즉시 편집 가능하다 — 임베더 없이 브릿지+DS 만으로 완전 동작.
실제 연동에서는 임베더 측 문서 서버가 문서 서빙/저장을 맡는다 (`?status=` 로 지정 가능).

헬스체크: `GET /healthz`. 로컬 개발은 env 없이 `bun serve.mjs` (localhost 기본값).

배포 전제: DocumentServer 도 함께 배포돼 있어야 하며(`ds-setup.sh` 패치 포함),
브라우저에서 브릿지·DS 둘 다 접근 가능해야 한다. **운영에서는 DS 의 JWT 를 켜고
문서 서버가 토큰을 서명하는 구성이 필요하다** (임베더 측 작업).

## 라이선스

**AGPL-3.0** — [`LICENSE`](./LICENSE). `plugin/plugins.js` 는 ONLYOFFICE sdkjs-plugins 의
클라이언트 셔틀(AGPL, © Ascensio System SIA)을 vendored 한 것이다.
