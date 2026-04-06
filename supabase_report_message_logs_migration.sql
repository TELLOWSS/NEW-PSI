-- PSI 리포트 문자/MMS 발송 로그 테이블
-- 실행 목적:
-- 1) 근로자별 리포트 문자 발송 성공/실패 이력 저장
-- 2) 관리자 화면에서 최근 발송 이력 추적 가능

create extension if not exists pgcrypto;

create table if not exists public.report_message_logs (
    id uuid primary key default gen_random_uuid(),
    worker_id uuid null,
    worker_name text not null,
    team_name text null,
    phone_number text not null,
    status text not null check (status in ('SUCCESS', 'FAILED')),
    failure_category text null,
    sent_count integer not null default 0,
    provider text not null default 'SOLAPI',
    message text null,
    result_payload jsonb not null default '{}'::jsonb,
    created_by text null,
    created_at timestamptz not null default now()
);

create index if not exists report_message_logs_worker_id_idx
    on public.report_message_logs (worker_id);

create index if not exists report_message_logs_worker_id_created_at_idx
    on public.report_message_logs (worker_id, created_at desc);

create index if not exists report_message_logs_worker_name_idx
    on public.report_message_logs (worker_name);

create index if not exists report_message_logs_worker_name_created_at_idx
    on public.report_message_logs (worker_name, created_at desc);

create index if not exists report_message_logs_created_at_idx
    on public.report_message_logs (created_at desc);

create index if not exists report_message_logs_status_idx
    on public.report_message_logs (status, created_at desc);

create index if not exists report_message_logs_failure_category_idx
    on public.report_message_logs (failure_category, created_at desc);

create or replace view public.report_message_monthly_summary as
select
    date_trunc('month', created_at)::date as month_date,
    to_char(date_trunc('month', created_at), 'YYYY-MM') as month_label,
    count(*)::integer as total_count,
    count(*) filter (where status = 'SUCCESS')::integer as success_count,
    count(*) filter (where status = 'FAILED')::integer as failed_count,
    case
        when count(*) = 0 then 0
        else round((count(*) filter (where status = 'SUCCESS'))::numeric * 100 / count(*), 1)
    end as success_rate
from public.report_message_logs
group by 1, 2
order by month_date desc;

create or replace view public.report_message_team_summary as
select
    coalesce(nullif(trim(team_name), ''), '미지정') as team_name,
    count(*)::integer as total_count,
    count(*) filter (where status = 'SUCCESS')::integer as success_count,
    count(*) filter (where status = 'FAILED')::integer as failed_count,
    case
        when count(*) = 0 then 0
        else round((count(*) filter (where status = 'SUCCESS'))::numeric * 100 / count(*), 1)
    end as success_rate,
    max(created_at) as last_sent_at
from public.report_message_logs
group by 1
order by total_count desc, success_rate desc, team_name asc;

create or replace view public.report_message_failure_summary as
select
    coalesce(nullif(trim(failure_category), ''), '미분류') as failure_category,
    count(*)::integer as failure_count,
    max(created_at) as last_occurred_at
from public.report_message_logs
where status = 'FAILED'
group by 1
order by failure_count desc, failure_category asc;

create or replace view public.report_message_retry_queue as
with latest_status as (
    select
        coalesce(worker_id::text, worker_name || '|' || phone_number) as retry_key,
        worker_id,
        worker_name,
        coalesce(nullif(trim(team_name), ''), '미지정') as team_name,
        phone_number,
        coalesce(nullif(trim(failure_category), ''), '미분류') as failure_category,
        provider,
        message,
        created_at,
        status,
        row_number() over (
            partition by coalesce(worker_id::text, worker_name || '|' || phone_number)
            order by created_at desc
        ) as rn
    from public.report_message_logs
)
select
    retry_key,
    worker_id,
    worker_name,
    team_name,
    phone_number,
    failure_category,
    provider,
    message,
    created_at as failed_at,
    case failure_category
        when '전화번호 오류' then 100
        when '인증/권한' then 95
        when '이미지 업로드' then 90
        when '타임아웃' then 80
        when '한도/속도 제한' then 70
        when '네트워크' then 60
        else 50
    end as priority_score
from latest_status
where rn = 1
  and status = 'FAILED'
order by priority_score desc, failed_at desc;

alter table public.report_message_logs enable row level security;

drop policy if exists report_message_logs_service_role_all on public.report_message_logs;
create policy report_message_logs_service_role_all
    on public.report_message_logs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists report_message_logs_authenticated_select on public.report_message_logs;
create policy report_message_logs_authenticated_select
    on public.report_message_logs
    for select
    using (auth.role() = 'authenticated' or auth.role() = 'service_role');

comment on table public.report_message_logs is 'PSI 근로자 리포트 문자/MMS 발송 로그';
comment on column public.report_message_logs.failure_category is '실패 원인 분류(타임아웃, 인증/권한, 전화번호 오류 등)';
comment on column public.report_message_logs.result_payload is 'SOLAPI 응답, 페이지별 발송 결과, 실패 원인 등';
comment on view public.report_message_monthly_summary is 'PSI 리포트 문자/MMS 월별 발송 집계 뷰';
comment on view public.report_message_team_summary is 'PSI 리포트 문자/MMS 팀별 발송 집계 뷰';
comment on view public.report_message_failure_summary is 'PSI 리포트 문자/MMS 실패 사유 집계 뷰';
comment on view public.report_message_retry_queue is 'PSI 리포트 문자/MMS 재시도 우선순위 큐 뷰';
