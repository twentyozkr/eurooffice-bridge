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

# 주기적 서버측 forcesave(autoAssembly) — 편집 세션이 열려 있는 동안에도 interval 마다
# 저장 콜백(status 6)을 쏜다. 문서서버(임베더)는 status 6 에서 파일만 갱신하고
# 버전(key)은 유지해야 라이브 세션과 충돌하지 않는다 (key 회전은 최종 닫힘 status 2 에서).
# EO_DS_FORCESAVE_INTERVAL 예: "1m", "30s", "5m". 빈 값이면 비활성(기본).
if [ -n "${EO_DS_FORCESAVE_INTERVAL:-}" ]; then
  EO_FS_INTERVAL="$EO_DS_FORCESAVE_INTERVAL" python3 - <<'PYEOF'
import json, os
p = "/etc/euro-office/documentserver/local.json"
cfg = {}
if os.path.exists(p):
    with open(p) as f: cfg = json.load(f)
svc = cfg.setdefault("services", {}).setdefault("CoAuthoring", {})
svc["autoAssembly"] = {"enable": True, "interval": os.environ["EO_FS_INTERVAL"]}
with open(p, "w") as f: json.dump(cfg, f, indent=2)
print(f"[eo-ds] 주기 forcesave 활성: {os.environ['EO_FS_INTERVAL']}")
PYEOF
fi

exec /entrypoint.sh "$@"
