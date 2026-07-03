#!/bin/bash
set -e
if [ "${EO_DS_ALLOW_PRIVATE_IP:-false}" = "true" ]; then
  python3 - <<'PYEOF'
import json, os
p = "/etc/euro-office/documentserver/local.json"
cfg = {}
if os.path.exists(p):
    with open(p) as f: cfg = json.load(f)
svc = cfg.setdefault("services", {}).setdefault("CoAuthoring", {})
svc["request-filtering-agent"] = {"allowPrivateIPAddress": True, "allowMetaIPAddress": True}
with open(p, "w") as f: json.dump(cfg, f, indent=2)
print("[eo-ds] 사설 IP 문서 URL 허용 (로컬 전용)")
PYEOF
fi

# TLS 종료가 앞단 프록시에서 일어나고 X-Forwarded-Proto 가 유실되는 환경용:
# nginx $the_scheme 기본값을 https 로 강제 → 리다이렉트/파일 URL 이 https 로 생성됨
if [ "${EO_DS_FORCE_SCHEME:-}" = "https" ]; then
  sed -i 's|default $scheme;|default https;|' \
    /etc/euro-office/documentserver/nginx/includes/http-common.conf
  echo "[eo-ds] the_scheme 강제 https (EO_DS_FORCE_SCHEME)"
fi

exec /entrypoint.sh "$@"
