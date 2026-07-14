# euro-office DocumentServer + eo-bridge 패치 빌드
#
# 빌드 타임 패치: 에디터 로고 클릭의 기본 GitHub 링크 무효화 (아이콘/About 표기는 유지).
# customization.logo 는 라이선스 canBranding 게이트에 막혀 config 로는 불가능해 번들을 수정한다.
# ⚠ AGPL 수정에 해당 — 이 Dockerfile(공개 저장소)이 수정 내용의 공개 그 자체다.
FROM ghcr.io/euro-office/documentserver:latest

RUN cd /var/www/euro-office/documentserver/web-apps/apps && \
    for ed in spreadsheeteditor documenteditor presentationeditor; do \
      sed -i 's|logo.url:"https://github.com/euro-office"|logo.url:""|g' "$ed/main/app.js"; \
      sed -i "s|logo.url:'https://github.com/euro-office'|logo.url:''|g" "$ed/main/ie/app.js" || true; \
    done

# UI 커스터마이징 라이선스 게이트(canBrandingExt) 해제 — customization.leftMenu/rightMenu/
# statusBar/layout 이 config 로 동작하게 한다 (eo:load ui:"compact" 슬림 UI 용).
# ⚠ AGPL 수정에 해당 — 이 Dockerfile(공개 저장소)이 수정 내용의 공개 그 자체다.
RUN cd /var/www/euro-office/documentserver/web-apps/apps && \
    for ed in spreadsheeteditor documenteditor presentationeditor; do \
      sed -i 's|canBrandingExt=params.asc_getCanBranding()&&|canBrandingExt=|g' "$ed/main/app.js"; \
      sed -i 's|canBrandingExt=params.asc_getCanBranding()&&|canBrandingExt=|g' "$ed/main/ie/app.js" || true; \
    done

# URL 스킴을 호스트명 기반으로 판별 (빌드 타임 — env 불필요, 로컬/배포 자동 대응)
COPY patch-scheme.py /patch-scheme.py
RUN python3 /patch-scheme.py

# 배포 상태를 밖에서 확인할 수 있는 빌드 마커: GET /web-apps/apps/api/documents/eo-build.txt
RUN date -u '+eo-ds-build %Y-%m-%dT%H:%M:%SZ hostmap-v1' \
    > /var/www/euro-office/documentserver/web-apps/apps/api/documents/eo-build.txt

# EO_DS_ALLOW_PRIVATE_IP=true 면 기동 시 사설 IP 문서 URL 허용을 주입.
# 로컬 compose(문서 서버가 사설 주소) 전용 — 공개 배포에서는 반드시 false (SSRF 방지).
COPY entrypoint-wrapper.sh /entrypoint-wrapper.sh
RUN chmod +x /entrypoint-wrapper.sh
ENTRYPOINT ["/entrypoint-wrapper.sh"]
