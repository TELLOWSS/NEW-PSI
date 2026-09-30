-- Read-only role checks; no customer records are read or changed.
begin;
do $$ declare r record; begin
 for r in select c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  and c.relname=any(array['training_access_attempts','report_message_logs',
   'report_message_monthly_summary','report_message_team_summary','report_message_failure_summary',
   'report_message_send_mode_summary','report_message_retry_queue']) loop
  if has_any_column_privilege('anon',r.oid,'select,insert,update,references')
   or has_any_column_privilege('authenticated',r.oid,'select,insert,update,references')
   or has_table_privilege('anon',r.oid,'delete,truncate,trigger')
   or has_table_privilege('authenticated',r.oid,'delete,truncate,trigger') then
   raise exception 'Public legacy log privilege remains: %',r.relname;
  end if;
  if not has_table_privilege('service_role',r.oid,'select') then raise exception 'Server read lost'; end if;
  if r.relkind in ('r','p') and (not r.relrowsecurity or not r.relforcerowsecurity) then raise exception 'RLS not enforced'; end if;
  if r.relkind='v' and not coalesce(r.reloptions @> array['security_invoker=true'],false) then raise exception 'View execution boundary missing'; end if;
 end loop;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.training_access_attempts limit 0;
  raise exception 'Anonymous log read allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from public.report_message_retry_queue limit 0;
  raise exception 'Anonymous retry queue read allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
do $$ begin
 begin
  perform 1 from public.report_message_logs limit 0;
  raise exception 'Account cross-site log read allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ begin
 perform 1 from public.training_access_attempts limit 0;
 perform 1 from public.report_message_logs limit 0;
 perform 1 from public.report_message_monthly_summary limit 0;
 perform 1 from public.report_message_team_summary limit 0;
 perform 1 from public.report_message_failure_summary limit 0;
 perform 1 from public.report_message_retry_queue limit 0;
end $$;
reset role;
rollback;
select 'PASS: public access denied; server views valid; RLS enforced; no records read or changed' as result;
