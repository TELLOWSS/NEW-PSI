# NEW-PSI L06 — 근로자 위험성평가 직접 제출 보안·데이터 계약 (2026-11-22)

> **상태: SOURCE-ONLY 계약·단위 회귀. 실제 근로자 제출 API/수신·서명·관리자 승인·DB 쓰기·배포 기능 아님.** Draft PR #237에서만 준비. L18 출시 BLOCKED.

## 1. 목적과 현재 연결

- 시범 작성 화면: `/worker-risk-draft`, `pages/WorkerRiskDraft.tsx`. 한국어 UI에서 **Q1~Q5 본인 직접 입력 → 누락 검사 → 화면 검토/수정/인쇄**. 메모리만 유지되며 새로고침 시 소멸. 개인정보·근로자명·서명·인증 키·DB/유료 분석 호출 없음.
- 수기 OCR 경로 및 관리자 검토 화면은 기존대로 유지. OCR 기록과 직접 입력 기록을 같은 원본으로 변조/합치거나, 교육 서명 이수를 위험성평가 제출로 오인시키지 않는다.
- 신설 `utils/workerRiskSubmissionContractL06.ts`: 버전 있는 Q1~Q5 원문 제출 객체의 **엄격한 필드·길이·언어·위험등급 검사**, 서버 권한·보존 조건에 대한 기본 전부 차단 체크, **서버 수신 후 관리자 검토대기 상태와 현장/근로자/요청 ID 상관관계** 검사.
- `pages/WorkerRiskDraft.tsx`의 **미제출 화면 검토 직전** `prepareL06ClientSubmission(draft, 'ko')`만 실행. 준비된 데이터는 서버에 전송하지 않으며 정식 제출 상태를 생성하지 않는다.

## 2. 정식 제출 시 필수 신뢰 경계

| 단계 | 책임 위치 | 반드시 증명할 것 | 미충족 동작 |
|---|---|---|---|
| A. 질문 작성 | 근로자 기기 | 기존 PSI 5문항 정의·본인 원문(Q3 상/중/하 1문자 허용) | 누락 안내, 제출 차단 |
| B. 본인 인증 | 신뢰할 수 있는 서버 인증 경계 | 서버 세션에서 확인한 당사자 근로자 ID, 세션 만료·재인증 | 거절, 기존 초안은 전송하지 않음 |
| C. 소속·대상 주기 | 서버 + DB | 실제 테넌트·현장·평가주기 매핑, 관리자별 인가, 중복/만료 링크 차단 | 403 또는 정책에 맞는 거절 |
| D. 처리근거·보유 | 개인정보 책임자 승인 설정 | 수집항목·목적·보유기간·삭제·언어 안내문 검수. 법적 처리근거/동의 필요성 별도 확정 | 외부 전송 기능 비활성 |
| E. 원문 무결성 | 서버 | 선택 언어 작성 원문 그대로 보존. 번역·모델 해석은 별도 파생 데이터 | 자동 치환·추정 금지 |
| F. 원자적 접수 | 서버 + DB | 요청 ID 기반 중복방지, 서버 생성 수신시각·접수 ID, 감사기록, 스토리지·RLS | 성공 수신 표시 금지 |
| G. 관리자 검토 | 인증된 현장 관리자 | 원문·수신정보·변경 이력·검토자와 검토시각 확인. 보완/승인 분리 | '관리자 승인 완료' 표시 금지 |
| H. 사용자 최종 승인 | 현장·제품 소유자 | 실사용 기기/다국어/접근권한/호스팅 비용 등 L18 인수 | PR Draft와 배포 BLOCKED 유지 |

**중요:** 브라우저가 보낸 `workerId`, `tenantId`, `siteId`, 관리자 권한, AI 점수/번역/서명 값을 신뢰하지 않는다. 현재 제출 객체는 이런 필드를 허용하지 않으며, 실제 운영 서버에서는 인증 세션의 주체·현장 소속을 별도로 확인해 결합해야 한다.

## 3. 전송 스키마 / 상태 구분

- 클라이언트 허용 필드 **6개만**: `schema`, `formVersion`, `sourceLanguage`, `answers`(Q1~Q5만), `selfRiskGrade`, `gradeReason`. `answers`는 Q1~Q5 원문 5개만 담고, Q3는 `selfRiskGrade`와 일치해야 한다. 각 문항 500자 상한, Q1/Q2/Q4/Q5 비어 있음/1글자 금지, Q3는 `상/중/하`만 선택. 허용 언어 코드는 타입에 등록했지만 다국어 **질문 문구 검증/UX는 미구현**.
- 서버 수신 후보의 유일한 초기 결과: `received-pending-manager-review`. 이 상태는 **접수**이지 교육 이수·검토 완료·위험 제거·작업허가가 아니다.
- `matchL06PendingReviewReceipt`는 `authenticatedTransport`와 예상 요청/테넌트/현장/근로자 ID가 모두 일치하는지 문법적으로만 판별. 이 헬퍼 **자체는 실제 DB 커밋·서버 응답의 출처를 증명하지 못함**. 운영에서는 신뢰할 수 있는 로그인·HTTPS 요청 경계와 DB 트랜잭션 성공 이후에만 사용.
- 관리자 보완요청/승인 시점, 결과 회신, 동일 근로자의 중복 제출정책, OCR 원본과의 동등성은 별도 상태 및 감사 이력 설계 후 구현.

