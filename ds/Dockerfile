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

# EO_DS_ALLOW_PRIVATE_IP=true 면 기동 시 사설 IP 문서 URL 허용을 주입.
# 로컬 compose(문서 서버가 사설 주소) 전용 — 공개 배포에서는 반드시 false (SSRF 방지).
COPY entrypoint-wrapper.sh /entrypoint-wrapper.sh
RUN chmod +x /entrypoint-wrapper.sh
ENTRYPOINT ["/entrypoint-wrapper.sh"]
