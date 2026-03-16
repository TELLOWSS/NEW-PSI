-- PSI Training Acknowledgement Migration (2026-03-16)
-- 목적:
-- - 근로자 위험성평가 이해 확인/확약 데이터를 저장하는 테이블 추가
-- - 운영 최소권한 원칙에 맞는 RLS 정책 적용
-- 전제:
-- - public.psi_is_admin_request() 함수가 이미 존재해야 함

begin;

create table if not exists public.training_acknowledgements (
    id uuid primary key default gen_random_uuid(),
    session_id text not null,
    worker_name text not null,
    selected_language_code text,
    reviewed_guidance boolean not null default false,
    checklist jsonb not null default '{}'::jsonb,
    comprehension_complete boolean not null default false,
    submitted_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists training_ack_unique_session_worker
    on public.training_acknowledgements (session_id, worker_name);

create index if not exists training_ack_session_submitted_idx
    on public.training_acknowledgements (session_id, submitted_at desc);

create or replace function public.set_training_ack_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_training_ack_updated_at on public.training_acknowledgements;
create trigger trg_training_ack_updated_at
before update on public.training_acknowledgements
for each row
execute function public.set_training_ack_updated_at();

alter table public.training_acknowledgements enable row level security;

drop policy if exists training_ack_insert_anon_or_auth on public.training_acknowledgements;
drop policy if exists training_ack_select_admin_only on public.training_acknowledgements;
drop policy if exists training_ack_update_admin_only on public.training_acknowledgements;
drop policy if exists training_ack_delete_admin_only on public.training_acknowledgements;

create policy training_ack_insert_anon_or_auth
on public.training_acknowledgements
for insert
to anon, authenticated
with check (true);

create policy training_ack_select_admin_only
on public.training_acknowledgements
for select
to authenticated
using (
    auth.role() = 'authenticated'
    or public.psi_is_admin_request()
);

create policy training_ack_update_admin_only
on public.training_acknowledgements
for update
to authenticated
using (
    auth.role() = 'authenticated'
    or public.psi_is_admin_request()
)
with check (
    auth.role() = 'authenticated'
    or public.psi_is_admin_request()
);

create policy training_ack_delete_admin_only
on public.training_acknowledgements
for delete
to authenticated
using (
    auth.role() = 'authenticated'
    or public.psi_is_admin_request()
);

commit;

-- 빠른 점검 쿼리 (선택)
-- select count(*) from public.training_acknowledgements;
-- select * from public.training_acknowledgements order by submitted_at desc limit 20;