## 4. Supabase 등 실제 저장시 반드시 확인

- 테넌트/현장 소속·역할·작성자 관계를 **신뢰 가능한 DB 원천**으로 확인. 클라이언트의 사용자 메타데이터·자가 선택된 현장 ID나 `TO authenticated`만으로 허용하지 않음.
- 외부 노출 테이블·스토리지는 RLS와 실제 역할별 GRANT·USING·WITH CHECK·UPDATE 시 SELECT 정책을 별도로 감사. VIEW의 RLS 우회와 SECURITY DEFINER 실행 권한을 확인. `service_role`을 공개 번들에 넣지 않는다.
- 합성 테스트에서 **테넌트 A 사용자 → A 현장 허용, A → B 거부, 무소속 거부, 만료 세션 거부, 거짓 접수증 거부, 중복 제출 중복처리 방지**를 확인할 때까지 DB/엔드포인트 생성·운영 연결 보류. 확인은 실제 개인정보 없이 승인된 별도 테스트 계정/현장에서 수행.
- 장기 오프라인 임시 저장은 **현 단계에서 미지원**. 브라우저 저장소가 민감한 답변을 평문으로 남기지 않도록 메모리 보존만 허용. 암호화 키 관리, 저장기한, 기기 분실, 자동 삭제, 다중 탭 충돌, 복원·이관 정책을 보안 승인 후 검증한다.

## 5. 검증 근거 / 열린 게이트

- `tests/psiWorkerRiskSubmissionContractL06.test.ts`: 버전/5문항 원문/다국어 원문/등급 일치, 식별정보·Q6·가짜 번역 추가 차단, 과대·미기재 차단, 8개 서버 요구조건 **빈 객체도 차단**, 위조·교차현장·위조 승인 수신증 거부.
- `tests/psiWorkerRiskDraftL06.test.ts`: 화면이 개인정보/서버 기록을 만들지 않는지, 원본 5문항 정합성 검사.
- `scripts/verify-psi-l06-worker-draft.mjs`: 390px 합성 Chromium 실 화면으로 작성→검토→초기화, API/외부 호출 0·브라우저 저장 0. 기존 CI에 연결.
- 이 소스와 같은 HEAD의 `npm run verify:ci`, 전사 Chromium, Inspector 모바일 QA **최종 결론을 별도 실조회**. 한 검사에서 다른 스텝으로 넘어간 것은 전체 PASS가 아니다.
- 실 원본 수기 2025년 문서의 인식률, Android/삼성 인터넷·스크린리더, 한국어 외 11개 언어 원어민 검수, 모바일 A4 출력, 개인정보 보존/실 RLS 권한, 서버 수신은 **모두 미검증**. `config/psi-living-ui-release-acceptance.json`의 human gate를 자동 변경하지 않는다.

**다음 실제 개발:** 현장 사용자 인증 수단/본인 확인의 보안 설계와 개인정보 고지·보존 정책을 확정하고, 테스트 전용 테넌트 2개로 실제 역할별 읽기/접수/정정 경계를 검증. 그 다음 트랜잭션성 서버 접수 API·영수증·관리자 보완 이력을 구현. 배포/외부 전송은 별도 명시 승인 전 보류.


## 6. 2026-11-22 — 두 테넌트·두 근로자/현장 범위검사 실구현 (3차)

