# Verification / Smoke Test Checklist

## 문서 관리 정보
- 발명 및 개발 총괄: 박성훈
- 검토 완료일: 2026-03-02
- 시스템 적용 버전: PSI v2.1.0
- 상태: ✅ 현장 검증 및 프로덕션 배포 완료

Use this checklist to manually verify the main functionality after running the app locally (`npm install` + `npm run dev`).

## 토큰 절약형 사전확인 묶음 (권장)

반복 질의/재확인을 줄이기 위해 아래 순서로 한 번에 실행합니다.

1) 빠른 사전확인 (저비용)
- `npm run verify:fast`
- 포함 항목:
   - `check:context` (현재 저장소에서 가능한 작업 범위 자동 판별)
   - `check:tdz` (useEffect 의존성 TDZ/선언 순서 문제 탐지)
   - `check:types` (`tsc --noEmit`)

2) 릴리스 전 단일 검증 (고비용)
- `npm run verify:release`
- 포함 항목:
   - `verify:fast`
   - `build` (Vite production build)

운영 원칙:
- 작은 수정마다 `build`를 반복하지 않고, 묶음 작업 완료 시점에만 `verify:release` 1회 실행
- 화면 오류 재현 시에도 먼저 `verify:fast`로 구조적 문제를 선차단 후 UI 점검

1. Environment & Startup
   - [ ] `npm install` completes without errors.
   - [ ] `npm run dev` starts Vite and the app is reachable (default: http://localhost:5173).

2. Pages (basic navigations)
   - [ ] Dashboard loads and charts render (no uncaught exceptions).
   - [ ] `OCR Analysis` page allows image upload and attempts analysis (with placeholder/demo image if no API key).
   - [ ] `Worker Management` lists workers and QR generation does not throw errors.
   - [ ] `Reports` page can preview and export a single `Individual Report` (requires html2canvas/jsPDF loaded).

3. File uploads & Images
   - [ ] Uploading a document image shows preview and does not crash the UI.
   - [ ] Profile photo capture (camera) opens (if permissions granted) and captured image attaches to record.

4. AI-related flows (with API key)
   - [ ] `Gemini` API calls succeed when valid `GEMINI_API_KEY` is provided in settings or env.
   - [ ] Rate-limit handling: if API returns quota error, UI shows friendly `할당량 초과` message.

5. Exports
   - [ ] Individual report -> `이미지 저장` creates downloadable image.
   - [ ] Individual report -> `PDF 발급` generates and downloads a PDF (jsPDF present).
   - [ ] Bulk generation (Reports -> individual PDF ZIP) creates a ZIP file when JSZip & FileSaver loaded.

6. Console & Errors
   - [ ] No raw debug `console.log` left in production; non-sensitive logs only in dev.
   - [ ] No uncaught TypeScript runtime errors in console.

7. Accessibility & UX
   - [ ] Buttons have clear labels; critical alerts are in Korean and readable.
   - [ ] Modals (Record detail / Worker history) open/close correctly and save updates.

8. Optional: E2E
   - [ ] (Optional) Run Cypress/Puppeteer script to automate core flows (not included by default).

Notes / Troubleshooting
- If a browser library like `html2canvas`, `jspdf`, `JSZip`, or `FileSaver` is not loaded, check the network console for CDN failures and ensure the hosting HTML includes them.
- On Windows, if `npm` is not recognized, install Node.js and restart PowerShell.

Report issues: Collect console logs and the browser console stack trace; include them when requesting fixes.

Mobile viewport manual QA checklist:
- See `MOBILE_VIEWPORT_QA_CHECKLIST.md` for page-by-page checks at 375x812 and 390x844.
