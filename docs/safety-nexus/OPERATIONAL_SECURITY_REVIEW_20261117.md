# NEW-PSI Supabase 카탈로그 보안 검토 — 2026-11-17

## 범위와 판정

- 담당: KEEPER/PROOF 독립 읽기 전용 검토.
- 대상: Supabase 프로젝트 `dpnmslogvwuzmighsgnt`. 이 문서는 해당 프로젝트의 실제 배포 카탈로그를 조회한 결과다.
- 기준 소스: 검토 시작 시 로컬 HEAD `98efd6b`. 비교한 저장소 정의는 `supabase/migrations/20260930030000_tenant_education_release.sql`, `20260929000000_tenant_identity_foundation.sql`, `20261019120720_inspector_dedicated_foundation.sql` 등이다.
- 방법: Supabase connector `execute_sql`의 SELECT 및 `get_advisors(type=security)`. `pg_proc`, `pg_namespace`, `pg_class`, `pg_policies`, `pg_constraint`, `information_schema.column_privileges`, Inspector 버킷 설정만 조회했다. 근로자·회원·교육·사진·Storage object 행, 이메일, 공유 토큰, 키는 조회하지 않았다. 업무 RPC를 실행하거나 데이터·권한·정책을 변경하지 않았다.
- 판정: **검토한 정의에서 무권한 사용자에게 허용되는 경로를 발견하지 못했다. 다만 운영 보안 전체 PASS가 아닌 제한된 카탈로그 REVIEW다.** 아래 5개 경고는 의도적으로 권한을 부여한 RPC 표면이며, 자동으로 무시하거나 해결 처리하지 않았다.
- 연결 한계: Vercel 서버 환경변수 조회가 403으로 거절된 상태이므로 이 프로젝트가 운영 Inspector 서버의 실제 연결 DB라는 사실은 이 검토만으로 입증되지 않는다. 공개 클라이언트 URL 확인과 서버 연결 증거는 구분해야 한다.

## 실제 Advisor 결과

조회 결과에 포함된 관찰 시각은 `2026-11-17T02:06:32.319Z`다.

| 항목 | 실제 결과 | 해석 |
|---|---|---|
| authenticated SECURITY DEFINER | WARN, 5개 | 아래 함수별 권한·본문 검토 필요. 경고 해제하지 않음 |
| RLS enabled / no policy | INFO, 20개 | Inspector 7개 테이블은 브라우저 권한도 없어 서버 전용 설계와 일치. 나머지 13개는 이번 상세 검토 대상 아님 |
| public schema의 vector 확장 | WARN, 1개 | 잔여 권고. 의존성·이전 영향 확인 없이 확장 이동하지 않음 |