- `lib/server/workerRiskScopeL06.ts`: **서버 측 권한확인에 연결할 수 있는 실제 비동기 검사 로직**을 추가. 인자로 들어가는 principal은 **실제 서버가 인증기관에 검증한 사용자 ID/만료 시점만** 사용해야 하고, 브라우저가 전달한 사용자 ID·JWT 사용자 메타데이터·서명·기기 보관 키로 만들 수 없음. 현재는 어떤 실 서버 경로에도 연결하지 않음.
- 검증 순서: ① 로그인 사용자 UUID/세션 만료와 테넌트·현장·주기 UUID ② DB 조회 어댑터로 확인한 활성 근로자 개인계정→근로자 ID 유일 연결 ③ 근로자 활성 상태 ④ **근로자별 현장 배정** 유일 일치 ⑤ 현장 활성 상태 ⑥ 운영주기 open/서버 기준시각 내 유효. 조건 누락·DB 오류·두 계정 중복·다른 테넌트·다른 현장·종료된 평가주기는 전부 DENY. **통과 시에도 `submissionAuthorized:false` 유지**.
- `tests/psiWorkerRiskScopeL06.test.ts`: 개인정보 없는 가상 A/B 테넌트·현장·근로자·운영주기 어댑터로 A→A/B→B만 범위 일치, A→B/B→A·교차 현장·타 근로자·중복 연결·권한 만료·폐쇄 운영주기·누락 테이블/조회 오류 거부 등을 검사한다. 실제 데이터베이스의 RLS 정책 실행/실근로자 로그인을 **대신하지 않는다**.
- **실 서비스 DB 읽기전용 메타데이터 재조회:** 연결된 `PSI-Database`의 public 테이블 49개 중 `psi_tenant_worker_accounts`, `psi_tenant_workers`, `psi_tenant_memberships` 존재. 반면 `psi_tenant_sites`, `psi_tenant_site_memberships`, 근로자 개별 현장 배정·평가주기 제출용 테이블은 확인되지 않음. 현재 `lib/server/tenantNexusSiteRead.ts`에서 참조하는 site 테이블도 존재를 확인하지 못해 **운영에서 그대로 활성화 금지**. 조회한 범위 밖 스키마나 향후 변경까지 부재 보증은 아님.
- `psi_link_worker_account`·`psi_read_worker_education`·`psi_suspend_worker_account` 함수는 SECURITY DEFINER, `authenticated` EXECUTE 가능·`anon` EXECUTE 불가. `psi_lookup_worker_auth`는 두 역할 모두 EXECUTE 불가. 이는 **함수 내부 권한·재인증·실제 교차테넌트 안전성 보증이 아님**. 프로덕션 SQL 변경/새 로그인 계정 생성·테스트 개인정보 조회는 실행하지 않음.
- 실제 운영 연결 전 필요한 것: 회원 본인에게만 허용되는 **검증된 근로자-계정-현장 배정 데이터 출처**, 평가주기 스키마, RLS+GRANT, 서버에서 세션 철회/만료·재인증 검증, 원문 불변 + 개인정보 처리근거·보유/삭제 정책, 원자적 중복방지·접수증·관리자 검토 이력, 가상 계정 2개 이상으로 실제 DB 역할별 실증.
- 이번 변경은 별도 OSS·DB·배포 없이 소스/가상 테스트만 추가. 기존 worker 교육·OCR·정식 관리 기록은 불변. 13개 L18 human gates **pending**, main/Production 보류. PR #237 Draft.
- 이전 `e945610` 동일 HEAD 릴리스/전사 Chromium/Inspector 3종 **SUCCESS** 확인. 신규 SHA CI 3종은 생성 후 최종 상태를 다시 확인하고 그 SHA 결과만 인계한다.

**다음 단계:** 신규 HEAD CI 3종 통과·오류 수정 → 변경관리 승인을 받은 테스트 환경에서 근로자-현장 배정 및 평가주기 RLS를 재현, 두 가상 근로자의 허용·거부·기간 종료·중복요청 기록을 검증 → 인증된 서버 수신/원자적 저장 및 관리자 검토이력 구현. 실제 운영 DB 정책 변경·main 병합·Production 배포 금지.


## 7. 2026-11-22 — 서버 수신·중복방지·원장 트랜잭션의 PostgreSQL 검증 초안 (4차)

**운영 연결 상태: NOT APPLIED / NO API.** 2026-11-22 최신 PR #237 Draft에 아래 SQL과 실제 PostgreSQL 호환 PGlite 회귀를 추가했다. 이 소스가 있다는 사실은 현장 근로자가 위험성평가를 정식 제출했다는 뜻이 아니다.

