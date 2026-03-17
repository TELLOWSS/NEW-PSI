-- PSI Supabase RLS Policies (2026-03-10)
-- 목적:
-- 1) signatures(전자서명), psi_feedback_outbox(피드백) 데이터에 RLS 적용
-- 2) anon/일반 접속은 INSERT만 허용
-- 3) SELECT/UPDATE/DELETE는 인증 사용자 또는 관리자 Secret 요청만 허용

begin;

-- ------------------------------------------------------------
-- [A] 관리자 Secret 확인 함수
-- ------------------------------------------------------------
-- 사용 전제:
-- - API Gateway/Edge Function에서 x-psi-admin-secret 헤더를 전달
-- - DB 설정값 app.settings.psi_admin_secret에 서버 측 Secret 저장
--   (예시) alter database postgres set app.settings.psi_admin_secret = 'CHANGE_ME_STRONG_SECRET';

create or replace function public.psi_is_admin_request()
returns boolean
language sql
stable
as $$
    select coalesce(
        (current_setting('request.headers', true)::jsonb ->> 'x-psi-admin-secret') = current_setting('app.settings.psi_admin_secret', true),
        false
    );
$$;

-- ------------------------------------------------------------
-- [B] signatures 테이블 RLS
-- ------------------------------------------------------------
do $$
begin
    if to_regclass('public.signatures') is not null then
        execute 'alter table public.signatures enable row level security';

        execute 'drop policy if exists signatures_insert_anon_or_auth on public.signatures';
        execute 'drop policy if exists signatures_select_admin_only on public.signatures';
        execute 'drop policy if exists signatures_update_admin_only on public.signatures';
        execute 'drop policy if exists signatures_delete_admin_only on public.signatures';

        execute '
            create policy signatures_insert_anon_or_auth
            on public.signatures
            for insert
            to anon, authenticated
            with check (true)
        ';

        execute '
            create policy signatures_select_admin_only
            on public.signatures
            for select
            to authenticated
            using (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
        ';

        execute '
            create policy signatures_update_admin_only
            on public.signatures
            for update
            to authenticated
            using (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
            with check (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
        ';

        execute '
            create policy signatures_delete_admin_only
            on public.signatures
            for delete
            to authenticated
            using (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
        ';
    end if;
end $$;

-- ------------------------------------------------------------
-- [C] psi_feedback_outbox 테이블 RLS
-- ------------------------------------------------------------
do $$
begin
    if to_regclass('public.psi_feedback_outbox') is not null then
        execute 'alter table public.psi_feedback_outbox enable row level security';

        execute 'drop policy if exists feedback_outbox_insert_anon_or_auth on public.psi_feedback_outbox';
        execute 'drop policy if exists feedback_outbox_select_admin_only on public.psi_feedback_outbox';
        execute 'drop policy if exists feedback_outbox_update_admin_only on public.psi_feedback_outbox';
        execute 'drop policy if exists feedback_outbox_delete_admin_only on public.psi_feedback_outbox';

        execute '
            create policy feedback_outbox_insert_anon_or_auth
            on public.psi_feedback_outbox
            for insert
            to anon, authenticated
            with check (true)
        ';

        execute '
            create policy feedback_outbox_select_admin_only
            on public.psi_feedback_outbox
            for select
            to authenticated
            using (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
        ';

        execute '
            create policy feedback_outbox_update_admin_only
            on public.psi_feedback_outbox
            for update
            to authenticated
            using (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
            with check (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
        ';

        execute '
            create policy feedback_outbox_delete_admin_only
            on public.psi_feedback_outbox
            for delete
            to authenticated
            using (
                auth.role() = ''authenticated''
                or public.psi_is_admin_request()
            )
        ';
    end if;
end $$;

-- ------------------------------------------------------------
-- [D] Storage bucket: signatures 업로드 정책
-- ------------------------------------------------------------
-- 전자서명 파일 업로드를 위한 storage.objects 정책

do $$
begin
    if to_regclass('storage.objects') is not null then
        execute 'drop policy if exists storage_signatures_insert_anon_or_auth on storage.objects';
        execute 'drop policy if exists storage_signatures_select_admin_only on storage.objects';
        execute 'drop policy if exists storage_signatures_update_admin_only on storage.objects';
        execute 'drop policy if exists storage_signatures_delete_admin_only on storage.objects';

        execute '
            create policy storage_signatures_insert_anon_or_auth
            on storage.objects
            for insert
            to anon, authenticated
            with check (
                bucket_id = ''signatures''
            )
        ';

        execute '
            create policy storage_signatures_select_admin_only
            on storage.objects
            for select
            to authenticated
            using (
                bucket_id = ''signatures''
                and (
                    auth.role() = ''authenticated''
                    or public.psi_is_admin_request()
                )
            )
        ';

        execute '
            create policy storage_signatures_update_admin_only
            on storage.objects
            for update
            to authenticated
            using (
                bucket_id = ''signatures''
                and (
                    auth.role() = ''authenticated''
                    or public.psi_is_admin_request()
                )
            )
            with check (
                bucket_id = ''signatures''
                and (
                    auth.role() = ''authenticated''
                    or public.psi_is_admin_request()
                )
            )
        ';

        execute '
            create policy storage_signatures_delete_admin_only
            on storage.objects
            for delete
            to authenticated
            using (
                bucket_id = ''signatures''
                and (
                    auth.role() = ''authenticated''
                    or public.psi_is_admin_request()
                )
            )
        ';
    end if;
end $$;

-- ------------------------------------------------------------
-- [E] training_acknowledgements 테이블 + RLS
-- ------------------------------------------------------------
-- 목적:
-- - 근로자 위험성평가 이해 확인(스크롤/체크리스트)과 확약 상태를 저장
-- - Worker API(anon/auth)는 INSERT/UPSERT 가능
-- - 조회는 관리자 요청(Secret) 또는 인증 사용자만 허용

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

-- ------------------------------------------------------------
-- [F] training_audio 버킷 + training_sessions 컬럼 보강 + Storage RLS
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
select 'training_audio', 'training_audio', true
where not exists (
    select 1 from storage.buckets where id = 'training_audio'
);

alter table if exists public.training_sessions
    add column if not exists audio_urls jsonb not null default '{}'::jsonb;

alter table if exists public.training_sessions
    add column if not exists original_script text;

do $$
begin
    if to_regclass('public.training_sessions') is not null then
        if exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'training_sessions'
              and column_name = 'source_text_ko'
        ) then
            execute '
                update public.training_sessions
                set original_script = coalesce(original_script, source_text_ko)
                where coalesce(original_script, '''') = ''''
            ';
        end if;
    end if;
end $$;

do $$
begin
    if to_regclass('storage.objects') is not null then
        execute 'drop policy if exists storage_training_audio_insert_admin_only on storage.objects';
        execute 'drop policy if exists storage_training_audio_select_worker_read on storage.objects';
        execute 'drop policy if exists storage_training_audio_update_admin_only on storage.objects';
        execute 'drop policy if exists storage_training_audio_delete_admin_only on storage.objects';

        execute '
            create policy storage_training_audio_insert_admin_only
            on storage.objects
            for insert
            to anon, authenticated
            with check (
                bucket_id = ''training_audio''
                and public.psi_is_admin_request()
            )
        ';

        execute '
            create policy storage_training_audio_select_worker_read
            on storage.objects
            for select
            to anon, authenticated
            using (
                bucket_id = ''training_audio''
            )
        ';

        execute '
            create policy storage_training_audio_update_admin_only
            on storage.objects
            for update
            to anon, authenticated
            using (
                bucket_id = ''training_audio''
                and public.psi_is_admin_request()
            )
            with check (
                bucket_id = ''training_audio''
                and public.psi_is_admin_request()
            )
        ';

        execute '
            create policy storage_training_audio_delete_admin_only
            on storage.objects
            for delete
            to anon, authenticated
            using (
                bucket_id = ''training_audio''
                and public.psi_is_admin_request()
            )
        ';
    end if;
end $$;

commit;