공식 조치 설명: [인증 사용자용 고권한 함수 경고](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [정책 없는 RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [public 확장](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).

## 인증 사용자용 고권한 함수 5개

공통 실측: `SECURITY DEFINER=true`, 소유자 `postgres`, `search_path=''`, `anon EXECUTE=false`, `authenticated EXECUTE=true`. ACL에는 postgres/authenticated/service_role만 있고 PUBLIC 실행 권한이 없다. SQL 본문은 스키마를 지정한 참조를 사용하며, 검토한 함수에 사용자 문자열로 조립하는 동적 SQL이나 user_metadata 기반 권한 판정은 없다.

| 함수 | 실제 접근 조건 및 보호 | 남는 검증 |
|---|---|---|
| `psi_link_worker_account` | 먼저 관리자 helper 검사. 동일 tenant의 active worker 확인. 이메일이 일치하는 확인 완료·미삭제·현재 차단되지 않은 계정이 정확히 하나인지 확인. 기존 연결은 revision 비교, 변경 후 이벤트 기록 | 관리자에 의한 실제 대상자 연결의 정확성·동의 및 운영 절차는 SQL만으로 증명 불가 |
| `psi_publish_tenant_education` | 관리자 검사, tenant+draft+revision 일치, 모든 대상 worker와 계정의 활성·확인 상태 검사. 1–168시간 제한. request ID 재사용 시 발행자/초안/revision/기간 일치 확인 | 실제 권한별 발행·동시 실행·재시도 검증은 수행하지 않음 |
| `psi_revoke_tenant_education` | 관리자 검사, tenant+release+expected revision+미취소 조건으로 갱신, 취소 이벤트 기록 | 기존 토큰·열린 화면의 취소 반영과 실제 공유 흐름은 미검증 |
| `psi_suspend_worker_account` | 관리자 검사, tenant+worker+expected revision+active 조건으로 연결 중지, 이벤트 기록 | 실제 계정 중지 후 클라이언트·세션 동작은 미검증 |
| `psi_read_worker_education` | bound account의 `user_id=auth.uid()`와 active 여부. 동일 tenant의 active worker, 확인 완료·미삭제·미차단 auth 계정 및 현재 이메일 일치. release/draft 대상자 포함, 현재 draft revision 일치, 미취소·미만료 release, 발행자의 active owner/admin 멤버십을 모두 요구. 조건 미충족 시 `42501` | 실제 A/B tenant 계정, 만료·취소·재연결·로그아웃 후 재사용의 동작 시험은 미실시 |

`psi_assert_education_manager`는 tenant와 `auth.uid()`가 일치하는 active owner/admin 멤버십을 `FOR SHARE`로 확인하고 없으면 `42501`을 발생시킨다. helper 자체의 ACL은 postgres/service_role뿐이며 anon/authenticated에게 직접 실행을 부여하지 않았다. 외부의 4개 변경 함수는 helper를 함수 소유자 권한으로 호출한다. 인증만 확인하는 구조가 아니라 DB 멤버십을 매 호출 시 검사한다.

이 검토는 고권한 함수를 일반 함수로 단순 변경해도 된다는 결론이 아니다. 필요한 내부 접근을 명시적으로 제한하는 구조지만 공개 API schema의 고권한 함수는 계속 검토 대상이다. [Supabase RLS 지침](https://supabase.com/docs/guides/database/postgres/row-level-security)의 권한·고권한 함수 경계를 참고하되, 비공개 schema/서버 전용 전환은 호출 계약과 별도 회귀 시험을 준비한 뒤 검토한다.

## 멤버십 및 tenant RLS

- `psi_tenant_memberships`는 RLS와 FORCE RLS가 모두 true. authenticated SELECT만 부여하며, `tenant_membership_self_read`는 `user_id=auth.uid()`이면서 active인 자신의 멤버십만 허용한다. anon SELECT=false이고 브라우저 INSERT/UPDATE/DELETE 테이블 권한 및 INSERT/UPDATE 열 권한은 없다.
- 실제 role CHECK 값은 `owner`, `admin`, `reviewer`, `viewer`; status는 `active`, `suspended`다. `(tenant_id,user_id)` 기본키가 있다. 근로자 제한 교육 접근은 직원 멤버십 역할이 아닌 별도 계정 연결과 위 읽기 RPC로 구현돼 있다.
- tenant별 근로자/조치/초안/교육발행·이력 SELECT 정책은 행의 tenant와 같은 active 멤버십을 요구한다. 계정 연결 및 연결 이력 SELECT는 같은 tenant의 owner/admin으로 더 제한한다.
- 테이블 권한 조회만으로 쓰기가 전부 차단됐다고 판정하면 안 된다. 실제 authenticated **열 단위** 권한은 actions INSERT 6열/UPDATE 6열, training_drafts INSERT 6열/UPDATE 4열, workers INSERT 6열/UPDATE 3열이다. 이 경로에는 역할 제한 RLS가 존재한다. workers는 owner/admin, actions와 drafts는 owner/admin/reviewer 조건이며 UPDATE는 USING과 WITH CHECK를 모두 둔다.
- membership 데이터 자체, 실제 직원·근로자 배정, 다른 함수 전체의 멤버십 변경 가능성, 서비스 키 유출 여부는 이번 범위에서 검증하지 않았다. 직원 viewer가 동일 tenant의 업무 자료를 읽는 정책이 운영 조직의 최소권한 요구에 맞는지도 별도 확인이 필요하다.

## Inspector 테이블 및 Storage

`psi_inspector_controls`, `events`, `evidence`, `inspections`, `operations`, `reports`, `shares` 7개 테이블은 모두 RLS/FORCE RLS true, 정책 없음, anon/authenticated SELECT=false이며 브라우저 쓰기 테이블·열 권한도 확인되지 않았다. 카탈로그상 일반 클라이언트 직접 접근을 막는 서버 전용 경계다. 서버 service_role 경로의 인증·현장 범위 검사를 대신 증명하지는 않는다.

Inspector 버킷 `psi-inspector-evidence`는 실제 `public=false`, 파일 한도 3,145,728바이트(3MiB), 허용 MIME `image/jpeg`, `image/png`, `image/webp`다.

`storage.objects`는 RLS=true. 테이블 자체에는 일반 역할의 권한이 있지만 `inspector_evidence_browser_deny`가 **RESTRICTIVE**, `FOR ALL TO anon,authenticated`, USING 및 WITH CHECK 모두 `bucket_id <> 'psi-inspector-evidence'`다. 따라서 다른 PERMISSIVE 정책을 통한 허용과 별개로 이 버킷의 브라우저 접근을 제한한다. 단순히 정책 이름에 deny가 있다는 이유로 판정하지 않고 실제 RESTRICTIVE 속성을 확인했다.

추가로 `psi_training_audio_server_boundary`도 RESTRICTIVE이며 Inspector 경계와 충돌하지 않는다. signatures용 허용 INSERT 정책은 다른 버킷 한정이다. 사진 원본/썸네일 삭제, signed URL 발급·유효기간·취소, 메타데이터 정리, 백업 복구 및 서비스 역할 API의 실제 우회 시도는 하지 않았다. 이 항목들은 P0 사진 보호·복구 검증의 잔여 과제다.

## 조회 재현 범위

실행한 SELECT는 다음 카탈로그 항목으로 제한했다. 복수 SELECT를 한 요청으로 보내면 connector가 마지막 결과만 반환하므로, 최종 근거는 각 항목을 별도 요청해 확인했다.

```sql
-- 함수 5개와 helper: 정의, ACL, 소유자, search_path, 역할별 EXECUTE
select p.proname, p.prosecdef, p.proconfig, p.proacl,
       pg_get_userbyid(p.proowner), pg_get_functiondef(p.oid),
       has_function_privilege('anon',p.oid,'EXECUTE'),
       has_function_privilege('authenticated',p.oid,'EXECUTE')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('psi_link_worker_account','psi_publish_tenant_education',
  'psi_read_worker_education','psi_revoke_tenant_education',
  'psi_suspend_worker_account','psi_assert_education_manager');

-- 정책 본문과 결합 방식; object 내용은 조회하지 않음
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='storage' or
 (schemaname='public' and (tablename like 'psi_tenant_%' or tablename like 'psi_inspector_%'));

-- 버킷 설정만, 사진 경로나 사용자 객체는 조회하지 않음
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets
where id ilike '%inspector%' or name ilike '%inspector%';
```

추가 SELECT: 같은 테이블 범위의 `pg_class.relrowsecurity/relforcerowsecurity/relacl`, `has_table_privilege`, 브라우저 역할의 `information_schema.column_privileges` 쓰기 권한 개수, membership의 `pg_get_constraintdef`.

## 다음 검증과 완료로 표시하지 않은 항목

1. Vercel 운영 서버가 이 프로젝트를 실제 사용하는지 값 노출 없이 연결 증거 확보.
2. 운영 데이터 대신 별도 합성 tenant/account로 비회원·다른 tenant·viewer/reviewer·정지 사용자·만료/취소 release 권한 시험.
3. 역할 변경과 계정 차단, 로그아웃/세션 폐기 후 남은 JWT의 민감 작업 허용 범위 확인. 이번 함수가 `auth.sessions`의 세션 생존을 직접 검사하지 않는다는 점을 고려한다.
4. Inspector 서버 인증과 전용 설치 범위, 공유·사진 삭제·Storage 복원 경로의 종단 검증.
5. vector 확장 WARN의 의존성 검토. 이번 검토는 경고를 숨기기 위한 스키마 이동이나 권한 완화를 수행하지 않았다.

이 문서는 특정 시점의 읽기 전용 검토 증거이며 로그인 비밀번호 복구, 운영 DB 전체 보안 완료, 전체 기획서 완료 또는 실제 현장 시험 통과를 뜻하지 않는다.
