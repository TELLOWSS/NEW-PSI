# PSI 현장 안전 운영 플랫폼

PSI는 위험성평가 기록을 분석하고, 관리자 검증·안전조치·근로자 교육 환류까지 연결하는 현장 안전 운영 프로그램입니다.

## 로컬 실행

1. Node.js를 설치합니다.
2. `npm install`을 실행합니다.
3. `.env.local`에 필요한 환경변수를 설정합니다.
4. `npm run dev`로 실행합니다.

배포 전에는 `npm run verify:release`로 형식 검사, 자동 테스트, 제품 기준 검사와 빌드를 확인합니다.

## 현재 기준 문서

- 운영: [ADMIN_OPERATION_GUIDE.md](ADMIN_OPERATION_GUIDE.md)
- 배포 환경: [DEPLOYMENT_ENV_CHECKLIST.md](DEPLOYMENT_ENV_CHECKLIST.md)
- 검증: [VERIFICATION.md](VERIFICATION.md)
- OCR 운영 확인: [OCR_ANALYSIS_VERIFICATION.md](OCR_ANALYSIS_VERIFICATION.md)
- 문자·MMS 설정: [SMS_MMS_SETUP.md](SMS_MMS_SETUP.md)
- 브랜드 문구: [PSI_BRAND_VOICE_GUIDE.md](PSI_BRAND_VOICE_GUIDE.md)
- 역할별 UX 문구: [PSI_ROLE_BASED_UX_COPY_GUIDE.md](PSI_ROLE_BASED_UX_COPY_GUIDE.md)
- 제품화 현재 계획: [docs/PSI_보강사항_검증_실행계획_2026-07-14.md](docs/PSI_보강사항_검증_실행계획_2026-07-14.md)
- 개발 원칙: [docs/PSI_DEVELOPMENT_GUARDRAILS.md](docs/PSI_DEVELOPMENT_GUARDRAILS.md)

과거 계획, 완료 보고, 회차별 인계 문서는 [docs/archive/root-history](docs/archive/root-history)에 보존합니다. 특허, 감사, 마이그레이션, 운영 보고 자료는 기존 전용 폴더에서 관리합니다.
