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

# 한글 등 IME 조합 중 Cmd/Ctrl+Z(undo)·Y(redo) 차단 — 조합 미확정 상태에서 브라우저의
# 네이티브 contenteditable undo 가 조합 버퍼만 왕복시키는 버그 회피. 조합 확정 후 undo 는 정상.
#  1) keydown 가드: 조합 중 undo/redo 키 무시 (macOS IME 는 keyCode 229 로 올 수 있어 포함)
#  2) beforeinput 가드: 트리거 경로와 무관하게 네이티브 historyUndo/Redo 자체를 차단
#     (DS 자체 undo 는 캔버스 모델이라 beforeinput 을 쓰지 않음 — 항상 차단해도 안전)
# ⚠ AGPL 수정에 해당 — 이 Dockerfile(공개 저장소)이 수정 내용의 공개 그 자체다.
RUN cd /var/www/euro-office/documentserver/sdkjs && \
    for ed in cell word slide; do \
      sed -i 's#CTextInputPrototype.onKeyDown=function(e){#CTextInputPrototype.onKeyDown=function(e){if(e.metaKey||e.ctrlKey)console.log("[eo-kd]",e.keyCode,e.key,"comp="+this.IsComposition);if((e.metaKey||e.ctrlKey)\&\&(90===e.keyCode||89===e.keyCode||229===e.keyCode||"z"===e.key||"Z"===e.key||"y"===e.key||"Y"===e.key)){var _eoT=this;var _eoRedo=89===e.keyCode||"y"===e.key||"Y"===e.key||!!e.shiftKey;var _eoCell=false;try{_eoCell=!!(_eoT.Api.wb\&\&_eoT.Api.wb.getCellEditMode\&\&_eoT.Api.wb.getCellEditMode())}catch(_e1){}if(this.IsComposition||_eoCell){AscCommon.stopEvent(e);try{if(this.IsComposition\&\&_eoT.HtmlArea.setSelectionRange){var _eoL=_eoT.getAreaValue().length;_eoT.HtmlArea.setSelectionRange(_eoL,_eoL)}}catch(_e2){}setTimeout(function(){if(_eoT.IsComposition)return;console.log("[eo-undo]",_eoCell?"native":"api",_eoRedo?"redo":"undo");if(_eoCell)document.execCommand(_eoRedo?"redo":"undo");else _eoT.Api.onKeyDown({keyCode:_eoRedo?89:90,ctrlKey:true,metaKey:false,shiftKey:false,altKey:false,type:"keydown",target:_eoT.HtmlArea,preventDefault:function(){},stopPropagation:function(){}})},0);return false}}#' "$ed/sdk-all.js"; \
      sed -i 's#var inputEvents=\["input","compositionstart","compositionupdate","compositionend"\];#this.HtmlArea.addEventListener("beforeinput",function(e){var t=e.inputType;if("history"===String(t).substr(0,7)){console.log("[eo-bi]",t);e.preventDefault()}},false);var inputEvents=["input","compositionstart","compositionupdate","compositionend"];#' "$ed/sdk-all.js"; \
      sed -i 's#var TEXT_INPUT_DEBUG=false#var TEXT_INPUT_DEBUG=true#' "$ed/sdk-all.js"; \
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
