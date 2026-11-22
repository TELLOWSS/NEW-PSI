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
