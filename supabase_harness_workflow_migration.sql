-- ============================================================
-- PSI Harness Workflow Migration (2026-04-10)
-- ============================================================
-- 목적:
--   하네스 엔지니어링 기반의 상태 머신 / 감사 추적 / 승인 이력 저장용 테이블 신설
--   - ai_workflow_runs         : 문서/분석 단위 워크플로우 실행 상태
--   - ai_workflow_events       : 상태 전이 및 이벤트 로그 (append-only)
--   - ai_guardrail_overrides   : 룰 엔진 오버라이드 이력
--   - ai_context_snapshots     : 분석 시점 컨텍스트 스냅샷
--   - ai_human_approvals       : 인간 승인/반려/재분석 요청 이력
--   - ai_prompt_versions       : 프롬프트 버전 스냅샷
--   - ai_policy_versions       : 정책 버전 스냅샷
--
-- 적용 순서:
--   1. 이 파일 전체를 Supabase SQL Editor에서 실행
--   2. 기존 workers / training / integrity 관련 스키마와 독립적으로 적용 가능
--   3. service_role 기반 API 또는 authenticated 조회를 전제로 설계
-- ============================================================

begin;

-- ============================================================
-- 0. 공통 updated_at 트리거 함수
-- ============================================================
create or replace function public.set_harness_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- ============================================================
-- 1. ai_prompt_versions
-- ============================================================
create table if not exists public.ai_prompt_versions (
    id                  uuid primary key default gen_random_uuid(),
    prompt_version      text not null unique,
    system_instruction  text,
    prompt_layers_json  jsonb not null default '{}'::jsonb,
    created_by          text,
    created_at          timestamptz not null default now()
);

comment on table public.ai_prompt_versions is
    '하네스 분석에 사용된 프롬프트 버전 스냅샷';


-- ============================================================
-- 2. ai_policy_versions
-- ============================================================
create table if not exists public.ai_policy_versions (
    id                  uuid primary key default gen_random_uuid(),
    policy_version      text not null unique,
    policy_json         jsonb not null default '{}'::jsonb,
    created_by          text,
    created_at          timestamptz not null default now()
);

comment on table public.ai_policy_versions is
    '가드레일/룰 엔진 정책 버전 스냅샷';


