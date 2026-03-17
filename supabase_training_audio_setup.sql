-- PSI training audio bucket + training_sessions columns
-- 실행 목적:
-- 1) training_audio 버킷 생성
-- 2) 관리자 업로드 / 근로자 읽기 정책 구성
-- 3) training_sessions.audio_urls / original_script 컬럼 보강

begin;

insert into storage.buckets (id, name, public)
select 'training_audio', 'training_audio', true
where not exists (
    select 1 from storage.buckets where id = 'training_audio'
);

alter table if exists public.training_sessions
    add column if not exists audio_urls jsonb not null default '{}'::jsonb;

alter table if exists public.training_sessions
    add column if not exists original_script text;

update public.training_sessions
set original_script = coalesce(original_script, source_text_ko)
where coalesce(original_script, '') = '';

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
