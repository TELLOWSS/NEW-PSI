-- Read-only checks: do not return education text, audio URLs or customer records.
begin;
do $$ begin
 if not exists(select 1 from pg_class where oid='public.training_sessions'::regclass and relrowsecurity and relforcerowsecurity) then
  raise exception 'Training RLS not enforced';
 end if;
 if not exists(select 1 from pg_policy where polrelid='public.training_sessions'::regclass
  and polname='psi_training_session_server_boundary' and not polpermissive and polcmd='*'
  and pg_get_expr(polqual,polrelid)='false' and pg_get_expr(polwithcheck,polrelid)='false'
  and polroles @> array[(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')]) then
  raise exception 'Training restrictive boundary missing';
 end if;
 if has_any_column_privilege('anon','public.training_sessions','select,insert,update,references')
  or has_any_column_privilege('authenticated','public.training_sessions','select,insert,update,references')
  or has_table_privilege('anon','public.training_sessions','delete,truncate,trigger')
  or has_table_privilege('authenticated','public.training_sessions','delete,truncate,trigger') then
  raise exception 'Browser training privilege remains';
 end if;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.training_sessions limit 0; raise exception 'Anonymous direct read allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
do $$ begin
 begin perform 1 from public.training_sessions limit 0; raise exception 'Account direct read allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ begin
 perform 1 from public.training_sessions limit 0;
 if not has_table_privilege(current_user,'public.training_sessions','insert')
  or not has_table_privilege(current_user,'public.training_sessions','update')
  or not has_table_privilege(current_user,'public.training_sessions','delete') then
  raise exception 'Server training write permission missing';
 end if;
end $$;
reset role;
rollback;
select 'PASS: direct education reads and writes blocked; existing server permissions retained; customer records untouched' as result;
