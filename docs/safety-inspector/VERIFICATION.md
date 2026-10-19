# M1 검증 기록 및 재현 방법

2026-10-19 / NEW-PSI Safety Inspector

## 로컬 검증

- `npm run verify:fast`: 기존 제품·OCR·브랜드·보안헤더·점수·타입 계약.
- `npm run check:types`: TypeScript 오류 없음.
- `npm run test:ci`: 112 files / 985 tests PASS. 신규 모듈 5개 test files / 39 tests 포함.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `npm run build`: Vite production build 성공. 배포 단계에서 worker/WASM/언어팩을 같은 출처 경로로 생성.
- `git diff --check`: 통과.

실행 환경 Node 24.19.0. GitHub Actions release-verification 및 Vercel preview의 Node 22.x 빌드도 성공했다. 실제 배포 e41ef672, preview READY. 첫 화면/배포된 OCR 라이선스 문서 HTTP 200 및 wasm 허용 CSP를 확인했다.

## 브라우저 재현

```bash
npm ci
npx playwright install chromium
node scripts/verify-inspector-ui.mjs
```

이미 설치한 Chromium 경로를 사용할 때 `PSI_CHROMIUM_PATH`로 지정할 수 있다. CJK 시스템 글꼴이 없는 격리된 검증 환경은 별도 `@fontsource/noto-sans-kr` 설치 경로를 `PSI_QA_FONT_DIR`로 지정하면 테스트 브라우저에만 글꼴 fixture를 공급한다. 이는 제품 의존성이나 운영 폰트 변경이 아니다.

스크립트는 테스트용 Vite 서버와 Chromium을 같은 프로세스 트리에서 시작하고 끝에 닫는다. 실제 UI·Tesseract WebAssembly·언어팩을 실행하되, `/api/admin/inspector`는 비식별 가상 데이터를 반환하는 네트워크 fixture다. 실제 사용자나 클라우드 업무 기록을 생성하지 않는다.

확인 흐름: 신규 점검 → 설명 저장 → 합성사진 등록 → 실제 영어 인쇄체 OCR → 검수 → JSON 원본 매칭 → 사실 검토 → 개선담당/기한/개선사진 → 완료 검토 요청 → 재점검 확인 → 법령 미검증 보고서. 세 해상도 390×844, 768×1024, 1440×1080에서 document horizontal overflow 없음, uncaught page error 0.

로컬 산출물(기본 gitignore): `artifacts/audit/inspector/`의 UI PNG, PDF, 결과 JSON. PDF는 Playwright 인쇄 후 pdftotext 및 Poppler 렌더로 내용/배치를 확인했다. 첫 출력에서 발견한 전역 `#root display:none` 충돌을 Inspector 범위에서 수정하고 재검증했다.

## DB 및 서버 검증의 구분

- Vitest API 시험: 실제 서버 handler, 인증·DB client는 test double. 익명·shared-saas·quota·입력크기·소스ID·완료 위조·snapshot을 검증한다.
- SQL 시험: 실제 PostgreSQL 호환 PGlite에서 역할·권한·RLS·Storage restrictive policy·감사 트리거·경합·변경불가를 실행한다.
- 원격 Supabase: migration 20261019120720 적용 후 4개 테이블 RLS+FORCE, anon/authenticated SELECT 권한 없음, 요약 view security_invoker, private bucket 3MB, restrictive bucket 정책을 확인했다.
- 원격 DB transaction에서 가상 점검 insert/update와 revision 1/2 감사생성을 확인하고 rollback했다. 확인 후 점검 테이블 0건. 기존 데이터 변경 없음.
- 보안 advisors: 신규 WARN/ERROR 0. 서버전용 no-policy INFO는 의도한 deny-by-default 설계. [설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

클라우드에서 관리자 로그인→API→Storage→화면까지의 실사용 전체 경로, 실제 현장 위험사진 20개 전문가 검수, Android 실기기·손글씨/다국어 정확도는 아직 완료하지 않았다. 웹 fixture 통과를 이 항목의 통과로 취급하지 않는다.

## 출시 경계

공식법령·제재·사례 엔진은 아직 미구현이므로 법적 결론·확정 금액을 출력하지 않는다. 보고서는 검토용이고 개인 서명/최종 발행 승인이 없다. PSI 지표·별도 SMART TBM으로 자동 전송하지 않는다. 기존 Gemini OCR을 신규 OCR로 교체하지 않았다.

운영 main 병합·production 도메인 전환은 이번 첫 구현의 범위에서 수행하지 않는다. PR 및 preview의 실제 커밋·빌드 결과는 IMPLEMENTATION_STATUS에 기록한다.


## 2026-10-20 후속 회귀

- 전체 112 files / 1,004 tests PASS. 신규 계약 시험은 질문 원문 불일치·번호 범위·중복·잘못된 상태·승인필드 주입·짧은 근거·null 답변·기존 문서 호환·답변/설명 변경 후 재검토를 검증한다.
- API 시험은 Storage 충돌(409/Duplicate/ResourceAlreadyExists), 미연결 원본의 SHA-256 복구, 원본 변조 거부, 삽입 경합 시 원본 보존, DB 실패 시 안전한 재시도, 마이크로초가 같은 생성시각의 ID 경계 및 커서 주입 거부를 검증한다.
- 실제 Chromium 138 + 같은 출처 WASM OCR, 390×844 / 768×1024 / 1440×1080: PASS. 질문 답변 저장 전 사실 검토 비활성화, 명시적 미확인 상태를 저장 후 검토·조치 확인·보고서로 전달, 목록 50건 중 편집으로 순서가 바뀐 뒤에도 원래 다음 커서 사용을 확인했다. pageerror 0.
- PDF 텍스트에 `아직 확인하지 못함`과 현장 추가 확인 사유가 남는 것을 확인했다.
- Supabase 보안 advisors 재조회에서 신규 점검 테이블 관련 WARN/ERROR 없음. 기존 서버 전용 4개 테이블의 no-policy INFO는 유지된다. 이번 변경은 DB DDL을 포함하지 않는다.
- 실제 preview 서버 GET: 405, Allow POST, Cache-Control private no-store. 실제 인증 세션을 사용하는 통합 시험은 자동 승인 검토가 기존 대화 자격정보 제출을 거부하여 보류했다. 모의시험을 실배포 인증 통과로 기록하지 않는다.

## 2026-10-20 경험 보강 검증

전체 114 files / 1,016 tests PASS, verify:fast·타입·감사·빌드 통과. 서버 설정의 standard URL fallback·기존 우선순위·공백·누락 분류·비밀 비노출, 검색/필터·미확인 질문 및 반려 후 다음 행동을 추가 검증했다.

브라우저 시험에는 native 사진 dialog의 Tab·Escape, 로컬 검색이 서버 요청을 추가하지 않는지, 모바일/태블릿/PC 저장 버튼의 실제 클릭 지점, 다크 테마 캡처, 미확인 질문 PDF 요약을 추가했다. 기존 본문 페이지의 transform 때문에 고정 저장 바가 가려지는 문제를 portal로 수정했고, 저장 후에는 하단 바를 숨긴다.

실배포 로그인은 사용자 승인 후 실행했으며 HTTP 503으로 실패했다. 서버 로그는 보안 저장소 구성 불가를 기록했다. DB quota 함수의 rollback-only 호출 성공, 실제 검증용 점검 0건을 확인했다. Vercel 환경변수 조회 403과 로컬 CLI 인증 부재 때문에 구성 변경은 미수행이다. 로그인 우회·메모리 제한 대체·비밀 조회·시험자료 임의 생성 없이 이 경계를 미통과로 남겼다.
