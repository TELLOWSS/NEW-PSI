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

## Vercel 배포 점검 (빈 화면 이슈)

- 이 저장소는 `vercel.json`으로 `npm run build` + `dist` 출력 배포를 고정합니다.
- Vercel Project Settings에서 Root Directory가 이 저장소 루트인지 확인하세요.
- 배포 후 빈 화면이면 브라우저 콘솔에서 `index.tsx` 404 또는 모듈 파싱 오류 여부를 먼저 확인하세요.
- 기존 사용자 데이터가 손상된 경우를 대비해 앱 초기 `localStorage` 파싱은 안전 처리되어 화면 중단을 방지합니다.

What I changed during automated verification:

- Hardened global window access via `utils/windowUtils.ts` to avoid runtime errors when libraries are loaded on window.
- Reduced unsafe `as any` casts across chart components, modals, and `services/geminiService.ts`.
- Guarded debug logging in `services/geminiService.ts` so it only logs in dev.
- Adjusted `tsconfig.json` to avoid requiring `node` types in this environment.

Next steps I recommend:

- Run `npm install` locally and then `npm run dev` to smoke-test pages (Dashboard, OCR 분석, Worker Management, Reports).
- If you want, I can generate a step-by-step smoke-test checklist and `VERIFICATION.md` (I will add it now).

## Gemini 협업 시작 가이드 (2026-03-09 기준)

아래 순서대로 보면 현재 상태를 가장 빠르게 이해하고, Gemini와 논의를 바로 시작할 수 있습니다.

### 1) 문서 읽기 순서 (권장 10분)

1. 전체 현황/결정 포인트 확인: [GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md](GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md)
2. 기능 구현 상세 확인: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
3. 과거 작업 맥락 확인: [TASK_COMPLETION_SUMMARY.md](TASK_COMPLETION_SUMMARY.md)
4. 보완 이슈/개선 내역 확인: [IMPROVEMENTS_SUMMARY.md](IMPROVEMENTS_SUMMARY.md)

### 2) Gemini에 바로 전달할 기준 문구

협업용 표준 컨텍스트는 [GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md](GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md)의 **12) Gemini에 바로 붙여넣는 협업 컨텍스트 (복붙용)** 섹션을 그대로 사용합니다.

### 3) 현재 우선 논의 주제 (P0)

- 피드백 다중 채널 확장(웹훅 이후 Slack/Email)과 인증/재시도 정책
- 보고서 실패 재시도 UX(전체 재시도 vs 선택 재시도)
- OCR 오류 분류(휴리스틱 유지 vs 모델 기반 전환)
- 발급 신뢰성 게이트 임계치/예외 승인 절차
- 다국어 번역 API 정식 연동 및 품질/캐시 전략
- Supabase RLS/Storage 최소권한 정책

### 4) 협업 운영 리듬 (권장)

- 일일: 장애/긴급 항목 우선 triage
- 주간: P0 설계안 비교 및 채택
- 월간: Gemini 리뷰 회의록을 [GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md](GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md)에 반영

### 5) 실행 체크

- 앱 실행 확인: `npm install` → `npm run dev`
- 문서 최신화 기준일: 2026-03-09
- 협업 시작점: [GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md](GEMINI_COLLAB_MASTER_BRIEF_2026-03-09.md)

## 운영 문서 (2026-03-14 업데이트)

- 배포 환경변수 점검: [DEPLOYMENT_ENV_CHECKLIST.md](DEPLOYMENT_ENV_CHECKLIST.md)
- 관리자 운영 매뉴얼: [ADMIN_OPERATION_GUIDE.md](ADMIN_OPERATION_GUIDE.md)
- 릴리즈 노트: [RELEASE_NOTES_2026-03-14.md](RELEASE_NOTES_2026-03-14.md)