- **기존 제안 재사용:** `supabase/proposals/psi_tenant_site_memberships_staging.sql`, `psi_site_worker_read_policy_staging.sql`에 이미 `psi_tenant_sites`, `psi_tenant_site_memberships`, `psi_tenant_site_worker_assignments` 제안과 현장 접근 테스트가 존재함을 확인했다. 중복 테이블을 새로 설계하지 않고 이 제안을 **선행조건**으로 참조한다. 실제 연결된 PSI-Database에는 아직 이 테이블들이 없으므로 적용 여부·순서를 별도 승인해야 한다.
- **새 격리 SQL:** `supabase/proposals/psi_worker_risk_submission_l06_staging.sql` — `psi_tenant_risk_cycles`(기업·현장·평가주기·열림/만료), `psi_worker_risk_submissions`(원문 Q1~Q5·자가 상/중/하·언어·formVersion·개인 근로자/현장·서버 접수시각), `psi_worker_risk_receipt_events`(최초 수신 1건의 별도 감사 원장). 세 테이블 모두 RLS ENABLE+FORCE. `anon`·`authenticated`는 테이블 직접 SELECT/INSERT/UPDATE/DELETE 권한 없음. 영속 수신이 되어야만 `received-pending-manager-review` 상태로 기록되고 교육 이수·감소대책 완료·작업 재개 승인으로 처리하지 않는다.
- **원자적 함수 (제안 SQL 내부만):** `psi_submit_worker_risk_l06` — 인증 토큰에서 `auth.uid()`만 추출; 서버 DB의 활성 근로자 계정과 실제 근로자·현장 배정·현장 활성·열린 평가주기를 대조. 신원/현장/근로자 ID를 외부 답안 객체에서 받지 않고 DB에서 도출. 5문항 원문, Q3 등급, 언어/버전/입력 길이를 재검증한다. 첫 수신 INSERT + 감사 원장 INSERT가 같은 DB 트랜잭션에 있고 감사 기록 실패 시 전체 취소. `(tenant_id,worker_id,request_id)`에 DB UNIQUE 제약을 두어 동일 요청·동일 내용의 재시도는 접수 ID·수신시각 재사용, 다른 내용의 재시도는 충돌 거부. 서버가 생성한 receipt만 반환. 함수는 `authenticated`만 실행할 수 있게 제안하나 **실제 RPC 노출/실환경 보안 승인 전 사용 금지**.
- **실 PostgreSQL 테스트:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`가 PGlite에서 운영 테이블과 **완전히 분리된 가상 A/B 테넌트, 두 근로자/로그인/현장/평가주기**를 생성. A→A/B→B, A→B·B→A/같은 기업의 다른 현장/외부 사용자 차단, Q1~Q5 변조·Q6/신분 삽입 차단, 불일치 재전송·동일 재전송, 만료·비활성 근로자/계정/현장/주기, 직접 DB 조작 차단, 감사 INSERT 오류 시 전체 롤백까지 검사한다. **CI에서 실제 성공한 커밋·로그를 확인하기 전에는 PASS라 부르지 않는다.**
- **제한 및 다음 감사:** SOURCE-ONLY 가상 데이터 검증은 실 PSI-Database의 Auth/RLS/GRANT/CSP/현장 관리·개인정보 정책·원어민 문항 검수를 보증하지 않는다. 보안정의(`SECURITY DEFINER`) 함수의 서명·EXECUTE 최소권한, 잠금 순서/중복 요청 경합, 계정 철회·실세션 검증, 원문 보존·삭제 기한, 관리자 검토/승인 이벤트 및 기록 무결성을 보안·법무·현장 책임자가 별도 확인해야 한다. 기능을 직접 `api/saas/access.ts`에 연결하지 않았으며 실제 임시저장·작업 중지/재개·인적사항 수집 기능도 없음.
- **승인 조건:** 두 가상 근로자로 분리된 실제 Supabase 테스트 프로젝트에서 Auth/GRANT/RLS·교차 현장/기업·관리자 읽기/보완·중복 전송 경합/취소·보존 기간을 **검증 승인 받은 뒤에만** 신규 마이그레이션·API 배포 검토. PR #237 Draft, `main` 병합·Production·운영 DB 변경은 최종 승인까지 보류. L18 human acceptance 13건 모두 pending.

**다음 한 작업:** 최신 HEAD 릴리스/전사 Chromium/Inspector CI 중 실패 원인을 수정하고 동일 SHA 3종 판정 → 승인받은 격리 DB 실증에서 진짜 RLS/권한/동시 요청 충돌 보완 → 관리자 보완·반려·승인 이력을 원문과 별도 변경불가 이벤트로 추가. 운영 적용 전 개인정보 처리근거/보관기한·원어민/Android·제품 소유자 최종 검수 필수.


## 8. 2026-11-22 — 관리자 검토·보완·독립 승인 원장 5차 (격리 SQL / 운영 미적용)

- **실제 신규 소스:** `supabase/proposals/psi_worker_risk_manager_review_l06_staging.sql`. L06 4차 `psi_worker_risk_submissions`와 P05 현장 배정 SQL에 의존하되, `supabase/migrations/`에는 편입하지 않았으며 실제 PSI-Database 스키마·근로자 계정·API·운영 기록은 변경하지 않는다.
- **원문 불변·검토 이력 분리:** `psi_worker_risk_review_events`는 기업/현장/제출ID·검토 순번·멱등 요청ID·작성 관리자·행동·판단 근거·서버 기록시각을 INSERT 전용으로 저장. Q1~Q5 원문과 접수 원장/검토 이벤트에 별도의 UPDATE/DELETE 차단 트리거를 제안했고 세 테이블에 일반 사용자 직접 쓰기/열람 허용 없음. PostgreSQL 최고권한자 수준의 조작까지 차단하는 외부 독립 해시 앵커는 **아직 미구현**.
- **검토 흐름:** 최초 `reviewed`→**다른 관리자**의 `approved` 또는 `request_changes`. `request_changes`는 즉시 보완요청 완료 상태로 종료되며 기존 원문을 덮어 쓰거나 같은 제출본을 다시 승인할 수 없다. 보완된 답변은 새로운 근로자 제출과 새 접수증으로 연결하는 모델은 **별도 후속**. 관리자 승인 자체는 **기록 검토 승인**일 뿐 작업허가, 위험 제거 입증, 교육이수, 작업중지 해제 승인으로 사용 금지.
- **권한·서명:** `psi_review_worker_risk_l06`은 `auth.uid()`와 실제 기업/현장/관리자 권한을 DB에서 확인. 기업 `owner/admin/reviewer` + 해당 활성 현장 소속/활성 현장 필수, 최종 `approved`는 `owner/admin`만 가능. 제출한 근로자와 동일 로그인은 거부하고 최초 검토자와 최종 승인자도 달라야 함. 신청자(브라우저) 주장 신원·역할은 인가 근거로 사용하지 않는다.
- **동시성·감사:** 원문 행 `FOR UPDATE` 잠금과 `expected_revision`으로 동일 제출의 검토 경쟁을 직렬화하며, `action_request_id` 중복에 대해 인자·검토자·검토 순번이 완전히 같을 때만 기존 접수증을 반환한다. 변경 재전송·확정 이후 재승인·오래된 순번을 거부한다. PostgreSQL 트랜잭션 밖 외부 전달이나 실제 동시 세션 부하 검증은 아직 완료되지 않음.
- **관리자 최소 조회:** `psi_read_worker_risk_review_l06`는 정확히 그 기업/현장의 활성 관리자로만 Q1~Q5 원문과 검토 이벤트를 제한된 JSON으로 반환. 답안 데이터에 이름·이메일은 포함하지 않고 `workClearanceGranted:false`를 고정 반환. 개인정보·실계정/모국어 원문 공개 허용 정책 확인과 법적 고지·보존기간 검수는 필수.
- **PostgreSQL 엔진 회귀:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts` 기존 격리 PGlite를 재사용해 전체 20개 테스트(4차 9개+5차 11개)로 두 기업 A/B·다른 현장/근로자/승인자·교차 읽기/쓰기·익명 차단, 2인 검토, 자기승인 거부, 이력 멱등/변조·수정/삭제 차단, 보완요청 종료, 계정 권한 철회, 접수 원문 보존, 감사 실패/과거 주기 종료 이후 검토를 확인한다. 새 SHA 전체 CI 최종 판정을 반드시 조회한다.
- **CI 기록:** 직전 `9e0d10a` 릴리스 #44984047297와 전사 Chromium #44984047259 **SUCCESS**, Inspector #44984047268은 후속 푸시로 CANCELLED. 5차 첫 SHA `12b2a65`에서 PGlite **18/20 PASS**, 조회 경로 2개가 `pg_catalog.coalesce` SQL 호환성 오류로 FAIL. `17dfbf9`에서 SQL 호출을 수정했다. 5차 최종 HEAD의 성공 결과는 실조회 전 **미확정**으로 유지.
- **출시 금지 조건:** 연결된 실제 Supabase `PSI-Database`의 P05 개별 현장 배정/평가주기/접수/검토 테이블은 도입 승인 및 실제 Auth/RLS/GRANT 검증이 완료되지 않음. 실제 관리자/근로자 계정 두 기업의 격리 검증, 권한 철회/재인증, 원문·민감정보 처리근거/보존 및 삭제, 현장 Android 실기기·한국어 외 11개 모국어 인수, 보완 재제출 링크·작업허가 분리·실무 UX 등은 미완료. L18 사용자 인수 13건 모두 pending, PR #237 Draft 유지, `main`·Production/운영 DB 변경 보류.

