# 새 ChatGPT 채팅에서도 NEW-PSI 및 다른 제품 작업 이어가기

## 이 시스템이 저장하는 것과 저장하지 못하는 것
GitHub `AGENTS.md`와 `skills/psi-ai-company/SKILL.md`는 저장소에 계속 유지된다. GitHub 연결을 사용할 수 있는 새 채팅에서 이 파일을 **명시적으로 읽으면** 같은 역할·검증 체계를 재사용할 수 있다.
그러나 채팅 사이에 7명의 별도 자율 에이전트가 계속 돌아가거나, 사용자 계정에 새 ChatGPT 스킬이 자동 설치되거나, 새로운 대화가 이 파일을 반드시 알고 시작하는 것은 아니다.

## 새 채팅 시작 문구 (복사해서 전송)

```text
아틀라스, PSI AI STUDIO 회사형 개발조직으로 이전 작업 이어서 진행해줘.
GitHub TELLOWSS/NEW-PSI 의 AGENTS.md,
skills/psi-ai-company/SKILL.md,
config/psi-company-agent-roster.json,
config/psi-company-product-registry.json 을 먼저 읽어.
작업 대상은 [NEW-PSI / PSI : ZERO DAY / SMART TBM / SMART-SFCS / 제품명] 이야.
해당 제품의 GitHub 열린 PR, 최신 main SHA, CI 검사, Vercel production SHA·도메인을 실조회한 다음,
나비·루미·코어·세이프·키퍼·프루프 역할별 책임을 배정해 사용자 편의성/품질/안전 검토와 실제 개선을 진행해.
부서별로 점검 내용, 조치 내용, 검증 근거, 실패/보류 항목을 투명하게 보고해.
별개 제품 데이터를 섞지 말고 테스트 실패 시 운영 병합을 중단해.
```

## 확인 순서
1. 연결된 GitHub 앱/저장소에 접근 가능한지 확인한다. 없다면 URL을 복사한 것만으로 읽은 척하지 않고 접근 방법을 안내한다.
2. 반드시 실제 소스의 `main`과 `AGENTS.md`를 먼저 읽는다. 과거 답변의 SHA와 PR 상태는 이미 달라졌을 수 있다.
3. 7개 검증된 Vercel 프로젝트는 `config/psi-company-product-registry.json`에서 해당 제품을 선택한다.
4. 열려 있는 PR, 24시간 CI, 그 PR의 preview, main production, 운영 alias를 비교한다.
5. 사람의 승인 없이 권한 확대, DB 파괴 작업, 유료 호출, 문자·메일 전송을 수행하지 않는다.
6. 모든 변경은 해당 제품에만 적용하며 테스트→PR→독립 QA→main 병합→Vercel 최종 확인 순서를 지킨다.
7. 매 작업 종료 시 GitHub 근거를 남기고 남은 과제를 명시한다.

## 제품별 기본 표준
- **NEW-PSI:** 현장 안전지능 메인, `npm run verify:ci`, 전체 부서 Chromium 7흐름
- **PSI : ZERO DAY:** 별도 게임. 기존 `AGENTS.md`의 Master Design Principles·Visual Lock 우선, `npm test`와 `npm run build` 등 기존 원칙 유지
- **SMART TBM:** NEW-PSI와 별도 프로그램, `npm run build` 기준
- **SMART-SFCS:** 별도 안전 운영 앱, `npm run build`는 `verify:env`·`typecheck` 포함
- **기타 제품:** `package.json`·기존 테스트·배포 절차를 읽은 다음만 실행 명령 결정

참고: `config/psi-company-progress.json`은 마지막 검토 순간의 기록 **스냅샷**이다. GitHub Actions의 최신 리포트를 우선한다.

## NEW-PSI Living UI UI·UX 고도화 작업 재개 (2026-11-21 추가)

NEW-PSI의 Code and Chill 템플릿 참조 기반 PC·모바일 디자인 고도화는 별도 단일 인계서를 사용한다.

