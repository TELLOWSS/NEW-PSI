# Verification / Smoke Test Checklist

Use this checklist to manually verify the main functionality after running the app locally (`npm install` + `npm run dev`).

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
