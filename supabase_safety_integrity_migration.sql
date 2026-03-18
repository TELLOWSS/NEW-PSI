-- ============================================================
-- PSI Safety Integrity Migration (2026-03-18)
-- ============================================================
-- 목적:
--   개인안전역량세부지표 무결성 검증을 위한 3개 테이블 신설
--   - safety_behavior_observations : 불안전행동 현장 관찰 기록
--   - safety_coaching_actions      : 재교육·코칭·시정조치 이력
--   - worker_integrity_reviews     : 월별 무결성 자동판정 결과
--
-- 적용 순서:
--   1. 이 파일 전체를 Supabase SQL Editor에서 실행
--   2. 기존 workers, training_logs 테이블이 이미 존재한다고 가정
--      (supabase_worker_auth_gateway_migration.sql 선행 적용 필요)
-- ============================================================

begin;


-- ============================================================
-- 1. safety_behavior_observations
--    현장에서 관찰된 불안전행동을 근로자·월별로 기록한다.
--    관리자가 직접 입력하며, unsafe_behavior_flag = false 이면
--    "이번 달 관찰 없음" 확인 기록으로 사용한다.
-- ============================================================

create table if not exists public.safety_behavior_observations (
    id                      uuid primary key default gen_random_uuid(),
    worker_id               uuid not null,
    assessment_month        text not null,   -- 'YYYY-MM' 형식, 예: '2026-04'
    observed_at             timestamptz,     -- 실제 관찰 일시
    observer_name           text,            -- 관찰자 이름(팀장/안전관리자)
    unsafe_behavior_flag    boolean not null default false,
    unsafe_behavior_type    text,
    -- 예: '추락위험', '보호구미착용', '정리정돈불량', '안전수칙위반', '기타'
    severity_level          text check (
        severity_level is null or
        severity_level in ('낮음', '보통', '높음', '즉시조치')
    ),
    evidence_note           text,            -- 메모/사진 설명
    evidence_photo_url      text,            -- 스토리지 URL
    related_risk_category   text,            -- 위험성평가 기록지 상의 위험유형
    created_at              timestamptz not null default now()
);

comment on table public.safety_behavior_observations is
    '현장 불안전행동 관찰 기록 (근로자·월별)';

comment on column public.safety_behavior_observations.unsafe_behavior_flag is
    'false 이면 관찰기간 내 불안전행동 없음 확인 기록으로 사용';

comment on column public.safety_behavior_observations.assessment_month is
    'YYYY-MM 형식. 다음달 위험성평가 기준월을 입력. 예) 2026-04';

-- 인덱스
create index if not exists sbo_worker_id_idx
    on public.safety_behavior_observations (worker_id);

create index if not exists sbo_month_idx
    on public.safety_behavior_observations (assessment_month);

create index if not exists sbo_worker_month_idx
    on public.safety_behavior_observations (worker_id, assessment_month);

create index if not exists sbo_flag_idx
    on public.safety_behavior_observations (unsafe_behavior_flag)
    where unsafe_behavior_flag = true;


-- ============================================================
-- 2. safety_coaching_actions
--    불안전행동 관찰 이후 실시된 재교육·코칭·시정조치를 기록한다.
--    source_observation_id 로 불안전행동 관찰 건과 연결한다.
--    followup_result 가 '개선됨' 이어야 무결성 게이트를 통과한다.
-- ============================================================

create table if not exists public.safety_coaching_actions (
    id                      uuid primary key default gen_random_uuid(),
    worker_id               uuid not null,
    assessment_month        text not null,
    source_observation_id   uuid,            -- safety_behavior_observations.id 참조
    action_type             text not null check (
        action_type in ('재교육', '현장코칭', '작업중지', '보호구개선', '기타')
    ),
    action_detail           text,
    action_completed_at     timestamptz,
    coach_name              text,
    followup_result         text check (
        followup_result is null or
        followup_result in ('개선됨', '재발', '확인중')
    ),
    followup_checked_at     timestamptz,
    created_at              timestamptz not null default now()
);

comment on table public.safety_coaching_actions is
    '재교육·현장코칭·시정조치 이력 (불안전행동 관찰 건과 연결)';

comment on column public.safety_coaching_actions.followup_result is
    '개선됨: 무결성 게이트 통과 가능. 재발: 반복위반 패널티 대상. 확인중: 검증보류';

-- 인덱스
create index if not exists sca_worker_id_idx
    on public.safety_coaching_actions (worker_id);

create index if not exists sca_month_idx
    on public.safety_coaching_actions (assessment_month);

create index if not exists sca_worker_month_idx
    on public.safety_coaching_actions (worker_id, assessment_month);

create index if not exists sca_source_obs_idx
    on public.safety_coaching_actions (source_observation_id);

create index if not exists sca_followup_idx
    on public.safety_coaching_actions (followup_result);


-- ============================================================
-- 3. worker_integrity_reviews
--    월별 무결성 자동판정 결과를 저장한다.
--    문서축(기록지 품질) + 실천축(교육·행동·조치)을 합산해
--    integrity_status 를 결정한다.
--    자동판정 후 관리자가 최종 승인·반려를 처리한다.
-- ============================================================

