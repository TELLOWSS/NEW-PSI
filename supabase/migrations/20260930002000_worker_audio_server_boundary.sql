-- Preserve records, audio objects, public playback URLs and unrelated buckets.
-- Worker records and audio metadata/mutations are server-only; public audio bytes
-- remain accessible by their existing URL until a signed playback flow replaces it.
begin;
set local lock_timeout='5s';
alter table public.workers enable row level security;
alter table public.workers force row level security;
revoke all on public.workers from public,anon,authenticated;
-- Preserve old policy objects while disabling permissive expressions.
do $$ declare p record; begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename='workers'
  and policyname='Enable ALL for authenticated and anon') then
  alter policy "Enable ALL for authenticated and anon" on public.workers using(false) with check(false);
 end if;
 for p in select policyname,cmd from pg_policies where schemaname='storage' and tablename='objects'
  and policyname=any(array['storage_training_audio_delete_admin_only','storage_training_audio_insert_admin_only',
   'storage_training_audio_select_worker_read','storage_training_audio_update_admin_only',
   '오디오_누구나_업로드','오디오_누구나_조회']) loop
  if p.cmd='INSERT' then
   execute format('alter policy %I on storage.objects with check(false)',p.policyname);
  elsif p.cmd in ('SELECT','DELETE') then
   execute format('alter policy %I on storage.objects using(false)',p.policyname);
  else
   execute format('alter policy %I on storage.objects using(false) with check(false)',p.policyname);
  end if;
 end loop;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='psi_training_audio_server_boundary') then
  create policy psi_training_audio_server_boundary on storage.objects as restrictive for all to anon,authenticated
   using(bucket_id is distinct from 'training_audio') with check(bucket_id is distinct from 'training_audio');
 elsif not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass
  and polname='psi_training_audio_server_boundary' and not polpermissive and polcmd='*') then
  raise exception 'Existing audio boundary must be restrictive';
 else
  alter policy psi_training_audio_server_boundary on storage.objects to anon,authenticated
   using(bucket_id is distinct from 'training_audio') with check(bucket_id is distinct from 'training_audio');
 end if;
end $$;

do $$ begin
 if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then
  raise exception 'Server role must retain BYPASSRLS';
 end if;
 if not has_table_privilege('service_role','public.workers','select')
  or not has_table_privilege('service_role','public.workers','insert')
  or not has_table_privilege('service_role','public.workers','update')
  or not has_table_privilege('service_role','public.workers','delete') then
  raise exception 'Existing server worker privileges missing';
 end if;
 if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
  raise exception 'Storage RLS must remain enabled';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
