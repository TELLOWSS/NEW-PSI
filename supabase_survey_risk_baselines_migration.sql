-- Survey Risk Baselines Migration (2026-06-18)
-- 목적:
-- - 월·공종별 관리자 기준 위험등급을 근로자 Q3 응답과 분리해 저장
-- - 여러 관리자/브라우저가 동일 기준을 공유하도록 서버 영속화
-- - 브라우저에서 직접 접근하지 않고 관리자 API(service role)로만 처리

begin;

create table if not exists public.survey_risk_baselines (
    id uuid primary key default gen_random_uuid(),
    month_key text not null check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    trade text not null check (length(trim(trade)) between 1 and 80),
    level text not null check (level in ('상', '중', '하')),
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (month_key, trade)
);

create index if not exists survey_risk_baselines_month_trade_idx
    on public.survey_risk_baselines (month_key desc, trade);

alter table public.survey_risk_baselines enable row level security;

-- 2026-04-28 이후 신규 프로젝트는 Data API 권한이 자동 부여되지 않으므로 명시한다.
-- 이 테이블은 서버 관리자 API에서만 접근하며 브라우저 anon/authenticated 접근은 차단한다.
revoke all on table public.survey_risk_baselines from public, anon, authenticated;
grant select, insert, update, delete on table public.survey_risk_baselines to service_role;

commit;

-- 적용 후 검증:
-- select month_key, trade, level, updated_by, updated_at
-- from public.survey_risk_baselines
-- order by month_key desc, trade;