create table if not exists public.worker_integrity_reviews (
    id                      uuid primary key default gen_random_uuid(),
    worker_id               uuid not null,
    assessment_month        text not null,
    education_session_id    uuid,            -- training_sessions.id 참조

    -- 점수 구성요소 (0~100)
    document_score          numeric(5, 2),   -- w1·기록지무결성 + w2·업무이해도 + w3·위험성평가이해도
    education_score         numeric(5, 2),   -- w4·교육이수도 (오디오청취·완독·서명·전파교육)
    improvement_score       numeric(5, 2),   -- w5·개선이행도 (코칭완료·후속확인)
    repeat_violation_penalty numeric(5, 2) not null default 0,  -- w6·반복위반 패널티

    -- 무결성 판정 결과
    integrity_status        text not null default '검증보류' check (
        integrity_status in ('확정', '검증보류', '재교육필요', '관리자검토')
    ),
    integrity_reason_codes  text[] not null default '{}',
    -- 가능한 코드 예시:
    --   EDUCATION_INCOMPLETE  교육/서명 미완료
    --   COACHING_MISSING      불안전행동 후 코칭 이력 없음
    --   REPEAT_VIOLATION      동일 위험행동 2회 이상 재발
    --   TIMELINE_MISMATCH     시간 순서 불일치 (관찰→코칭→교육→작성 역전)
    --   DOCUMENT_INSUFFICIENT 기록지 품질 미달
    --   FOLLOWUP_PENDING      후속확인 미완료(확인중 상태)

    -- 자동판정 메타
    auto_evaluated_at       timestamptz,
    computed_total_score    numeric(5, 2),   -- 최종 가중 합산 점수

    -- 관리자 최종 처리
    approved_by             text,
    approved_at             timestamptz,
    approval_comment        text,

    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    -- 월별 고유 제약: 한 근로자·한 달에 리뷰는 1건
    unique (worker_id, assessment_month)
);

comment on table public.worker_integrity_reviews is
    '월별 개인안전역량 무결성 자동판정 결과. 문서축+실천축 합산.';

comment on column public.worker_integrity_reviews.integrity_status is
    '확정: 5개 게이트 모두 통과. 검증보류: 게이트 미통과 대기. 재교육필요: 코칭/재교육 등록 필요. 관리자검토: 시간순서 이상 또는 중대 판단 필요';

comment on column public.worker_integrity_reviews.integrity_reason_codes is
    '판정 사유 코드 배열. 빈 배열이면 정상 확정 또는 판정 전 상태.';

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists wir_updated_at on public.worker_integrity_reviews;

create trigger wir_updated_at
    before update on public.worker_integrity_reviews
    for each row
    execute function public.set_updated_at();

-- 인덱스
create index if not exists wir_worker_id_idx
    on public.worker_integrity_reviews (worker_id);

create index if not exists wir_month_idx
    on public.worker_integrity_reviews (assessment_month);

create index if not exists wir_status_idx
    on public.worker_integrity_reviews (integrity_status);

create index if not exists wir_worker_month_status_idx
    on public.worker_integrity_reviews (worker_id, assessment_month, integrity_status);

-- 미확정 건만 빠르게 조회하기 위한 부분 인덱스
create index if not exists wir_not_confirmed_idx
    on public.worker_integrity_reviews (assessment_month, worker_id)
    where integrity_status != '확정';


-- ============================================================
-- 4. RLS 정책
--    서비스롤(service_role) 또는 authenticated 사용자만 접근.
--    읽기는 authenticated 허용, 쓰기는 service_role 전용.
-- ============================================================

-- safety_behavior_observations
alter table public.safety_behavior_observations enable row level security;

drop policy if exists sbo_service_role_all on public.safety_behavior_observations;
create policy sbo_service_role_all
    on public.safety_behavior_observations
    for all
    to service_role
    using (true)
    with check (true);

drop policy if exists sbo_authenticated_select on public.safety_behavior_observations;
create policy sbo_authenticated_select
    on public.safety_behavior_observations
    for select
    to authenticated
    using (true);

-- safety_coaching_actions
alter table public.safety_coaching_actions enable row level security;

drop policy if exists sca_service_role_all on public.safety_coaching_actions;
create policy sca_service_role_all
    on public.safety_coaching_actions
    for all
    to service_role
    using (true)
    with check (true);

drop policy if exists sca_authenticated_select on public.safety_coaching_actions;
create policy sca_authenticated_select
    on public.safety_coaching_actions
    for select
    to authenticated
    using (true);

-- worker_integrity_reviews
alter table public.worker_integrity_reviews enable row level security;

drop policy if exists wir_service_role_all on public.worker_integrity_reviews;
create policy wir_service_role_all
    on public.worker_integrity_reviews
    for all
    to service_role
    using (true)
    with check (true);

drop policy if exists wir_authenticated_select on public.worker_integrity_reviews;
create policy wir_authenticated_select
    on public.worker_integrity_reviews
    for select
    to authenticated
    using (true);


-- ============================================================
-- 5. Supabase Realtime 구독 활성화 (선택)
-- ============================================================

-- 관리자 대시보드에서 실시간 무결성 상태 변경을 수신하려면 활성화.
-- alter publication supabase_realtime add table public.worker_integrity_reviews;


-- ============================================================
-- 6. 샘플 데이터 (개발·테스트용, 운영 적용 시 삭제)
-- ============================================================

-- 아래 주석을 해제하면 샘플 데이터가 삽입됨.
-- 실제 워커 UUID가 필요하므로 workers 테이블에서 id 를 확인 후 치환할 것.

/*
insert into public.safety_behavior_observations
    (worker_id, assessment_month, observed_at, observer_name,
     unsafe_behavior_flag, unsafe_behavior_type, severity_level, evidence_note)
values
    ('00000000-0000-0000-0000-000000000001', '2026-04',
     '2026-04-02 09:30:00+09', '김팀장',
     true, '보호구미착용', '보통', '안전모 미착용 상태로 작업 진행'),
    ('00000000-0000-0000-0000-000000000002', '2026-04',
     null, '이안전관리자',
     false, null, null, '4월 1주차 순회 결과 이상 없음');
*/


commit;
