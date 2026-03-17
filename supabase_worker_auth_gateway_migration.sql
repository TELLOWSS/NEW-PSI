-- PSI Worker Auth Gateway Migration (2026-03-18)
-- 목적:
-- - workers 명부 기반 3중 키(핸드폰/생년월일/여권번호) 본인 확인 컬럼 보강
-- - training_logs 무결성 교차검증 컬럼(worker_id, is_manager_proxy) 보강

begin;

create table if not exists public.workers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    nationality text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.workers
    add column if not exists phone_number text,
    add column if not exists birth_date text,
    add column if not exists passport_number text;

create index if not exists workers_phone_number_idx
    on public.workers (phone_number);

create index if not exists workers_birth_date_idx
    on public.workers (birth_date);

create index if not exists workers_passport_number_upper_idx
    on public.workers (upper(passport_number));

alter table public.training_logs
    add column if not exists worker_id uuid,
    add column if not exists is_manager_proxy boolean not null default false,
    add column if not exists selected_language_code text,
    add column if not exists signature_method text;

create index if not exists training_logs_worker_id_idx
    on public.training_logs (worker_id);

create index if not exists training_logs_is_manager_proxy_idx
    on public.training_logs (is_manager_proxy);

create index if not exists training_logs_session_worker_idx
    on public.training_logs (session_id, worker_id);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'workers_auth_key_min_one_ck'
    ) then
        alter table public.workers
            add constraint workers_auth_key_min_one_ck
            check (
                nullif(regexp_replace(coalesce(phone_number, ''), '\\D', '', 'g'), '') is not null
                or nullif(regexp_replace(coalesce(birth_date, ''), '\\D', '', 'g'), '') is not null
                or nullif(upper(regexp_replace(coalesce(passport_number, ''), '[^A-Za-z0-9]', '', 'g')), '') is not null
            ) not valid;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'workers_birth_date_format_ck'
    ) then
        alter table public.workers
            add constraint workers_birth_date_format_ck
            check (
                birth_date is null
                or birth_date = ''
                or regexp_replace(birth_date, '\\D', '', 'g') ~ '^([0-9]{6}|[0-9]{8})$'
            ) not valid;
    end if;
end $$;

commit;

-- 선택 검증
-- select id, name, phone_number, birth_date, passport_number from public.workers limit 20;
-- select count(*) from public.training_logs where worker_id is not null;
-- select count(*) from public.training_logs where is_manager_proxy = true;
