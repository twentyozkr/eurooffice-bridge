# $the_scheme 을 호스트명 기반으로 판별하도록 교체 (빌드 타임, env 불필요)
#
# 문제: TLS 를 앞단 프록시가 풀면 X-Forwarded-Proto 가 유실되거나 'http' 로 도착해
#       DS 가 파일/리다이렉트 URL 을 http 로 생성 → 브라우저 Mixed Content 차단.
# 해법: 헤더 대신 요청 Host 로 판별 — localhost/사설호스트/IP 는 http, 그 외(도메인)는 https.
#       로컬 개발(localhost:9080)과 도메인 배포가 설정 없이 둘 다 동작한다.
import re

P = "/etc/euro-office/documentserver/nginx/includes/http-common.conf"
NEW_MAP = """map $http_host $the_scheme {
    default https;
    "~^localhost" http;
    "~^127\\." http;
    "~^host\\.docker\\.internal" http;
    "~^\\d+\\.\\d+\\.\\d+\\.\\d+" http;
}"""

s = open(P).read()
# 치환 문자열의 백슬래시가 re 템플릿으로 해석되지 않게 함수 치환 사용
s2, n = re.subn(r"map [^\n]*\$the_scheme \{[^}]*\}", lambda _m: NEW_MAP, s)
if n != 1:
    raise SystemExit(f"the_scheme map 교체 실패 (매치 {n}건) — 이미지 구조 변경 여부 확인 필요")
open(P, "w").write(s2)
print("[eo-ds] the_scheme 호스트 기반 판별로 교체 완료")
