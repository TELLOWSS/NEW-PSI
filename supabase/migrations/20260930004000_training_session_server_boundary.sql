-- Training material is delivered by verified server routes. Keep every record,
-- existing policy object and service-role privilege. No storage settings change.
begin;
set local lock_timeout='5s';
alter table public.training_sessions enable row level security;
alter table public.training_sessions force row level security;
revoke all on public.training_sessions from public,anon,authenticated;
do $$ declare c record; begin
 for c in select attname from pg_attribute where attrelid='public.training_sessions'::regclass
  and attnum>0 and not attisdropped loop
  execute format('revoke all (%I) on public.training_sessions from public,anon,authenticated',c.attname);
 end loop;
 if not exists(select 1 from pg_policy where polrelid='public.training_sessions'::regclass and polname='psi_training_session_server_boundary') then
  create policy psi_training_session_server_boundary on public.training_sessions as restrictive for all to anon,authenticated
   using(false) with check(false);
 elsif not exists(select 1 from pg_policy where polrelid='public.training_sessions'::regclass
  and polname='psi_training_session_server_boundary' and not polpermissive and polcmd='*') then
  raise exception 'Existing training boundary must be restrictive';
 else
  alter policy psi_training_session_server_boundary on public.training_sessions to anon,authenticated using(false) with check(false);
 end if;
 if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls)
  or not has_table_privilege('service_role','public.training_sessions','select')
  or not has_table_privilege('service_role','public.training_sessions','insert')
  or not has_table_privilege('service_role','public.training_sessions','update')
  or not has_table_privilege('service_role','public.training_sessions','delete') then
  raise exception 'Existing server training permissions missing';
 end if;
 if has_any_column_privilege('anon','public.training_sessions','select,insert,update,references')
  or has_any_column_privilege('authenticated','public.training_sessions','select,insert,update,references')
  or has_table_privilege('anon','public.training_sessions','delete,truncate,trigger')
  or has_table_privilege('authenticated','public.training_sessions','delete,truncate,trigger') then
  raise exception 'Inherited public training privilege remains';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
