-- Read-only hosted checks. No worker records, object names or audio are returned.
begin;
do $$ begin
 if has_any_column_privilege('anon','public.workers','select,insert,update,references')
  or has_any_column_privilege('authenticated','public.workers','select,insert,update,references')
  or has_table_privilege('anon','public.workers','delete,truncate,trigger')
  or has_table_privilege('authenticated','public.workers','delete,truncate,trigger') then
  raise exception 'Worker public privilege remains';
 end if;
 if not exists(select 1 from pg_class where oid='public.workers'::regclass and relrowsecurity and relforcerowsecurity) then
  raise exception 'Worker RLS is not enforced';
 end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass
  and polname='psi_training_audio_server_boundary' and not polpermissive and polcmd='*'
  and polroles @> array[(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')]
  and pg_get_expr(polqual,polrelid)='(bucket_id IS DISTINCT FROM ''training_audio''::text)'
  and pg_get_expr(polwithcheck,polrelid)='(bucket_id IS DISTINCT FROM ''training_audio''::text)') then
  raise exception 'Audio restrictive boundary missing';
 end if;
 if exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname=any(array[
  'storage_training_audio_delete_admin_only','storage_training_audio_insert_admin_only',
  'storage_training_audio_select_worker_read','storage_training_audio_update_admin_only',
  '오디오_누구나_업로드','오디오_누구나_조회'])
  and (coalesce(pg_get_expr(polqual,polrelid),'false')<>'false'
   or coalesce(pg_get_expr(polwithcheck,polrelid),'false')<>'false')) then raise exception 'Old audio policy is still permissive'; end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='signatures_anon_insert') then
  raise exception 'Unrelated signature policy missing';
 end if;
 if not exists(select 1 from storage.buckets where id='training_audio' and public) then raise exception 'Legacy playback setting changed'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.workers limit 0;
  raise exception 'Anonymous worker access allowed';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='training_audio') then raise exception 'Audio listing allowed'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin
  perform 1 from public.workers limit 0;
  raise exception 'Account direct worker access allowed';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='training_audio') then raise exception 'Account audio listing allowed'; end if;
end $$;
set local role service_role;
do $$ begin
 perform 1 from public.workers limit 0;
 perform 1 from storage.objects limit 0;
end $$;
reset role;
rollback;
select 'PASS: worker access and audio metadata blocked; server permissions and existing public playback retained' as result;
