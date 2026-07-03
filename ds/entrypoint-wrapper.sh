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

# (스킴 판별은 빌드 타임 patch-scheme.py 로 이동 — env 불필요)

exec /entrypoint.sh "$@"