- 필독: [Living UI 통합 설계·구현·검증 인계서](../PSI_LIVING_UI_MASTER_HANDOFF_20261121.md)
- 작업 브랜치: `feat/psi-living-ui-design-foundation-20261121`
- 사용자 정정: **현장 관리자의 장갑 착용을 UX의 일반적 필수 전제로 가정하지 말 것.** 역할·업무·기기 맥락을 실제 검증한다.
- `L00~L18` 추적표를 읽고, 완료 판정과 배포 SHA는 실시간 재확인한다. Main 병합·Production 배포는 승인 전 보류.

> 2026-11-22 L14 추가: Living UI Draft PR #237에서 `/field-local/` 전용 PWA 설치형 파일럿 구현. 실제 Android 설치/비행기모드/IndexedDB 사진 복원은 미검증. 상세 결정서 `docs/PSI_L14_PWA_DECISION_AND_FIELD_TEST_20261122.md` 및 Living UI 마스터 인계서 L14 절 참조. main/Production 최종 승인 전 보류.

> 2026-11-22 L15 추가: Draft PR #237에서 관리자 모바일 메뉴/QuickFind의 초점 트랩·44px/작은 viewport·100dvh 및 합성 브라우저 QA를 추가. 실제 200% 줌/Android/스크린리더/다국어 검증은 별도. 상세 `docs/PSI_L15_ACCESSIBILITY_FIELD_QA_20261122.md`. L16 성능·저속망/오프라인 검토가 다음 독립 작업이며 main/Production 운영 승인 보류.

> 2026-11-22 L16 추가: `/field-local/`의 브라우저 연결 신호 구분 UI 및 오프라인 캐시·합성 사진 저장/복원·재연결 시 자동 API 0 검증을 추가. 실제 3G/Android 배터리·iOS 실측은 미검증. `docs/PSI_L16_NETWORK_BATTERY_FIELD_QA_20261122.md` 및 Living UI 마스터 인계서 L16 참조. 다음 L17 보안·권한·무결성·OSS. main/Production 반영 보류.

> 2026-11-22 L17 추가: `/field-local` 관련 경로의 noindex/no-referrer, OSS 후보 런타임 미도입·API/공유·인증·PWA 범위의 source-only 정적 보안 게이트 추가. CSP 광범위 허용, 실 HTTP 헤더, Supabase RLS/현장별 권한 및 상용 라이선스는 미검증. 상세 `docs/PSI_L17_SECURITY_OSS_GATE_20261122.md`. 다음 L18 통합 품질·실기기·승인 검토. main/Production 보류.

