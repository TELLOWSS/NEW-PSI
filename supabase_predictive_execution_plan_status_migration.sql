-- Predictive Execution Plan Status Migration (2026-04-02)
-- 목적:
-- - 예측적 안전관리 실행 계획 상태(미착수/진행중/완료)를 팀 공유 가능하도록 DB 영속화
-- - 공종/팀 단위 조치율 집계를 위한 메타 컬럼 저장
-- 전제:
-- - public.psi_is_admin_request() 함수가 이미 존재해야 함

begin;

create table if not exists public.predictive_execution_plan_statuses (
    id uuid primary key default gen_random_uuid(),
    board_scope text not null,
    plan_key text not null,
    status text not null check (status in ('not-started', 'in-progress', 'completed')),
    updated_by text,
    worker_name text,
    job_field text,
    team_leader text,
    risk_label text,
    action_title text,
    due_label text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (board_scope, plan_key)
);

create table if not exists public.predictive_execution_plan_status_logs (
    id uuid primary key default gen_random_uuid(),
    board_scope text not null,
    plan_key text not null,
    status text not null check (status in ('not-started', 'in-progress', 'completed')),
    previous_status text check (previous_status in ('not-started', 'in-progress', 'completed')),
    updated_by text,
    worker_name text,
    job_field text,
    team_leader text,
    risk_label text,
    action_title text,
    due_label text,
    created_at timestamptz not null default now()
);

alter table public.predictive_execution_plan_statuses
    add column if not exists updated_by text;

alter table public.predictive_execution_plan_status_logs
    add column if not exists previous_status text
        check (previous_status in ('not-started', 'in-progress', 'completed'));

create index if not exists predictive_plan_status_board_scope_idx
    on public.predictive_execution_plan_statuses (board_scope, updated_at desc);

create index if not exists predictive_plan_status_logs_scope_plan_idx
    on public.predictive_execution_plan_status_logs (board_scope, plan_key, created_at desc);

create index if not exists predictive_plan_status_job_team_idx
    on public.predictive_execution_plan_statuses (board_scope, job_field, team_leader);

create or replace function public.set_predictive_plan_status_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_predictive_plan_status_updated_at on public.predictive_execution_plan_statuses;
create trigger trg_predictive_plan_status_updated_at
before update on public.predictive_execution_plan_statuses
for each row
execute function public.set_predictive_plan_status_updated_at();

alter table public.predictive_execution_plan_statuses enable row level security;
alter table public.predictive_execution_plan_status_logs enable row level security;

drop policy if exists predictive_plan_status_select_admin_only on public.predictive_execution_plan_statuses;
drop policy if exists predictive_plan_status_insert_admin_only on public.predictive_execution_plan_statuses;
drop policy if exists predictive_plan_status_update_admin_only on public.predictive_execution_plan_statuses;
drop policy if exists predictive_plan_status_delete_admin_only on public.predictive_execution_plan_statuses;
drop policy if exists predictive_plan_status_logs_select_admin_only on public.predictive_execution_plan_status_logs;
drop policy if exists predictive_plan_status_logs_insert_admin_only on public.predictive_execution_plan_status_logs;
drop policy if exists predictive_plan_status_logs_update_admin_only on public.predictive_execution_plan_status_logs;
drop policy if exists predictive_plan_status_logs_delete_admin_only on public.predictive_execution_plan_status_logs;

create policy predictive_plan_status_select_admin_only
on public.predictive_execution_plan_statuses
for select
to authenticated
using (
    public.psi_is_admin_request()
);

create policy predictive_plan_status_insert_admin_only
on public.predictive_execution_plan_statuses
for insert
to authenticated
with check (
    public.psi_is_admin_request()
);

create policy predictive_plan_status_update_admin_only
on public.predictive_execution_plan_statuses
for update
to authenticated
using (
    public.psi_is_admin_request()
)
with check (
    public.psi_is_admin_request()
);

create policy predictive_plan_status_delete_admin_only
on public.predictive_execution_plan_statuses
for delete
to authenticated
using (
    public.psi_is_admin_request()
);

create policy predictive_plan_status_logs_select_admin_only
on public.predictive_execution_plan_status_logs
for select
to authenticated
using (
    public.psi_is_admin_request()
);

create policy predictive_plan_status_logs_insert_admin_only
on public.predictive_execution_plan_status_logs
for insert
to authenticated
with check (
    public.psi_is_admin_request()
);

create policy predictive_plan_status_logs_update_admin_only
on public.predictive_execution_plan_status_logs
for update
to authenticated
using (
    public.psi_is_admin_request()
)
with check (
    public.psi_is_admin_request()
);

create policy predictive_plan_status_logs_delete_admin_only
on public.predictive_execution_plan_status_logs
for delete
to authenticated
using (
    public.psi_is_admin_request()
);

commit;

-- 빠른 점검 쿼리 (선택)
-- select board_scope, status, count(*)
-- from public.predictive_execution_plan_statuses
-- group by board_scope, status
-- order by board_scope desc, status;
