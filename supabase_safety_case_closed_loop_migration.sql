-- PSI Safety Case Closed Loop Migration (2026-06-22)
-- 위험 발견 → 조치 → 리포트 → 교육 → 서명 → 재평가를 공통 case_id로 연결한다.

begin;

create table if not exists public.safety_cases (
    case_id text primary key,
    source_plan_key text not null,
    source_record_id text,
    worker_id text,
    worker_name text not null,
    job_field text not null,
    team_leader text,
    risk_label text not null,
    action_title text not null,
    owner_name text,
    due_label text,
    due_at timestamptz,
    status text not null default 'open' check (
        status in (
            'open',
            'action-in-progress',
            'awaiting-report',
            'awaiting-training',
            'awaiting-acknowledgement',
            'awaiting-reassessment',
            'closed'
        )
    ),
    completed_stages jsonb not null default '{}'::jsonb,
    training_session_id text,
    reassessment_record_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.safety_case_events (
    event_id text primary key,
    case_id text not null references public.safety_cases(case_id) on delete cascade,
    stage text not null check (
        stage in ('detected', 'action', 'report', 'training', 'acknowledgement', 'reassessment')
    ),
    occurred_at timestamptz not null,
    actor text not null,
    note text not null,
    evidence_id text,
    created_at timestamptz not null default now()
);

create index if not exists safety_cases_worker_status_idx
    on public.safety_cases (worker_id, status, updated_at desc);

create index if not exists safety_cases_due_open_idx
    on public.safety_cases (due_at, status)
    where status <> 'closed';

create index if not exists safety_case_events_case_time_idx
    on public.safety_case_events (case_id, occurred_at asc);

create or replace function public.set_safety_case_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_safety_case_updated_at on public.safety_cases;
create trigger trg_safety_case_updated_at
before update on public.safety_cases
for each row execute function public.set_safety_case_updated_at();

alter table public.safety_cases enable row level security;
alter table public.safety_case_events enable row level security;

drop policy if exists safety_cases_admin_select on public.safety_cases;
drop policy if exists safety_cases_admin_insert on public.safety_cases;
drop policy if exists safety_cases_admin_update on public.safety_cases;
drop policy if exists safety_cases_admin_delete on public.safety_cases;
drop policy if exists safety_case_events_admin_select on public.safety_case_events;
drop policy if exists safety_case_events_admin_insert on public.safety_case_events;
drop policy if exists safety_case_events_admin_delete on public.safety_case_events;

create policy safety_cases_admin_select on public.safety_cases
for select to anon, authenticated
using (public.psi_is_admin_request());

create policy safety_cases_admin_insert on public.safety_cases
for insert to anon, authenticated
with check (public.psi_is_admin_request());

create policy safety_cases_admin_update on public.safety_cases
for update to anon, authenticated
using (public.psi_is_admin_request())
with check (public.psi_is_admin_request());

create policy safety_cases_admin_delete on public.safety_cases
for delete to anon, authenticated
using (public.psi_is_admin_request());

create policy safety_case_events_admin_select on public.safety_case_events
for select to anon, authenticated
using (public.psi_is_admin_request());

create policy safety_case_events_admin_insert on public.safety_case_events
for insert to anon, authenticated
with check (public.psi_is_admin_request());

create policy safety_case_events_admin_delete on public.safety_case_events
for delete to anon, authenticated
using (public.psi_is_admin_request());

alter table if exists public.predictive_execution_plan_statuses
    add column if not exists case_id text;
alter table if exists public.predictive_execution_plan_status_logs
    add column if not exists case_id text;
alter table if exists public.training_sessions
    add column if not exists case_id text;
alter table if exists public.training_logs
    add column if not exists case_id text;
alter table if exists public.training_acknowledgements
    add column if not exists case_id text;

create index if not exists predictive_plan_status_case_idx
    on public.predictive_execution_plan_statuses (case_id)
    where case_id is not null;
create index if not exists training_sessions_case_idx
    on public.training_sessions (case_id)
    where case_id is not null;
create index if not exists training_logs_case_idx
    on public.training_logs (case_id)
    where case_id is not null;
create index if not exists training_ack_case_idx
    on public.training_acknowledgements (case_id)
    where case_id is not null;

commit;

-- 적용 확인
-- select case_id, worker_name, status, due_at, completed_stages
-- from public.safety_cases order by updated_at desc limit 20;
-- select case_id, stage, actor, occurred_at, evidence_id
-- from public.safety_case_events order by occurred_at desc limit 50;

