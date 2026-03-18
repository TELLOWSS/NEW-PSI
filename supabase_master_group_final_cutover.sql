-- PSI Record Master Group Final Cutover (Draft) (2026-03-18)
-- 목적:
-- - company 용어를 DB 객체명에서 제거하고 group 용어로 최종 전환
-- - 기존 코드 호환을 위해 최소한의 compatibility view 유지
--
-- 선행 조건:
-- 1) supabase_master_template_migration.sql 적용 완료
-- 2) supabase_master_group_compat_migration.sql 적용 완료
-- 3) supabase_master_group_postcheck.sql에서 mismatch_rows = 0 확인

begin;

-- 0) 안전 점검: group_id 누락/불일치가 있으면 중단
DO $$
DECLARE
    v_missing_count bigint;
    v_mismatch_count bigint;
BEGIN
    select count(*) into v_missing_count
    from public.record_master_assignments
    where group_id is null;

    select count(*) into v_mismatch_count
    from public.record_master_assignments
    where group_id is not null and company_id is not null and group_id <> company_id;

    if v_missing_count > 0 then
        raise exception 'Cutover blocked: group_id is null in % rows', v_missing_count;
    end if;

    if v_mismatch_count > 0 then
        raise exception 'Cutover blocked: company_id/group_id mismatch in % rows', v_mismatch_count;
    end if;
END $$;

-- 1) 기존 group 뷰 제거 (테이블명으로 사용 예정)
drop view if exists public.record_master_groups;

-- 2) companies 테이블을 groups로 rename
alter table public.record_master_companies rename to record_master_groups;

-- 3) 이름 기반 인덱스/트리거 명칭 정리 (객체명 가독성 개선)
alter index if exists public.record_master_companies_name_lower_uidx rename to record_master_groups_name_lower_uidx;
alter index if exists public.record_master_companies_updated_idx rename to record_master_groups_updated_idx;

-- trigger 이름 변경
DO $$
BEGIN
    if exists (
        select 1 from pg_trigger
        where tgname = 'trg_record_master_companies_updated_at'
          and tgrelid = 'public.record_master_groups'::regclass
    ) then
        alter trigger trg_record_master_companies_updated_at on public.record_master_groups
            rename to trg_record_master_groups_updated_at;
    end if;
END $$;

-- 4) assignments FK를 groups 테이블 기준으로 재연결
alter table public.record_master_assignments
    drop constraint if exists record_master_assignments_group_id_fkey;

alter table public.record_master_assignments
    add constraint record_master_assignments_group_id_fkey
    foreign key (group_id) references public.record_master_groups(id) on delete cascade;

-- 5) company_id 기반 레거시 FK 제거 (컬럼은 호환용으로 임시 유지)
alter table public.record_master_assignments
    drop constraint if exists record_master_assignments_company_id_fkey;

-- 6) compatibility view: 레거시 코드가 record_master_companies를 읽어도 동작하게 유지
create or replace view public.record_master_companies as
select
    id,
    name,
    created_at,
    updated_at
from public.record_master_groups;

-- 7) assignment group view 재생성 (혹시 의존성으로 드랍된 경우 대비)
create or replace view public.record_master_assignment_groups as
select
    id,
    group_id,
    template_id,
    status,
    effective_date,
    created_at,
    updated_at
from public.record_master_assignments;

commit;

-- 후속 권장(수동):
-- - 코드에서 company_id 폴백 제거
-- - 충분한 안정화 후 record_master_assignments.company_id 컬럼 제거
-- - company_id 관련 인덱스/온컨플릭트 경로 제거
