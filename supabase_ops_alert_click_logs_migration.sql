-- PSI Reports 경보 CTA 클릭 로그 영속 저장 테이블
-- 목적:
-- 1) Reports 화면의 경보 CTA 클릭 로그를 서버에 장기 보존
-- 2) localStorage 유실 시에도 운영 이력 복원

create extension if not exists pgcrypto;

create table if not exists public.ops_alert_click_logs (
    id text primary key,
    clicked_at timestamptz not null,
    action text not null check (action in ('go-intervention', 'go-tagging-validation')),
    delay_alert_active boolean not null default false,
    tagging_error_count integer not null default 0,
    intervention_not_started_count integer not null default 0,
    created_by text null,
    created_at timestamptz not null default now()
);

create index if not exists ops_alert_click_logs_clicked_at_idx
    on public.ops_alert_click_logs (clicked_at desc);

create index if not exists ops_alert_click_logs_action_clicked_at_idx
    on public.ops_alert_click_logs (action, clicked_at desc);

create index if not exists ops_alert_click_logs_delay_alert_clicked_at_idx
    on public.ops_alert_click_logs (delay_alert_active, clicked_at desc);

alter table public.ops_alert_click_logs enable row level security;

drop policy if exists ops_alert_click_logs_service_role_all on public.ops_alert_click_logs;
create policy ops_alert_click_logs_service_role_all
    on public.ops_alert_click_logs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists ops_alert_click_logs_authenticated_select on public.ops_alert_click_logs;
create policy ops_alert_click_logs_authenticated_select
    on public.ops_alert_click_logs
    for select
    using (auth.role() = 'authenticated' or auth.role() = 'service_role');

comment on table public.ops_alert_click_logs is 'PSI Reports 경보 CTA 클릭 로그';
comment on column public.ops_alert_click_logs.action is '경보 CTA 이동 액션(go-intervention/go-tagging-validation)';
comment on column public.ops_alert_click_logs.delay_alert_active is '클릭 시점 지연경보 활성 여부';
comment on column public.ops_alert_click_logs.tagging_error_count is '클릭 시점 태깅 오류 건수';
comment on column public.ops_alert_click_logs.intervention_not_started_count is '클릭 시점 미착수 개입 건수';