**다음 한 작업:** 신규 HEAD CI 3종 성공/실패를 같은 SHA로 검증 → 격리 승인 Supabase 테스트 환경에서 두 기업·현장·근로자 개인계정에 대한 실제 Auth/RLS/GRANT 및 서로 다른 관리자의 검토/승인을 검증 → 동일 근로자 보완 재제출 `original_submission_id` 연결과 관리자 보완·확인 UX (원문은 수정하지 않고 별도 이력) → 개인정보 정책/작업허가 분리·인적 검수 완료 전 운영 반영 금지.

## 9. 2026-11-22 — L06 7차 보완 재제출 immutable parent-link 제안

**현재 상태: STAGING SQL + 관리자 읽기전용 UI 컴포넌트 / 운영 미연결 / 실제 제출 불가.**

- 신규 `supabase/proposals/psi_worker_risk_resubmission_l06_staging.sql`은 기존 제출/관리자 검토 제안 뒤에만 적용하는 독립 SQL. `psi_worker_risk_resubmission_links`의 두 복합 외래키가 **동일 기업·현장·근로자·주기** 원본/새 제출 ID만 연결하도록 하고 원본 1건→교체본 최대 1건, 교체본 1건→원본 최대 1건을 강제. 원본·접수·검토 이력은 변경하지 않으며 관계 INSERT 후 UPDATE/DELETE까지 트리거로 방어한다(슈퍼유저 변경방지·독립 해시앵커는 아님).
- 인증된 작성자 `auth.uid()`가 기존 원본의 `account_user_id`와 일치하고 최신 관리자 검토가 **보완요청(`request_changes`)**일 때만 `psi_submit_worker_risk_revision_l06`이 새 Q1~Q5 원문을 기존 검증·원자적 접수 RPC로 제출할 수 있도록 **격리 SQL에서만 정의**. 새 데이터/링크가 하나의 트랜잭션에서 실패하면 모두 롤백. 동일 nonce와 동일 답안 재시도 외 다른 교체본을 거부한다. 작업허가·재개·위험 감소대책 실행확인과 완전히 분리.
- 관리자가 원본/보완본을 볼 때 `psi_read_worker_risk_revision_chain_l06`은 **기존 관리자 현장 권한 조회 RPC를 양쪽 원문에 두 번 적용**하여 권한 확대를 금지한다. `PsiRevisionEvidencePanelL06`의 Q1~Q5·Q3 이유·변경 표식은 읽기전용이며 실제 관리자 메뉴와 DB 호출은 연결하지 않았다.
- 검증: 기존 PostgreSQL 호환 PGlite 20건에 원본 연결, 교차접근 거부, 승인 후 보완 차단, 멱등·원자적 실패 롤백, 변경금지 5건을 확장. UI 독립 렌더·교차스코프·거짓 작업허가 차단 3건을 추가했다. **각 커밋과 동일한 최신 HEAD CI 전부 완료하기 전까지 PASS 미확정.**
- `supabase/migrations` 추가 없음. 운영 PSI-Database, OAuth/Auth 계정·GRANT·RLS 변경 없음. `/worker-risk-draft`는 한국어 무저장 시범 그대로. 진짜 근로자 인증, 보완 요청 전달/열람/고지, 실제 2개 기업 Auth/RLS, 관리자 비교 UX 통합, 재제출 처리근거·개인정보 보관·삭제, Android/11개 언어 및 L18 13개 현장 인수 게이트 미완료.
- 인계·상태·다음 작업: `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md` L06 7차. PR #237 Draft. main 병합, Production/실DB 변경은 최종 승인 전 금지.

