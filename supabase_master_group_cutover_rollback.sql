-- PSI Record Master Group Final Cutover Rollback (2026-03-18)
-- 목적:
-- - final cutover 이후 이상 징후 발생 시 즉시 호환 모드(company 중심)로 복귀

begin;

-- 1) 레거시 compatibility view 제거 (있을 때만)
drop view if exists public.record_master_companies;

-- 2) groups -> companies 테이블명 되돌리기
alter table if exists public.record_master_groups rename to record_master_companies;

-- 3) 인덱스/트리거 이름 되돌리기 (존재 시)
alter index if exists public.record_master_groups_name_lower_uidx rename to record_master_companies_name_lower_uidx;
alter index if exists public.record_master_groups_updated_idx rename to record_master_companies_updated_idx;

DO $$
BEGIN
    if exists (
        select 1 from pg_trigger
        where tgname = 'trg_record_master_groups_updated_at'
          and tgrelid = 'public.record_master_companies'::regclass
    ) then
        alter trigger trg_record_master_groups_updated_at on public.record_master_companies
            rename to trg_record_master_companies_updated_at;
    end if;
END $$;

-- 4) assignments FK를 companies 기준으로 재연결
alter table public.record_master_assignments
    drop constraint if exists record_master_assignments_group_id_fkey;

alter table public.record_master_assignments
    add constraint record_master_assignments_group_id_fkey
    foreign key (group_id) references public.record_master_companies(id) on delete cascade;

-- 5) group 뷰 재생성
create or replace view public.record_master_groups as
select
    id,
    name,
    created_at,
    updated_at
from public.record_master_companies;

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
