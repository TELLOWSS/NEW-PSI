-- Record-master server boundary.
-- All record-master reads and writes must pass through the authenticated Vercel
-- API and its service-role client. This migration supports both the compatibility
-- schema (companies table + groups view) and the final group cutover schema.

begin;

do $$
declare
    relation_row record;
    policy_row record;
begin
    for relation_row in
        select c.relname, c.relkind
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = any(array[
               'record_master_templates',
               'record_master_groups',
               'record_master_companies',
               'record_master_assignments',
               'record_master_assignment_groups'
           ])
    loop
        execute format(
            'revoke all on table public.%I from public, anon, authenticated',
            relation_row.relname
        );
        execute format(
            'grant select, insert, update, delete on table public.%I to service_role',
            relation_row.relname
        );

        if relation_row.relkind in ('r', 'p') then
            execute format('alter table public.%I enable row level security', relation_row.relname);
            execute format('alter table public.%I force row level security', relation_row.relname);

            for policy_row in
                select policyname
                  from pg_policies
                 where schemaname = 'public'
                   and tablename = relation_row.relname
            loop
                execute format(
                    'drop policy if exists %I on public.%I',
                    policy_row.policyname,
                    relation_row.relname
                );
            end loop;
        elsif relation_row.relkind = 'v' then
            -- PostgreSQL 15+ / Supabase: make the view obey privileges and RLS of
            -- the querying role instead of silently using its owner privileges.
            execute format(
                'alter view public.%I set (security_invoker = true)',
                relation_row.relname
            );
        end if;
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