-- ============================================================
-- 3. ai_workflow_runs
-- ============================================================
create table if not exists public.ai_workflow_runs (
    id                      uuid primary key default gen_random_uuid(),
    source_record_id        text,
    worker_id               uuid,
    site_id                 text,
    source_type             text not null default 'ocr_record',
    job_type                text,
    document_date           date,
    workflow_state          text not null check (
        workflow_state in (
            'uploaded',
            'ocr_validating',
            'manual_review_required',
            'context_ready',
            'first_pass_analyzing',
            'evaluator_review',
            'awaiting_manager_approval',
            'manager_revised',
            'second_pass_analyzing',
            'completed'
        )
    ),
    risk_decision           text not null check (
        risk_decision in (
            'SAFE_TO_PROCEED',
            'SUPPLEMENTARY_REVIEW',
            'IMMEDIATE_ATTENTION',
            'CRITICAL_STOP'
        )
    ),
    approval_state          text not null check (
        approval_state in (
            'NOT_REQUIRED',
            'REQUIRED',
            'PENDING',
            'APPROVED',
            'REJECTED'
        )
    ),
    second_pass_status      text check (
        second_pass_status is null or
        second_pass_status in ('NEEDED', 'IN_PROGRESS', 'DONE')
    ),
    requires_manager_approval boolean not null default false,
    latest_summary          text,
    latest_confidence       numeric(5, 4),
    latest_decision_payload jsonb not null default '{}'::jsonb,
    prompt_version_id       uuid,
    policy_version_id       uuid,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

comment on table public.ai_workflow_runs is
    'OCR/안전 분석 단위의 하네스 워크플로우 실행 상태';

comment on column public.ai_workflow_runs.latest_decision_payload is
    '최근 analyzer/evaluator/guardrail 결정 결과 요약 JSON';

create index if not exists ai_workflow_runs_source_record_idx
    on public.ai_workflow_runs (source_record_id);

create index if not exists ai_workflow_runs_worker_id_idx
    on public.ai_workflow_runs (worker_id);

create index if not exists ai_workflow_runs_workflow_state_idx
    on public.ai_workflow_runs (workflow_state);

create index if not exists ai_workflow_runs_risk_decision_idx
    on public.ai_workflow_runs (risk_decision);

create index if not exists ai_workflow_runs_approval_state_idx
    on public.ai_workflow_runs (approval_state);

create index if not exists ai_workflow_runs_created_at_idx
    on public.ai_workflow_runs (created_at desc);

alter table public.ai_workflow_runs
    add constraint ai_workflow_runs_prompt_version_fk
    foreign key (prompt_version_id) references public.ai_prompt_versions (id)
    on delete set null;

alter table public.ai_workflow_runs
    add constraint ai_workflow_runs_policy_version_fk
    foreign key (policy_version_id) references public.ai_policy_versions (id)
    on delete set null;


drop trigger if exists ai_workflow_runs_updated_at on public.ai_workflow_runs;
create trigger ai_workflow_runs_updated_at
    before update on public.ai_workflow_runs
    for each row
    execute function public.set_harness_updated_at();


-- ============================================================
-- 4. ai_workflow_events
-- ============================================================
create table if not exists public.ai_workflow_events (
    id                  uuid primary key default gen_random_uuid(),
    workflow_run_id     uuid not null,
    event_stage         text not null,
    event_type          text not null default 'system',
    actor               text,
    note                text,
    payload_json        jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now()
);

comment on table public.ai_workflow_events is
    '하네스 워크플로우 상태 전이 및 이벤트 로그 (append-only)';

create index if not exists ai_workflow_events_run_idx
    on public.ai_workflow_events (workflow_run_id, created_at desc);

alter table public.ai_workflow_events
    add constraint ai_workflow_events_run_fk
    foreign key (workflow_run_id) references public.ai_workflow_runs (id)
    on delete cascade;


-- ============================================================
-- 5. ai_guardrail_overrides
-- ============================================================
create table if not exists public.ai_guardrail_overrides (
    id                      uuid primary key default gen_random_uuid(),
    workflow_run_id         uuid not null,
    event_id                uuid,
    rule_code               text not null,
    rule_version            text,
    severity                text not null check (
        severity in ('info', 'warning', 'high', 'critical')
    ),
    trigger_type            text,
    trigger_payload_json    jsonb not null default '{}'::jsonb,
    message                 text,
    original_decision       text,
    overridden_decision     text,
    created_at              timestamptz not null default now()
);

comment on table public.ai_guardrail_overrides is
    '룰 엔진이 AI 판단을 덮어쓴 오버라이드 이력';

create index if not exists ai_guardrail_overrides_run_idx
    on public.ai_guardrail_overrides (workflow_run_id, created_at desc);

alter table public.ai_guardrail_overrides
    add column if not exists rule_version text;

create index if not exists ai_guardrail_overrides_rule_code_idx
    on public.ai_guardrail_overrides (rule_code);

alter table public.ai_guardrail_overrides
    add constraint ai_guardrail_overrides_run_fk
    foreign key (workflow_run_id) references public.ai_workflow_runs (id)
    on delete cascade;

alter table public.ai_guardrail_overrides
    add constraint ai_guardrail_overrides_event_fk
    foreign key (event_id) references public.ai_workflow_events (id)
    on delete set null;


-- ============================================================
-- 6. ai_context_snapshots
-- ============================================================
create table if not exists public.ai_context_snapshots (
    id                      uuid primary key default gen_random_uuid(),
    workflow_run_id         uuid not null,
    weather_json            jsonb not null default '{}'::jsonb,
    schedule_json           jsonb not null default '{}'::jsonb,
    sensor_events_json      jsonb not null default '[]'::jsonb,
    metadata_json           jsonb not null default '{}'::jsonb,
    ocr_confidence_score    numeric(5, 4),
    image_quality_score     numeric(5, 4),
    prompt_version_id       uuid,
    policy_version_id       uuid,
    created_at              timestamptz not null default now()
);

comment on table public.ai_context_snapshots is
    '분석 시점의 날씨/작업계획/센서/품질 컨텍스트 스냅샷';

create index if not exists ai_context_snapshots_run_idx
    on public.ai_context_snapshots (workflow_run_id, created_at desc);

alter table public.ai_context_snapshots
    add constraint ai_context_snapshots_run_fk
    foreign key (workflow_run_id) references public.ai_workflow_runs (id)
    on delete cascade;

alter table public.ai_context_snapshots
    add constraint ai_context_snapshots_prompt_version_fk
    foreign key (prompt_version_id) references public.ai_prompt_versions (id)
    on delete set null;

alter table public.ai_context_snapshots
    add constraint ai_context_snapshots_policy_version_fk
    foreign key (policy_version_id) references public.ai_policy_versions (id)
    on delete set null;


-- ============================================================
-- 7. ai_human_approvals
-- ============================================================
create table if not exists public.ai_human_approvals (
    id                      uuid primary key default gen_random_uuid(),
    workflow_run_id         uuid not null,
    approver_worker_id      uuid,
    approver_name           text,
    approver_role           text,
    approval_action         text not null check (
        approval_action in ('approve', 'reject', 'request-reanalysis')
    ),
    approval_comment        text,
    signature_url           text,
    decision_before         text,
    decision_after          text,
    created_at              timestamptz not null default now()
);

comment on table public.ai_human_approvals is
    '인간 승인/반려/재분석 요청 이력';

create index if not exists ai_human_approvals_run_idx
    on public.ai_human_approvals (workflow_run_id, created_at desc);

create index if not exists ai_human_approvals_action_idx
    on public.ai_human_approvals (approval_action);

alter table public.ai_human_approvals
    add constraint ai_human_approvals_run_fk
    foreign key (workflow_run_id) references public.ai_workflow_runs (id)
    on delete cascade;


-- ============================================================
-- 8. RLS 정책
--    읽기는 authenticated 허용, 쓰기는 service_role 서버 함수에서 수행하는 것을 전제
-- ============================================================
alter table public.ai_prompt_versions enable row level security;
alter table public.ai_policy_versions enable row level security;
alter table public.ai_workflow_runs enable row level security;
alter table public.ai_workflow_events enable row level security;
alter table public.ai_guardrail_overrides enable row level security;
alter table public.ai_context_snapshots enable row level security;
alter table public.ai_human_approvals enable row level security;

-- 기존 정책 제거
DROP POLICY IF EXISTS ai_prompt_versions_select_authenticated ON public.ai_prompt_versions;
DROP POLICY IF EXISTS ai_policy_versions_select_authenticated ON public.ai_policy_versions;
DROP POLICY IF EXISTS ai_workflow_runs_select_authenticated ON public.ai_workflow_runs;
DROP POLICY IF EXISTS ai_workflow_events_select_authenticated ON public.ai_workflow_events;
DROP POLICY IF EXISTS ai_guardrail_overrides_select_authenticated ON public.ai_guardrail_overrides;
DROP POLICY IF EXISTS ai_context_snapshots_select_authenticated ON public.ai_context_snapshots;
DROP POLICY IF EXISTS ai_human_approvals_select_authenticated ON public.ai_human_approvals;

create policy ai_prompt_versions_select_authenticated
    on public.ai_prompt_versions for select
    to authenticated
    using (true);

create policy ai_policy_versions_select_authenticated
    on public.ai_policy_versions for select
    to authenticated
    using (true);

create policy ai_workflow_runs_select_authenticated
    on public.ai_workflow_runs for select
    to authenticated
    using (true);

create policy ai_workflow_events_select_authenticated
    on public.ai_workflow_events for select
    to authenticated
    using (true);

create policy ai_guardrail_overrides_select_authenticated
    on public.ai_guardrail_overrides for select
    to authenticated
    using (true);

create policy ai_context_snapshots_select_authenticated
    on public.ai_context_snapshots for select
    to authenticated
    using (true);

create policy ai_human_approvals_select_authenticated
    on public.ai_human_approvals for select
    to authenticated
    using (true);

commit;
