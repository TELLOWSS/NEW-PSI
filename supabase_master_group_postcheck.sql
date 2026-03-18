-- PSI Record Master Group Post-Check (2026-03-18)
-- 목적: group 전환 마이그레이션 적용 후 상태를 한 번에 점검

-- 1) 핵심 객체 존재 확인
select 'table.record_master_templates' as object, to_regclass('public.record_master_templates') is not null as exists
union all
select 'table.record_master_companies', to_regclass('public.record_master_companies') is not null
union all
select 'table.record_master_assignments', to_regclass('public.record_master_assignments') is not null
union all
select 'view.record_master_groups', to_regclass('public.record_master_groups') is not null
union all
select 'view.record_master_assignment_groups', to_regclass('public.record_master_assignment_groups') is not null;

-- 2) 컬럼 존재 확인
select
    exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'record_master_assignments'
          and column_name = 'group_id'
    ) as has_group_id,
    exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'record_master_assignments'
          and column_name = 'company_id'
    ) as has_company_id;

-- 3) 데이터 무결성 점검
select
    count(*) as total_rows,
    count(*) filter (where group_id is null) as null_group_id_rows,
    count(*) filter (where company_id is null) as null_company_id_rows,
    count(*) filter (where group_id is not null and company_id is not null and group_id <> company_id) as mismatch_rows
from public.record_master_assignments;

-- 4) 중복 배정 점검 (group_id + template_id)
select
    group_id,
    template_id,
    count(*) as duplicate_count
from public.record_master_assignments
group by group_id, template_id
having count(*) > 1
order by duplicate_count desc;

-- 5) 트리거 존재 여부
select
    tgname as trigger_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = 'public.record_master_assignments'::regclass
  and not tgisinternal
  and tgname = 'trg_record_master_assignments_sync_group_company';

-- 6) 샘플 데이터 확인
select
    id,
    company_id,
    group_id,
    template_id,
    status,
    effective_date,
    updated_at
from public.record_master_assignments
order by updated_at desc
limit 20;
