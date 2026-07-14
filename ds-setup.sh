#!/usr/bin/env bash
# euro-office DocumentServer 컨테이너 셋업 패치 (eo-bridge 전제 구성)
#
# 새 컨테이너를 만들 때마다 1회 실행:
#   docker run -d --name eurooffice-poc -p 9080:80 -e JWT_ENABLED=false \
#     ghcr.io/euro-office/documentserver:latest
#   ./ds-setup.sh eurooffice-poc
#
# 적용 내용:
#  1) request-filtering: 사설 IP 문서 URL 허용 (host.docker.internal 로 문서를 가져가기 위함)
#  2) 에디터 로고 클릭 기본 링크(github.com/euro-office) 무효화
#     — customization.logo 는 라이선스 canBranding 게이트에 막혀 있어 config 로는 불가,
#       web-apps 정적 번들의 기본값을 빈 문자열로 패치한다.
#     ⚠ AGPL 수정에 해당 — 이 스크립트(공개 저장소)가 수정 내용의 공개 그 자체다.
#       About 다이얼로그의 출처 표기/링크는 건드리지 않는다.
# 사용법: ./ds-setup.sh <컨테이너이름> [--logo-only]
#   --logo-only: 사설 IP 허용을 건너뜀 — 문서 URL 이 공인 도메인인 "공개 배포 DS" 용.
#                공개 DS 에 사설 IP 허용을 넣으면 내부망 SSRF 통로가 되므로 금지.
set -euo pipefail

CONTAINER="${1:-eurooffice-poc}"
LOGO_ONLY="${2:-}"

if [ "$LOGO_ONLY" = "--logo-only" ]; then
  echo "[1/3] request-filtering 사설 IP 허용 — 건너뜀 (--logo-only)"
else
  echo "[1/3] request-filtering 사설 IP 허용"
  docker exec "$CONTAINER" bash -c '
python3 - <<EOF
import json
p = "/etc/euro-office/documentserver/local.json"
with open(p) as f: cfg = json.load(f)
svc = cfg.setdefault("services", {}).setdefault("CoAuthoring", {})
svc["request-filtering-agent"] = {"allowPrivateIPAddress": True, "allowMetaIPAddress": True}
with open(p, "w") as f: json.dump(cfg, f, indent=2)
EOF'
fi

echo "[2/3] 로고 클릭 기본 링크 무효화 (web-apps 번들 패치)"
docker exec "$CONTAINER" bash -c '
cd /var/www/euro-office/documentserver/web-apps/apps
for ed in spreadsheeteditor documenteditor presentationeditor; do
  sed -i "s|logo.url:\"https://github.com/euro-office\"|logo.url:\"\"|g" "$ed/main/app.js"
  sed -i "s|logo.url:'"'"'https://github.com/euro-office'"'"'|logo.url:'"'"''"'"'|g" "$ed/main/ie/app.js" 2>/dev/null || true
done'

echo "[2.5/3] UI 커스터마이징 게이트(canBrandingExt) 해제 — ui:'compact' 슬림 UI 용"
docker exec "$CONTAINER" bash -c '
cd /var/www/euro-office/documentserver/web-apps/apps
for ed in spreadsheeteditor documenteditor presentationeditor; do
  sed -i "s|canBrandingExt=params.asc_getCanBranding()\&\&|canBrandingExt=|g" "$ed/main/app.js"
  sed -i "s|canBrandingExt=params.asc_getCanBranding()\&\&|canBrandingExt=|g" "$ed/main/ie/app.js" 2>/dev/null || true
done'

echo "[3/3] 서비스 재시작"
docker exec "$CONTAINER" bash -c 'supervisorctl restart all >/dev/null'
echo "완료 — healthcheck 대기 후 사용: curl http://localhost:9080/healthcheck"
