<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

## 문서 관리 정보
- 발명 및 개발 총괄: 박성훈
- 검토 완료일: 2026-03-02
- 시스템 적용 버전: PSI v2.1.0
- 상태: ✅ 현장 검증 및 프로덕션 배포 완료

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ioxD3tiy2bhXBa8HuFJGKMxyplW-R8OM

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

Quick troubleshooting:

- If `npm` is not found on Windows PowerShell, install Node.js (which includes npm) from https://nodejs.org and restart your terminal.
- If you see TypeScript errors about `@types/node`, run `npm i -D @types/node`.
- To build for production: `npm run build` then `npm run preview` to serve the build locally.

What I changed during automated verification:

- Hardened global window access via `utils/windowUtils.ts` to avoid runtime errors when libraries are loaded on window.
- Reduced unsafe `as any` casts across chart components, modals, and `services/geminiService.ts`.
- Guarded debug logging in `services/geminiService.ts` so it only logs in dev.
- Adjusted `tsconfig.json` to avoid requiring `node` types in this environment.

Next steps I recommend:

- Run `npm install` locally and then `npm run dev` to smoke-test pages (Dashboard, OCR 분석, Worker Management, Reports).
- If you want, I can generate a step-by-step smoke-test checklist and `VERIFICATION.md` (I will add it now).
