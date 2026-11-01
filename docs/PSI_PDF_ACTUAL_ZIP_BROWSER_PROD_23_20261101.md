# NEW-PSI 23차 · 실제 ZIP 다운로드/재열람 QA와 Production 정합성 점검 (2026-11-01)

## 기준선
- GitHub `main`: `a7736b95bc01906ac82bc829849c35f3411e9039` (22차 PR #198 완료).
- Vercel `tellowss-projects/new-psi`의 최근 Production READY: `090f5ddb07e684de7deb7133c6504759f84aa107`, 17차 기준. 최신 GitHub와 불일치.
- 프로젝트의 팀 요금제는 Hobby이며 GitHub Vercel 상태는 이전 차수부터 `build-rate-limit` 실패로 기록됐다.
- 하나의 검증된 최신 main 대상으로 Production 배포를 한 차례 시도하되, 빌드 제한이 계속되면 반복 시도하거나 비용이 발생하는 플랜/팀 변경을 하지 않는다.

## 이번 코드 및 자동시험
1. `scripts/verify-psi-pdf-privacy-browser.mjs`에서 npm lockfile에 고정된 JSZip 3.10.1 배포본을 Chromium에 로드하여 네트워크 CDN 없이 실제 ZIP 압축을 실행한다.
2. 기존 PDF.js 합성 PDF 10페이지 허용/11페이지 차단, PDF 렌더, 검정 가림 및 출력물 누출 검사를 유지한다.
3. 기존 기능의 `downloadPreparedPsiRasterPdfReview()`를 호출하고, `saveAs`는 합성 테스트 전용으로 가로채 저장된 ZIP Blob을 수집한다.
4. 브라우저에서 ZIP을 압축 해제하여 3개 파일(`PSI_MASKED_REVIEW.pdf`, `REVIEW_MANIFEST.json`, `SHA256SUMS.txt`)의 목록 및 원본/결과 SHA-256, 미승인 상태를 확인한다.
5. **실제 ZIP에서 추출한 PDF 바이트**를 PDF.js로 다시 열어 가림 픽셀 검사, 텍스트 복사 불가를 검증한다.
6. 원본 파일 교체 후 추가 다운로드 요청이 차단되는지 확인한다.
7. 데스크톱 Chromium(1280×800), Android 화면 크기 터치 Chromium(390×844) 각각에서 실행한다. **실제 Android 기기에서 실행한 테스트가 아니다.**
8. `tests/psiPdfFinalCompare.test.ts`는 ZIP을 압축 해제했을 때 PDF 바이트가 손상된 경우 PDF/JSON/ZIP 저장을 모두 차단하는 예외 테스트를 추가한다.

## 안전 및 한계
- 실제 직원/현장 PDF를 CI로 보내지 않는다. 합성 문서 외 개인정보 사용 금지.
- 자동시험은 합성 PDF와 최종 ZIP/재열람 경로를 검증한다. 실제 UI에서 10페이지 개인정보 가림과 모바일 파일 앱 압축 풀기 기능의 실기기 수동 QA는 미완료다.
- ZIP 파일 검토 성공은 **관리자 승인·반출 허가·전자서명·서버 저장을 뜻하지 않는다.**
- GitHub CI 성공, Production READY, Production 도메인의 실제 최신 SHA를 분리해서 판정한다.
