-- PSI Record Master Group Compatibility Migration (2026-03-18)
-- 목적:
-- 1) 기존 company 용어를 group 용어로 단계 전환
-- 2) 현재 운영 코드를 깨지 않고 점진 전환 가능하게 호환 레이어 제공

begin;

-- 1) assignments에 group_id 병행 컬럼 추가 (기존 company_id와 동일한 의미)
alter table public.record_master_assignments
    add column if not exists group_id uuid;

update public.record_master_assignments
set group_id = company_id
where group_id is null;

alter table public.record_master_assignments
    alter column group_id set not null;

-- FK/인덱스/유니크 제약 (이름만 group 기준으로 추가)
alter table public.record_master_assignments
    drop constraint if exists record_master_assignments_group_id_fkey;

alter table public.record_master_assignments
    add constraint record_master_assignments_group_id_fkey
    foreign key (group_id) references public.record_master_companies(id) on delete cascade;

create index if not exists record_master_assignments_group_idx
    on public.record_master_assignments (group_id);

create unique index if not exists record_master_assignments_group_template_uidx
    on public.record_master_assignments (group_id, template_id);

-- 2) company_id <-> group_id 동기화 트리거 (양쪽 코드 모두 허용)
create or replace function public.sync_record_master_assignment_group_company_ids()
returns trigger
language plpgsql
as $$
begin
    if new.group_id is null and new.company_id is not null then
        new.group_id := new.company_id;
    elsif new.company_id is null and new.group_id is not null then
        new.company_id := new.group_id;
    elsif new.group_id is not null and new.company_id is not null and new.group_id <> new.company_id then
        -- group_id를 우선 기준으로 통일
        new.company_id := new.group_id;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_record_master_assignments_sync_group_company
    on public.record_master_assignments;

create trigger trg_record_master_assignments_sync_group_company
before insert or update on public.record_master_assignments
for each row
execute function public.sync_record_master_assignment_group_company_ids();

-- 3) group 용어 뷰 제공 (점진적 코드 전환용)
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

-- 점검 쿼리 (선택)
-- select count(*) as total, count(group_id) as group_id_filled from public.record_master_assignments;
-- select id, company_id, group_id from public.record_master_assignments order by updated_at desc limit 10;
