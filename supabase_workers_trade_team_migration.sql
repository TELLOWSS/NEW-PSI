-- PSI Workers Trade/Team Migration (2026-03-18)
-- 목적:
-- - workers 테이블에 공종(job_field) / 팀(team_name) 컬럼 추가
-- - 공종/팀 기준 조회 성능을 위한 인덱스 추가

begin;

alter table public.workers
    add column if not exists job_field text,
    add column if not exists team_name text;

create index if not exists workers_job_field_idx
    on public.workers (job_field);

create index if not exists workers_team_name_idx
    on public.workers (team_name);

commit;

-- 선택 검증
-- select id, name, nationality, job_field, team_name from public.workers limit 20;
