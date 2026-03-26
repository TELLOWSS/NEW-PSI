-- training access attempts (재접속 차단용)
-- 목적: 동일 session_id + worker_id 기준 접속 시도 횟수를 서버에서 누적 추적

create table if not exists public.training_access_attempts (
    id uuid primary key default gen_random_uuid(),
    session_id text not null,
    worker_id text not null,
    worker_name text,
    accessed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists training_access_attempts_session_worker_idx
    on public.training_access_attempts (session_id, worker_id);

create index if not exists training_access_attempts_accessed_at_idx
    on public.training_access_attempts (accessed_at desc);

-- Optional RLS template (운영 정책에 맞게 활성화)
-- alter table public.training_access_attempts enable row level security;
-- create policy "allow service role only"
--   on public.training_access_attempts
--   for all
--   using (auth.role() = 'service_role')
--   with check (auth.role() = 'service_role');