**다음:** 최종 HEAD 자동 QA 재확인·실패 보완 → 변경승인 받은 격리 Supabase 2개 기업/현장/근로자·관리자 계정으로 Auth/RLS/GRANT·중복 경합 실검증 → 확인된 서버 자료만 이용하는 관리자 비교 화면 통합 → Android/원어민·법무/보존기한·현장 안전 승인.

## 10. 2026-11-22 — 8차: 보완요청 선행접수 재사용 거부·관리자 시각 QA

- 7차의 기록 연결 SQL에는 **보완요청 전에 별도로 접수한 문서를** 동일 요청번호로 불러와 보완본으로 연결할 여지가 있었음. `psi_submit_worker_risk_revision_l06`의 기존 parent/child 트랜잭션 및 권한 체크를 유지하면서 `request_changes.occurred_at` 이전 또는 동일 시점에 수신된 child 접수증을 거부하도록 원칙 강화. 해당 회귀 1건 추가(기존 25건 → 26건 목표).
- 관리자 읽기 UI `PsiRevisionEvidencePanelL06`을 개발 전용 `pages/PsiRevisionLabL06.tsx`에 **가상 Q1~Q5·보완요청 샘플**로 실제 마운트. 라벨·대조·다른 현장 자료 거부를 390/1280 Chromium에서 테스트하는 `scripts/verify-psi-l06-revision-lab.mjs`와 CI 스텝 추가. 정상/교차현장 거부 화면 증빙 4개 및 JSON. `/_dev/psi-l06-revisions`는 Vite **DEV 모드에서만** 표시; Production Vite Preview는 비제공 검증. 원본 컴포넌트의 실제 관리자 인증·업무 데이터 접속 능력은 여전히 없음.
- **운영 실DB/RPC/API/현장 개인정보·migrations 변경 0.** 실제 관리자 메뉴/권한 연결은 미실시. 승인받은 테스트 Supabase 2개 테넌트에 대한 Auth/RLS/GRANT, 서비스 토큰 유출 방지, 실계정 재인증·보관기한·Android/원어민 검수 후 별도 구현 가능. `main`/Vercel Production 유지, Draft PR #237, 13개 L18 사람 인수 전부 pending.
- **QA 상태:** 최종 HEAD 동일 SHA 릴리스·전사 Chromium·Inspector 브라우저 CI 완료 판정 전에는 PASS로 보고하지 않음. 검증 오류는 수정 후 새 HEAD 재판정.

**다음:** 8차 CI 3종·브라우저 결과 확인 → 격리 승인 Supabase 테스트환경 실제 보안 검증 → 인증된 읽기 데이터만 실관리자 화면에 연결할지 검토.

## 11. 2026-11-22 — 9차 SOURCE-ONLY 관리자 인증·권한 조회 계약과 원문 대조 UX

- `lib/server/workerRiskManagerReadL06.ts`: **실 API/DB 클라이언트가 없는** 서버용 의존성 주입 읽기 경계. 신뢰된 principal의 유효한 ID/만료, 독립 세션 활성 여부, 기업 owner/admin/reviewer 활성 소속, 기업/현장 일치·활성 소속, 활성 현장, 실제 DB 함수 자체 인가를 **별도로 요구하는** 읽기 포트. 어느 단계든 실패 시 `dataReleased:false`/오류코드만 반환. 로그인 세션을 브라우저 query/메타데이터에서 신뢰하지 않는다.
- 원본·보완본 JSON은 관리자 읽기 RPC의 **정해진 필드만 인정**. 근로자 이름/이메일·토큰 등 예상 외 필드를 추가한 결과, 교차기업/현장/근로자, 원본 ID/평가 양식/원문 등급 불일치, 위조 리뷰 상태·작성시점·원문 변경 및 `workClearanceGranted:true`이면 데이터 전체를 거부. 인가/출력 shape 테스트와 실제 Supabase RLS 실증은 **서로 다른 검증**이다.
- `tests/psiWorkerRiskManagerReadL06.test.ts` 신규 합성 검증 및 `PsiRevisionEvidencePanelL06` UI에서 변경 문항 필터, 동일 문항 복구, 신규 보완본의 검토 단계와 실제 현장 허가 분리. `scripts/verify-psi-l06-revision-lab.mjs`이 390px/1280px Chromium 브라우저에서 필터 전환도 검증.
- **운영 적용 여부:** 현재 source-only 실험. 테스트 port 성공은 DB 실제 로그인/GRANT/RLS/세션 철회·역할 검증 증명이 아니며 `psi_read_worker_risk_revision_chain_l06` 함수는 운영 DB에 존재하지 않는다. 근로자 Q1~Q5 정식 제출/API는 여전히 없음. 승인된 독립 Supabase 프로젝트·정책/처리근거·원어민/실기기 검증 전까지 운영 연결 금지.
- 최종 HEAD 릴리스·전사 Chromium·Inspector CI를 실조회한 뒤 성공/실패를 기록할 것. `main`/Vercel Production/운영 Supabase DDL·GRANT/RLS/개인정보 변경 0, PR #237 Draft, L18 사람 승인 13개 모두 pending.

