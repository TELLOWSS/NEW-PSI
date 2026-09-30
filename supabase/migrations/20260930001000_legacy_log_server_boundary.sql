-- Legacy logs remain single-site, available only through authenticated server APIs.
-- No data changes, new grants, policy removal or tenant ownership assignment.
begin;
do $$
declare relation_row record;
begin
 for relation_row in
  select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=any(array[
   'training_access_attempts','report_message_logs','report_message_monthly_summary',
   'report_message_team_summary','report_message_failure_summary',
   'report_message_send_mode_summary','report_message_retry_queue'])
 loop
  execute format('revoke all on table public.%I from public, anon, authenticated',relation_row.relname);
  if relation_row.relkind in ('r','p') then
   execute format('alter table public.%I enable row level security',relation_row.relname);
   execute format('alter table public.%I force row level security',relation_row.relname);
  elsif relation_row.relkind='v' then
   execute format('alter view public.%I set (security_invoker=true)',relation_row.relname);
  else
   raise exception 'Unexpected legacy log relation kind';
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
