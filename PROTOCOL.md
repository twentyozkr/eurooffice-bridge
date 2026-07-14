# eo-bridge 프로토콜 v1

works-ui(임베더) ↔ eo-bridge(브릿지 페이지) 간 `window.postMessage` JSON 프로토콜.

> ⚠ 이 문서가 경계의 정본이다. 임베더는 이 문서를 보고 **자체적으로** 타입/클라이언트를 작성한다.
> 브릿지 저장소의 코드(AGPL)를 임베더 쪽으로 복사·공유하지 않는다.

## 봉투 (Envelope)

```json
{ "v": 1, "id": "req-3", "type": "eo:load", "payload": { } }
```

- `v`: 프로토콜 버전 (현재 1)
- `id`: 요청/응답 상관관계 키. 요청에만 존재, 응답은 같은 id 를 echo. 이벤트에는 없음
- 응답 type = 요청 type + `:result`
- 모든 응답 payload 는 `{ ok: boolean, error?: string, ... }`

## 요청 (임베더 → 브릿지)

| type | payload | 응답 payload |
|---|---|---|
| `eo:load` | `{ docType: "cell"\|"word"\|"slide", fileType: "xlsx"\|"docx"\|"pptx", mode: "edit"\|"view", key, url, title, callbackUrl?, lang?, logo?, user?, ui?, token? }` | `{ ok }` — 이후 `eo:documentReady` 이벤트가 실제 로드 완료 신호 |
| `eo:insertPlaceholder` | `{ dataName }` — cell: 활성 셀 값 교체 / word·slide: 커서 위치에 텍스트 삽입 (edit 모드 전용) | `{ ok, address, value }` |
| `eo:getActiveCell` | `{}` (cell 에디터 전용) | `{ ok, address, value }` |
| `eo:destroy` | `{}` | `{ ok }` |

- `url` / `callbackUrl` 은 **DocumentServer 컨테이너 관점** 주소여야 한다 (예: `http://host.docker.internal:9020/...`)
- `key` 는 DocumentServer 캐시 키 — 문서 내용이 바뀌면 반드시 새 key 로 `eo:load`
- `logo` (선택): 에디터 좌측 상단 브랜딩 `{ image, imageDark, url }` — 생략 시 빈 로고(외부 링크 없음)
- `user` (선택): 협업 표시용 사용자 `{ id, name }` — 임베더의 로그인 사용자를 넘기는 것이 정석.
  생략 시 브릿지가 브라우저별 고유 식별자(`사용자-XXXX`)를 생성해 localStorage 에 유지한다
- `ui` (선택, v1.1): `"compact"` 이면 인라인 임베드용 슬림 UI — 탭 줄·좌측 아이콘 바·우측 패널 숨김,
  툴바 한 줄 축약. 수식줄·하단 상태바(시트 탭/줌)는 유지. 생략 시 풀 UI
- `token` (선택, v1.1): 임베더의 문서서버가 DS `JWT_SECRET` 으로 서명한 JWT.
  payload 는 `{ document: { fileType, key, title, url, permissions }, editorConfig: { mode, callbackUrl?, user } }`.
  `JWT_ENABLED=true` DS 에서는 필수 — DS 는 보안 필드를 토큰 값으로 신뢰한다. JWT off DS 에선 생략

## 이벤트 (브릿지 → 임베더, id 없음)

| type | payload | 시점 |
|---|---|---|
| `eo:ready` | `{ version }` | 브릿지 페이지 준비 완료 (이후 요청 수신 가능) |
| `eo:documentReady` | `{ key }` | 에디터 문서 로드 완료 |
| `eo:selectionChanged` | `{ address, value }` | 활성 셀 변경 (best-effort, edit 모드) |
| `eo:error` | `{ code, message }` | 에디터/브릿지 오류 |

## 보안

- 양방향 모두 `event.origin` 을 allowlist 로 검증한다
  - 브릿지: `bridge.js` 상단 `ALLOWED_PARENT_ORIGINS`
  - 임베더: 브릿지 origin 만 신뢰
- `postMessage` 호출 시 targetOrigin 을 명시한다 (`*` 금지)

## 저장(save)은 이 프로토콜 밖이다

저장은 DocumentServer ↔ 문서서버(callback) 간 서버-사이드 REST 로 일어난다.
강제 저장은 임베더가 자기 문서서버의 forcesave 엔드포인트를 호출하면, 문서서버가
DS command service (`POST {DS}/command`, `{ c: "forcesave", key }`) 를 부른다.
브릿지는 문서 상태를 저장하지 않는다.