**다음:** 최종 SHA 3종 QA 확인 → 승인된 2개 기업 격리 Supabase에서 진짜 Auth/RLS/세션 철회·현장 간 읽기 거부 검증 → 원문 열람 고지·보유기간·실관리자 UX 검수 후 운영 연결 승인 여부 검토.

## 12. 2026-11-22 — 10차: 실제 기록시각 기반 관리자 보완 이력 보기

- **대상 UI:** `PsiRevisionEvidencePanelL06.tsx`는 원본 접수시각, `request_changes` 검토 이벤트의 기록시각, 보완본 접수시각, 불변 연결 원장의 기록시각을 **별개의 4단계**로 보여주고, 보완본에 1차 검토/최종 승인/추가 보완요청 이력이 있다면 각각 해당 이벤트의 서버기록 시각을 추가 표시한다. 화면 표기만 `Asia/Seoul`로 변환하고 원본 UTC 값·원문은 보존한다.
- **거부하는 사례:** 서버기록시각 포맷/밀리초 불일치, 원본 접수 이후가 아닌 보완요청, 보완요청 이전의 재제출, 재제출 이전의 불변 링크(역순), 잘못된 새 검토 이벤트 정렬. 거부 시 관리자 화면에 원문과 타임라인 모두 표시하지 않는다. 실제 인증된 Supabase API·데이터 접근이 가능해진 것은 아니다.
- **사람의 안전판단 경계:** 시간순서·문구 변경·`approved`는 기록 검토 이력일 뿐 실제 감소대책 수행·재점검·작업중지 해제/작업 재개를 뜻하지 않는다. 즉시 조치가 어려운 현장에 ‘시각상 완료=위험 제거’ 판단을 하지 않는다.
- **검증:** React 합성 fixture와 독립 Chromium QA의 390/1280px 4개 원본시각, 가짜 보완본·교차현장 거부, 변경 문항 필터, Vite Production 경로 차단. 최종 HEAD 전체 CI 결론 전에는 통과 미확정. 실제 Android/11개 언어 원어민·Supabase Auth/RLS/법적 보관기간·13개 L18 현장 인수 별도.
- **운영:** SQL/RLS/GRANT/실DB·개인정보·정식 제출 API 변경 없음, PR #237 Draft, main/Production 사용자 승인 전 보류.

**다음:** CI 증빙 확정 → 승인된 별도 Supabase 환경에서 실제 계정/현장별 Auth/RLS·세션 철회/원본 조회 강제 검사 → 관리자 운영 UI 정식 연동 여부 검토.

## 13. 2026-11-22 — 11차: 관리자 원문 조회 중 권한철회·세션 만료 경합 차단

- **발견:** 기존 L06 관리자 SOURCE-ONLY read 계약은 원문 읽기 **이전**에만 활성 세션·기업 owner/admin/reviewer·현장배정·활성현장을 확인했다. 검사 이후 원문을 가져오는 동안 현장 배정이 취소되는 시점을 포착하지 못할 수 있었다.
- **개선:** `inspectL06ManagerRevisionRead`의 신뢰서버 시간 인자를 `clock: () => Date`로 명시하여 읽기 시작과 원문 검수 종료에 각각 현재시각을 독립 획득한다. 원문 방출 **직전** session-id 활성·JWT 만료·기업 관리자 역할/활성·현장배정/활성 및 현장상태를 재확인하고, 권한/시각 변화·인증 소스 오류가 있으면 `dataReleased:false`만 반환. 원문 유출/부분반환 없음. 실 서버 네트워크/DB/Auth 연결 자체는 하지 않는다.
- **합성 테스트:** `tests/psiWorkerRiskManagerReadL06.test.ts` 가상 데이터로 원문 조회 중 세션 철회, 기업 관리자 역할 정지, 현장배정 해제, 현장 비활성, 요청 도중 만료/시계 후퇴/시계 장애 및 최종 재인증 DB 예외를 검증. 종전 9개에서 **13개 목표**. 최신 HEAD 전체 CI 및 브라우저 QA 결과를 실제 확인하기 전에는 PASS 미확정.
- **운영 전 불가피한 잔여:** 순수 함수 재확인은 DB 트랜잭션의 원자적 권한·RLS·인증 세션 무효화 보증이 아니다. 실 운영에는 Supabase `auth.sessions`의 실제 `session_id` 철회 확인, 인가된 RPC의 role/현장 권한 검증, 응답 직전 경합·JWT 만료 처리에 대한 **서로 다른 기업 2개 이상** 실증이 선행돼야 한다. 연결된 프로젝트 목록에서 L06 전용 격리 테스트 승인은 확인되지 않았으므로 실제 DB/계정 변경 없음.
- **계속 보류:** L06 SQL은 `supabase/proposals`에만 남아 있고 migrations·실 운영 API·근로자 데이터·GRANT/RLS·Production·main 변경 없음. 출시 L18 사람 인수 13개 pending.

