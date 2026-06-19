-- Survey Risk Baseline History Migration (2026-06-19)
-- 목적:
-- - 관리자 기준 위험도의 판단 근거와 변경 전후 등급을 감사 이력으로 보존
-- - 기존 survey_risk_baselines 테이블을 변경하지 않아 무중단 호환 유지
-- - 브라우저 직접 접근은 차단하고 관리자 API(service role)에서만 처리

begin;

create table if not exists public.survey_risk_baseline_history (
    id uuid primary key default gen_random_uuid(),
    month_key text not null check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    trade text not null check (length(trim(trade)) between 1 and 80),
    action text not null check (action in ('upsert', 'delete', 'copy')),
    previous_level text check (previous_level is null or previous_level in ('상', '중', '하')),
    next_level text check (next_level is null or next_level in ('상', '중', '하')),
    severity text check (severity is null or severity in ('minor', 'serious', 'fatal')),
    exposure text check (exposure is null or exposure in ('rare', 'repeated', 'continuous')),
    control_state text check (control_state is null or control_state in ('controlled', 'partial', 'weak')),
    reason text not null default '' check (length(reason) <= 500),
    source text not null check (source in ('wizard', 'manual', 'previous-month')),
    rule_version text not null default 'manual-v1' check (length(rule_version) between 1 and 80),
    updated_by text not null default '관리자' check (length(updated_by) between 1 and 80),
    changed_at timestamptz not null default now()
);

create index if not exists survey_risk_baseline_history_month_trade_changed_idx
    on public.survey_risk_baseline_history (month_key desc, trade, changed_at desc);

alter table public.survey_risk_baseline_history enable row level security;

revoke all on table public.survey_risk_baseline_history from public, anon, authenticated;
grant select, insert on table public.survey_risk_baseline_history to service_role;

commit;

-- 적용 후 검증:
-- select month_key, trade, action, previous_level, next_level, source, updated_by, changed_at
-- from public.survey_risk_baseline_history
-- order by changed_at desc
-- limit 100;
