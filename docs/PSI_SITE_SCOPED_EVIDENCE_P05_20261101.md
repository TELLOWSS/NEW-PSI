# NEW-PSI 13차 · P05 현장별 원본/제출검토 경계

## 구현 범위
이번 단계는 **운영 적용 전 격리 PostgreSQL용 제안 SQL**과 보안 회귀 테스트이다. 기존 사이트별 데이터가 전혀 없다는 전제에서만 수행 가능하며, 실제 DB 변경·근로자 자료 이관은 하지 않았다.

- `psi_tenant_sites`: 기업(tenant_id) 아래 현장(site_id) 등록부
- `psi_tenant_site_memberships`: 본인 기업 소속 + 담당 현장 권한이 모두 활성인 경우만 접근 가능
- `psi_tenant_site_worker_assignments`: 근로자와 현장을 연결하는 복합 FK. 다른 현장 근로자의 원본 첨부를 차단
- 원본 접수 `psi_tenant_evidence_receipts`, 제출안 `psi_tenant_disclosure_requests`, 검토 결정 `psi_tenant_disclosure_decisions`에 필수 `site_id`와 **RESTRICTIVE RLS**를 추가한다.
- 기존 기업 단위 허용 정책과 현장 단위 제한 정책은 논리적 AND가 돼야 한다. 기업 owner/admin이라도 담당 현장에 명시적으로 포함되지 않으면 열람할 수 없게 설계했다.
- 제출 결정은 동일 현장의 검토 요청만 참조할 수 있다. 기존 12차 **작성자와 승인자가 달라야 한다는 규칙**도 유지한다.

## 선행조건·실제 운영 범위
- 이 구현은 `supabase/proposals/psi_tenant_site_memberships_staging.sql`, `psi_site_worker_read_policy_staging.sql`, `psi_tenant_site_evidence_scope_staging.sql`의 순서가 중요하다.
- 뒤의 scope SQL은 기존 증빙 또는 검토 요청/결정 행이 1건이라도 존재하면 **오류를 발생시켜 적용을 중단**한다. 과거 자료에 임의 site_id를 부여하지 않는다.
- 위 SQL은 `supabase/migrations`에 위치하지 않는다. **운영 데이터베이스에 적용하지 않는다.**
- 아직 신규 기업별 원본 접수 API는 기업 단위 인증 인터페이스만 구현돼 있다. 사이트 ID를 인증해서 저장하는 API 연결은 **미구현**이다. 새 필수 필드 때문에 활성화 후 기존 기업만 사용하는 요청을 그대로 보내면 거부돼야 한다.
- 기존 일반 WorkerRecord/교육/조치/보고서·파일 백업 등은 **아직 site_id/RLS 대상이 아니다**. 이 작업만으로 NEW-PSI 전체가 현장별 완전 분리된 것이 아니다.
- 운영 신뢰 증빙, 제출용 최소화/비식별화, 최종 결재/반출, 개인정보 보존 정책은 각각 별도 우선과제다.

## 테스트
PGlite에 가상 두 현장과 계정을 만들어 같은 기업 내 다른 현장의 원본 보이지 않기, 다른 현장 근로자의 파일 오등록 거부, 다른 현장 검토결정 거부, 담당 현장 소속 정지 후 접근 차단을 검사한다.

## 단계 상태
P05: **현장별 접수·검토 테이블 격리 SQL/검증 기반 구현(운영 미적용)**.
P00: 신규 Vercel 운영 배포는 빌드 사용량 제한으로 별도 확인 필요.
P03/P04: 최초 수신 원장 시범, 운영 DB 미적용.
P12: 11차 로컬 검토 기능과 12차 작성자·독립 승인 SQL 기반. 실제 제출/승인 서비스는 미완료.