**다음:** 최종 SHA 3종 CI 확인 및 실패수정 → 안전하게 승인·격리된 Supabase 환경의 실제 Auth/RLS/session-id 동시 철회 검증 → 관리자 원문 실조회 API 연결 심사.

## 14. 2026-11-22 — 12차: 미배포 SQL의 관리자 세션 유효성·권한 행잠금

- **취약점 모형:** 단지 유효한 `auth.uid()`와 기업·현장 멤버십만으로는 이미 세션이 철회된 사용자의 미만료 JWT 원문 접근을 확실히 거부하지 못한다. 또한 관리자 읽기 중 기업/현장 소속 변경을 동일 RPC 안에서 직렬화해야 한다.
- **안전한 제안:** `supabase/proposals/psi_worker_risk_manager_review_l06_staging.sql`에 `psi_l06_require_active_session()` 보안정의 내부 helper. `auth.jwt()->>'session_id'`를 실제 `auth.sessions(id,user_id)`의 동일 사용자 행과 확인하고 `FOR KEY SHARE`로 잠근다. 직접 실행을 `PUBLIC/anon/authenticated/service_role`에서 모두 거부하며, 관리자 리뷰/원문 조회 함수 내부에서만 호출한다. 관리자 조회의 tenant/site 멤버십·활성 현장 `FOR SHARE`도 적용하여 같은 트랜잭션의 권한 변경 경합을 막도록 제안.
- **독립합성 시험:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`의 PGlite fixture는 허구의 2개 기업/계정만으로 `auth.sessions`와 JWT 함수의 최소 구조를 모사하고 세션 ID 누락·실제 행 삭제·다른 유저 세션 도용·원본과 보완본 동시조회 거부·잠금 정의를 검증한다. 합계 31개 대상(기존 26+신규 5). **최종 CI에서 검증되기 전에는 PASS 아님**.
- **구분:** 이 PGlite fixture는 Supabase Auth 서비스의 실명 로그인, JWT 서명검증, 세션 수명/폐기·운영 프로젝트의 `auth.sessions` 실제 스키마를 입증하지 않는다. Supabase 운영 RLS·GRANT·트랜잭션 잠금 동시성·서버 API 검증을 대체하지 않으며, 승인되지 않은 기존 두 프로젝트 어느 곳에도 실행하지 않았다.
- **업무 경계:** 원문/관리자 검토는 실 안전대책 이행 확인, 작업허가, 작업 재개, 위험 제거, 법정 교육이수와 분리. 정식 출시는 L18 13개 사람 승인, 개인정보 처리근거·원문 보관/삭제 및 Android·모국어 11개 언어 검수 필요. PR #237 Draft, main/Production/운영 DB 계속 차단.

**다음:** 동일 최종 SHA 릴리스·전사 Chromium·Inspector 모바일 3종 확인/오류 해결 → 승인된 격리 Supabase 실 Auth/RLS/세션/기업·현장 격리 증거 생성 → 정식 관리자 조회 연결 보안심사.

## 15. 2026-11-22 — 13차: 정지·soft-delete된 관리자 접근 차단

- `psi_l06_require_active_session()`의 실제 세션 존재 검사에 `auth.users` 계정의 `deleted_at IS NULL` 및 `banned_until` 만료 여부 확인을 추가했다. `auth.sessions sess`와 `auth.users u`를 **동일 RPC 트랜잭션에서 `FOR SHARE OF sess,u`**로 잠가 관리자 승인·원문조회 중 세션/계정 변경 경합을 방어하도록 **미배포 SQL 제안**을 수정했다.
- `tests/psiWorkerRiskSubmissionSqlL06.test.ts`: 가상 관리자 ban + session 유지, soft-delete + 원본·보완본 조회, ban 만료 시 복구, helper 직접 EXECUTE 불허 등 4개 합성 PGlite 케이스를 추가했다. 전체 L06 PGlite는 **35개 목표**(기존 31 + 신규 4). **최종 CI 성공 전 PASS로 표시하지 않음**.
- `docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md`에 **A01~A18 실제 인수 시나리오**를 명문화했다. 현재 모두 **NOT RUN**. 별도 승인된 신규 Supabase 프로젝트의 서명된 실제 로그인 JWT, 두 기업/현장 접근권한·RLS, session_id 로그아웃, ban/soft-delete, 두 독립 DB 커넥션에서 동시 잠금 경합을 시험하고 증빙을 남기도록 명시했다. 기존 연결 프로젝트 어느 곳에도 실행/쓰기하지 않는다.
- 승인된 격리 프로젝트 이전에는 실제 Supabase Auth·실계정·JWT/서비스키·GRANT/RLS/개인정보·관리자 API·main/Production 변경 없음. 실제 현장 작업허가/개선 조치 확인은 관리자 기록의 `approved` 상태와 별개의 업무다. Android/원어민 11개 언어, 개인정보 처리 및 L18 13개 사람 인수 계속 BLOCKED.

**다음:** 같은 13차 최종 HEAD 릴리스·전사 Chromium·Inspector QA 3종 판정 → 사용자 승인 후 격리 Supabase A01~A18 실증 → 보안 및 현장 인수 후에만 정식 연결 검토.
