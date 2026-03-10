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

commit;
