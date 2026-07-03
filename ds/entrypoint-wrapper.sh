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
# 값은 따옴표/공백/대소문자에 관대하게 해석한다 (배포 UI 입력 변형 대응)
RAW_SCHEME="${EO_DS_FORCE_SCHEME:-}"
NORM_SCHEME=$(echo "$RAW_SCHEME" | tr -d '"'"'"' ' | tr '[:upper:]' '[:lower:]')
echo "[eo-ds] EO_DS_FORCE_SCHEME='${RAW_SCHEME}' → '${NORM_SCHEME}'"
if [ "$NORM_SCHEME" = "https" ] || [ "$NORM_SCHEME" = "true" ] || [ "$NORM_SCHEME" = "1" ]; then
  # 주의: 앞단 프록시가 X-Forwarded-Proto 를 "http" 로 보내는 경우 default 교체로는
  # 부족하다 (map 이 헤더값을 우선 사용) → $the_scheme map 블록 전체를 https 로 고정
  python3 - <<'PYEOF'
import re
p = "/etc/euro-office/documentserver/nginx/includes/http-common.conf"
s = open(p).read()
s2 = re.sub(
    r"map [^\n]*\$the_scheme \{[^}]*\}",
    "map \"\" $the_scheme {\n     default https;\n}",
    s,
)
open(p, "w").write(s2)
print("[eo-ds] the_scheme map 전체를 https 로 고정")
PYEOF
else
  echo "[eo-ds] the_scheme 강제 미적용 (값이 https/true/1 아님)"
fi

exec /entrypoint.sh "$@"
