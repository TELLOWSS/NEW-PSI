-- PSI Record Master Template Migration (2026-03-17)
-- 목적:
-- - 기록 데이터 마스터 템플릿/업체/매핑 정보를 Supabase에서 중앙 관리
-- - 템플릿 정의 + 업체별 연결(CRUD) 구조를 DB 기반으로 전환

begin;

create table if not exists public.record_master_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    version text not null,
    field_schema text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists record_master_templates_updated_idx
    on public.record_master_templates (updated_at desc);

create table if not exists public.record_master_companies (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists record_master_companies_name_lower_uidx
    on public.record_master_companies (lower(name));

create index if not exists record_master_companies_updated_idx
    on public.record_master_companies (updated_at desc);

create table if not exists public.record_master_assignments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.record_master_companies(id) on delete cascade,
    template_id uuid not null references public.record_master_templates(id) on delete cascade,
    status text not null default 'active' check (status in ('active', 'inactive')),
    effective_date date not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (company_id, template_id)
);

create index if not exists record_master_assignments_company_idx
    on public.record_master_assignments (company_id);

create index if not exists record_master_assignments_template_idx
    on public.record_master_assignments (template_id);

create index if not exists record_master_assignments_updated_idx
    on public.record_master_assignments (updated_at desc);

create or replace function public.set_record_master_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_record_master_templates_updated_at on public.record_master_templates;
create trigger trg_record_master_templates_updated_at
before update on public.record_master_templates
for each row
execute function public.set_record_master_updated_at();

drop trigger if exists trg_record_master_companies_updated_at on public.record_master_companies;
create trigger trg_record_master_companies_updated_at
before update on public.record_master_companies
for each row
execute function public.set_record_master_updated_at();

drop trigger if exists trg_record_master_assignments_updated_at on public.record_master_assignments;
create trigger trg_record_master_assignments_updated_at
before update on public.record_master_assignments
for each row
execute function public.set_record_master_updated_at();

alter table public.record_master_templates enable row level security;
alter table public.record_master_companies enable row level security;
alter table public.record_master_assignments enable row level security;

drop policy if exists record_master_templates_select on public.record_master_templates;
drop policy if exists record_master_templates_insert on public.record_master_templates;
drop policy if exists record_master_templates_update on public.record_master_templates;
drop policy if exists record_master_templates_delete on public.record_master_templates;

create policy record_master_templates_select
on public.record_master_templates
for select
to anon, authenticated
using (public.psi_is_admin_request());

create policy record_master_templates_insert
on public.record_master_templates
for insert
to anon, authenticated
with check (public.psi_is_admin_request());

create policy record_master_templates_update
on public.record_master_templates
for update
to anon, authenticated
using (public.psi_is_admin_request())
with check (public.psi_is_admin_request());

create policy record_master_templates_delete
on public.record_master_templates
for delete
to anon, authenticated
using (public.psi_is_admin_request());

drop policy if exists record_master_companies_select on public.record_master_companies;
drop policy if exists record_master_companies_insert on public.record_master_companies;
drop policy if exists record_master_companies_update on public.record_master_companies;
drop policy if exists record_master_companies_delete on public.record_master_companies;

create policy record_master_companies_select
on public.record_master_companies
for select
to anon, authenticated
using (public.psi_is_admin_request());

create policy record_master_companies_insert
on public.record_master_companies
for insert
to anon, authenticated
with check (public.psi_is_admin_request());

create policy record_master_companies_update
on public.record_master_companies
for update
to anon, authenticated
using (public.psi_is_admin_request())
with check (public.psi_is_admin_request());

create policy record_master_companies_delete
on public.record_master_companies
for delete
to anon, authenticated
using (public.psi_is_admin_request());

drop policy if exists record_master_assignments_select on public.record_master_assignments;
drop policy if exists record_master_assignments_insert on public.record_master_assignments;
drop policy if exists record_master_assignments_update on public.record_master_assignments;
drop policy if exists record_master_assignments_delete on public.record_master_assignments;

create policy record_master_assignments_select
on public.record_master_assignments
for select
to anon, authenticated
using (public.psi_is_admin_request());

create policy record_master_assignments_insert
on public.record_master_assignments
for insert
to anon, authenticated
with check (public.psi_is_admin_request());

create policy record_master_assignments_update
on public.record_master_assignments
for update
to anon, authenticated
using (public.psi_is_admin_request())
with check (public.psi_is_admin_request());

create policy record_master_assignments_delete
on public.record_master_assignments
for delete
to anon, authenticated
using (public.psi_is_admin_request());

commit;

-- 빠른 점검 쿼리 (선택)
-- select count(*) as template_count from public.record_master_templates;
-- select count(*) as company_count from public.record_master_companies;
-- select count(*) as assignment_count from public.record_master_assignments;

-- 샘플 입력 (선택)
-- insert into public.record_master_templates (name, version, field_schema)
-- values ('위험성평가 전파교육 기본형', 'v1.0.0', '이름, 근로자ID(worker_id), 국적, 공종, 위험요인, 통제조치, 확인서명');
