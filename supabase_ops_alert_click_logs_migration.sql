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

alter table public.ops_alert_click_logs
    alter column created_by set default 'reports-ui';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'ops_alert_click_logs_tagging_error_count_nonnegative'
          and conrelid = 'public.ops_alert_click_logs'::regclass
    ) then
        alter table public.ops_alert_click_logs
            add constraint ops_alert_click_logs_tagging_error_count_nonnegative
                check (tagging_error_count >= 0);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'ops_alert_click_logs_intervention_not_started_count_nonnegative'
          and conrelid = 'public.ops_alert_click_logs'::regclass
    ) then
        alter table public.ops_alert_click_logs
            add constraint ops_alert_click_logs_intervention_not_started_count_nonnegative
                check (intervention_not_started_count >= 0);
    end if;
end $$;

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

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        grant select on table public.ops_alert_click_logs to authenticated;
    end if;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
        grant all on table public.ops_alert_click_logs to service_role;
    end if;
end $$;

comment on table public.ops_alert_click_logs is 'PSI Reports 경보 CTA 클릭 로그';
comment on column public.ops_alert_click_logs.action is '경보 CTA 이동 액션(go-intervention/go-tagging-validation)';
comment on column public.ops_alert_click_logs.delay_alert_active is '클릭 시점 지연경보 활성 여부';
comment on column public.ops_alert_click_logs.tagging_error_count is '클릭 시점 태깅 오류 건수';
comment on column public.ops_alert_click_logs.intervention_not_started_count is '클릭 시점 미착수 개입 건수';

-- 실행 직후 확인용(읽기 전용)
-- 1) 테이블/컬럼 생성 확인
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'ops_alert_click_logs'
-- order by ordinal_position;

-- 2) 인덱스 생성 확인
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'ops_alert_click_logs'
-- order by indexname;

-- 3) 정책 생성 확인
-- select policyname, permissive, roles, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename = 'ops_alert_click_logs'
-- order by policyname;

-- 4) 기본값/제약조건 확인
-- select
--   column_name,
--   column_default,
--   is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'ops_alert_click_logs'
--   and column_name in ('created_by', 'tagging_error_count', 'intervention_not_started_count')
-- order by column_name;
--
-- select conname, pg_get_constraintdef(oid) as constraint_def
-- from pg_constraint
-- where conrelid = 'public.ops_alert_click_logs'::regclass
-- order by conname;

-- 5) 권한(grant) 확인
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'ops_alert_click_logs'
-- order by grantee, privilege_type;

-- 6) 스모크 테스트(삽입/조회/삭제) - 필요 시에만 실행
-- insert into public.ops_alert_click_logs (
--   id, clicked_at, action, delay_alert_active,
--   tagging_error_count, intervention_not_started_count
-- ) values (
--   'smoke-' || to_char(now(), 'YYYYMMDDHH24MISSMS'),
--   now(),
--   'go-intervention',
--   true,
--   1,
--   2
-- );
--
-- select id, action, delay_alert_active, tagging_error_count, intervention_not_started_count, created_by, created_at
-- from public.ops_alert_click_logs
-- where id like 'smoke-%'
-- order by created_at desc
-- limit 1;
--
-- delete from public.ops_alert_click_logs where id like 'smoke-%';
