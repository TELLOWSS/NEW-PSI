-- PSI Workers Soft Delete Migration (2026-03-20)
-- 목적:
-- - workers 테이블 soft-delete 복구 기능 지원
-- - 삭제되지 않은 근로자 조회 성능 보강

begin;

alter table public.workers
    add column if not exists deleted_at timestamptz;

create index if not exists workers_deleted_at_idx
    on public.workers (deleted_at);

commit;

-- 선택 검증
-- select id, name, deleted_at from public.workers order by updated_at desc nulls last limit 20;