> 2026-11-22 L18: 동일 HEAD `639b861`에서 L17 릴리스·전사 Chromium·Inspector 모바일 QA 모두 PASS 확인. 실 Supabase PSI-Database 읽기 전용 RLS/GRANT/RPC 메타데이터 조사(PR #237 코멘트). 신설 `config/psi-living-ui-release-acceptance.json` 13개 human gate 전부 PENDING, `scripts/verify-psi-l18-release-gate.mjs` CI 합성 증거 집계 후에도 출시 BLOCKED를 보장. 최신 HEAD CI는 push 후 재조회. 상세 `docs/PSI_L18_RELEASE_READINESS_20261122.md`. 다음 L06 근로자 Q1~Q5 직접 입력/현장·Android·원어민/서버권한 실제 검증. main/Production 보류.

> 2026-11-22 최초 2025년 수기·다국어 위험성평가 양식 OCR 병행: PDF는 3쪽 스캔(각 1페이지/2.85MiB 제한), PPTX 6장(한국어·중국어2·러시아어·미얀마어·베트남어, 직접 OCR 불가). 최신 하단/구형 상단 인적사항·문항 Q1~Q5·다국어 기록표 제목 보강, 개인정보 실원본 GitHub 미업로드/실OCR 미검증. 상세 docs/PSI_OCR_LEGACY_SELFREGULATION_COMPAT_20261122.md; main/Production 보류.

> 2026-11-22 기존 2025년 스캔 PDF 다쪽 파일은 명시적 로컬 분리 버튼으로 1쪽당 JPEG/독립 OCR 대기 기록. 12쪽/20MB/이미지 2.85MiB 상한과 원자적 실패, PDF 업로드 사전 페이지/용량 판정 추가. 자동 서버 OCR 실행·DB 변경 없음. CI/실기기·원본 3장 OCR 정확도 검증 대기. 상세 docs/PSI_OCR_LEGACY_SELFREGULATION_COMPAT_20261122.md, PR Draft, main/Production 보류.

> 2026-11-22 L06 직접 작성→정식 제출 사전 권한계약 3차: PR #237 Draft. `/worker-risk-draft`는 한국어 5문항 작성/검토/인쇄 시범이며 **제출·서명·저장/개인정보 전송 없음**. `utils/workerRiskSubmissionContractL06.ts` 엄격한 원문 제출/접수증 구분과 `lib/server/workerRiskScopeL06.ts` 서버 계정→근로자→테넌트→현장→평가주기 접근범위 fail-closed 검사(합성 A/B 교차테넌트 회귀)를 추가. 실제 PSI-Database에는 근로자 계정 연결 테이블은 있지만 필요한 개별 현장배정·평가주기·접수 테이블은 아직 확인되지 않아 **실 서버/DB·정식 제출 API 연결 안 함**. 상세 `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md`, `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md` L06 3차. 마지막 커밋 CI 3종 실조회 필수, L18 출시 BLOCKED, main/Production 승인 전 보류.


> 2026-11-22 L06 4차: NEW-PSI PR #237 Draft의 `supabase/proposals/psi_worker_risk_submission_l06_staging.sql`와 `tests/psiWorkerRiskSubmissionSqlL06.test.ts`를 확인. 기존 미적용 현장·근로자 배정 proposal을 재사용해 Q1~Q5 원문·자가등급/언어·서버 접수시각·중복 요청 안전성·감사 원장 원자적 롤백을 실제 PGlite PostgreSQL로 독립 가상 A/B 테넌트 검증. **운영 migrations에 편입하거나 운영 DB/RPC/API/개인정보/Production을 변경하지 않았음.** `main` 병합·운영 배포 보류, 실제 Auth/RLS·현장별 권한·접수/승인·개인정보 보유/삭제/다국어/Android 인수 대기. 상세 `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §7 및 Living UI 마스터 인계서 L06 4차. 최신 HEAD 3종 CI 결과 실조회 필수.


> 2026-11-22 L06 5차 관리자 검토·보완·2인 승인: PR #237 Draft, `supabase/proposals/psi_worker_risk_manager_review_l06_staging.sql` 신규 및 `tests/psiWorkerRiskSubmissionSqlL06.test.ts` 20개 PGlite 테스트. 기존 4차 원문·수신/원장에 **별도 변경불가 검토 이력**을 연결: 현장에 소속된 owner/admin/reviewer만 검토, **서로 다른 2명**의 초기 검토와 최종 owner/admin 기록 승인, 자기승인/교차현장/교차기업/재전송 변조·보완요청 후 재승인 차단. `approved`는 오직 **평가자료 기록 검토 승인**이며 작업허가/위험 제거/교육 완료가 아님. 신뢰된 관리자만 원문과 이벤트를 조회할 수 있는 협소한 RPC 제안; 운영 DB/RPC/API/Production 실제 적용 **전혀 없음**. 5차 최초 12b2a65 CI 18/20, 조회 SQL COALESCE 오류 2건을 17dfbf9에서 수정. **새 최종 SHA CI 3종 실조회 후만 PASS 판정**. 세부 `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §8 및 Living UI 마스터 인계 L06 5차. 승인된 별도 테스트 테넌트 실제 Auth/RLS·보완 재제출 링크·보존기한/개인정보·Android/11개 언어 QA 대기. L18 13 human gates pending, main 병합·Production/운영 DB SQL 변경 금지.

> 2026-11-22 L06 6차 Living UI: `/worker-risk-draft` 한국어 시범 화면을 기존 5문항 동시 노출에서 **Q1→Q2→Q3→Q4→Q5 한 화면 한 문항** 모바일 흐름으로 개선. 완료 진행 막대/단계 버튼/미완료 이동 차단/이전 단계 원문 보존/최종 검토·수정·초기화·입력 포커스. 전용 합성 Chromium QA도 단계 이동·미작성 차단·복원·외부 API/브라우저 저장 0 검사로 갱신. 변경 PR **#237 Draft**, master handoff `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md` L06 6차 참고. 정식 제출·실계정 인증·다국어 원어민·Android 실사용·부모제출 링크 및 관리자 보완 승인 운영 연동 **미완료**, 출시 인수 13개 PENDING. 최신 브랜치 HEAD CI 3종 확인 후 다음 작업; main/Production/운영 DB 보류.

> 2026-11-22 L06 7차: Draft PR #237의 `supabase/proposals/psi_worker_risk_resubmission_l06_staging.sql`에 변경불가 원본→새 Q1~Q5 제출 연결(동일 기업·현장·근로자·주기 FK, 최종 `request_changes` 필수, 중복 요청 원자적 접수/롤백), 관리자 권한 검증 양측 읽기 RPC 초안 추가. `components/assessment/PsiRevisionEvidencePanelL06.tsx`에 원문 전후 5문항·Q3 이유·보완사유 읽기 전용 비교 UI, PGlite/React 테스트 추가. **실서버 API/관리자 실화면 연결/운영 DB·마이그레이션/근로자 기록 저장/배포 없음.** 이번 최종 HEAD 3종 CI 실제 확인이 다음 1순위. 상세 `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md` L06 7차와 `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §9. Android·원어민·실 Auth/RLS/법무·13개 출시 승인 pending, main/Production 보류.

> 2026-11-22 L06 8차: `psi_worker_risk_resubmission_l06_staging.sql`에서 보완요청 **이전 수신된 독립 원문을 재제출 본문으로 재활용하는 경우 차단**(수신시각·보완요청시각 교차검사). PGlite 반례 1건 추가. `pages/PsiRevisionLabL06.tsx`와 `/_dev/psi-l06-revisions` **Vite 개발 전용** 가상 관리자 원문 비교 UI 연결 및 390px/1280px 합성 브라우저/운영 빌드 경로 비제공 CI 추가. 실 관리자 업무 메뉴/실데이터·인증 서버 API에는 **전혀 연결되지 않음**. master handoff L06 8차·L06 계약 §10 참조. 최종 HEAD 릴리스/전사 Chromium/Inspector QA 확인, 그다음 격리 Supabase 실제 Auth/RLS/GRANT 검증이 다음 작업. Draft PR #237·13개 출시 인수 pending, main/Production/실DB 변경 금지.

> 2026-11-22 L06 9차 (NEW-PSI Living UI PR #237 Draft): 서버 확인 관리자 세션→재검증된 세션 ID/만료→기업 owner/admin/reviewer 권한→현장 배정/활성→원본/보완본 strict allowlist·Q1~Q5·원장 시각/리뷰 상태 검사하는 `lib/server/workerRiskManagerReadL06.ts` **SOURCE-ONLY 검증 계약** 신설; 가상 기업·권한 철회·교차현장·개인정보 키 위조·시각 변조 거부 단위 테스트 `tests/psiWorkerRiskManagerReadL06.test.ts` 추가. 실제 운영 관리자 API·Auth/RLS 연결 **아직 없음**. `PsiRevisionEvidencePanelL06`은 변경 문항만 보기/전체 복구·변경 건수·기록검토 승인과 작업허가 분리 상태를 표시하고 390px/1280px Chromium QA를 확장. 문서 `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md` L06 9차 / `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §11. 신규 최종 HEAD의 릴리스·전사 Chromium·Inspector 결과를 실제 재조회, 실패 시 수정. 승인된 격리 Supabase/Auth/RLS, Android/11개 언어·L18 13개 사람 인수 미완료; main/Production/실DB 반영 금지.

> 2026-11-22 L06 10차: `components/assessment/PsiRevisionEvidencePanelL06.tsx`에 **실제 서버기록 원본접수 → 관리자 보완요청 → 독립 보완본접수 → 불변 연결 → 후속 검토** 타임라인, UTC 원본을 서울시간(KST)으로 가시화, 누락/역순/위조 수신·검토 시각이면 원문·타임라인 모두 숨기는 거부형 검사 추가. `pages/PsiRevisionLabL06.tsx` 합성 fixture에 시각 추가, React/390·1280px Chromium 합성 QA로 시간표시·교차현장 차단 확장. 실제 서버 Auth/RLS·실근로자 원문 및 운영 API·SQL·GRANT/DB·Production은 변경 없음. 상세 `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md` L06 10차, `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §12. 반드시 10차 **최종 HEAD** 릴리스·전사 Chromium·Inspector 모바일 CI 상태를 실제 조회하고 실패 보수. 다음 승인된 독립 Supabase 실 Auth/RLS·session-id 철회 검증, Android/11개 언어, L18 13개 사람 인수. PR #237 Draft; main/Production 금지.

> 2026-11-22 L06 11차: `lib/server/workerRiskManagerReadL06.ts`는 원문 조회 전 한 번만 권한검증하면 **조회 도중 관리자 세션 철회/현장 전출**을 놓칠 수 있다는 경합을 보완. 신뢰서버 `clock()`을 조회 시작·완료에 재호출하고 **원문 방출 직전** 활성 세션 ID/만료, 기업 관리자 역할, 현장배정·활성 및 현장상태를 다시 확인하여 중간 권한철회/시간만료 시 원문 전체 비노출. `tests/psiWorkerRiskManagerReadL06.test.ts` 가상 동시철회/시간후퇴·오류 4케이스(총 13개 목표) 추가. 운영 API/실 RLS/GRANT/DB·키·계정/데이터·main/Production **전혀 미변경**. Supabase 프로젝트 2개 목록은 확인했지만 L06용 승인된 독립 sandbox 없음. 마스터 인계서 L06 11차, `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §13 참고. **최종 HEAD 릴리스·전사 Chromium·Inspector 3종 동시 결론 실조회 필수**, 미확인 결과 PASS 주장 금지. 다음 승인된 격리 Supabase에서 실제 `auth.sessions`/RLS/기업·현장 동시 철회 및 Android·원어민·L18 13개 인수 검증. PR #237 Draft/출시 BLOCKED, main/Production 승인 전 보류.

> 2026-11-22 L06 12차 인계 (PR #237 Draft): `psi_worker_risk_manager_review_l06_staging.sql`의 `auth.uid()`만으로는 **철회 후 유효기간이 남은 JWT**를 막지 못한다는 미배포 SQL 취약점 발견·시정 제안. `psi_l06_require_active_session` helper로 Supabase `auth.jwt()->>'session_id'`와 `auth.sessions(id,user_id)` 일치/존재를 잠금 하에 대조하고 원문 관리자 `psi_read_worker_risk_review_l06`에 tenant/site/활성 현장 `FOR SHARE` 잠금 추가; 관리자 검토/읽기 모두 같은 세션 체크. `tests/psiWorkerRiskSubmissionSqlL06.test.ts` 2개 가상기업 세션 fixture, 누락·철회·타인 세션·원문/보완본 차단 및 DB 함수 잠금 확인 PGlite 5건 추가(전체 31 목표). **운영 Supabase 접속·SQL 적용·마이그레이션·실개인정보/계정·main/Production 변경 0**. 같은 SHA의 3 CI 결론 검증 전 PASS 미확정. 상세 `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md` 12차와 `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §14. 다음 단계: 별도 허가·격리된 실 Supabase에서 실제 세션/RLS/GRANT·동시성 확인, Android/원어민/보존삭제/13 human gates. 관리자 서버 API/메뉴 실연동 금지.
