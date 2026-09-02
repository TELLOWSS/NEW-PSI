-- Server-only boundary for minimal harness state and legacy best-practice data.
-- Apply AFTER deploying the service-role-only harness client and disabling the
-- browser's match_risk_best_practice_vectors lookup (including its embedding call).
-- Keep all existing rows, indexes and function bodies. Historical raw content is
-- retained but is no longer accessible with public/anon/authenticated credentials.
-- This is an ACL/RLS change, NOT historical-content cleanup or tenant isolation.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
    relation_row record;
    policy_row record;
    function_row record;
begin
    -- Exact allowlist: the seven tables consumed by harness/persistence.ts plus
    -- the legacy vector table. Do not revoke access to unrelated application data.
    for relation_row in
        select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind in ('r', 'p')
           and c.relname = any(array[
               'ai_prompt_versions',
               'ai_policy_versions',
               'ai_workflow_runs',
               'ai_workflow_events',
               'ai_guardrail_overrides',
               'ai_context_snapshots',
               'ai_human_approvals',
               'risk_best_practice_vectors'
           ])
    loop
        -- PostgreSQL also removes corresponding per-column privileges here.
        execute format(
            'revoke all on table public.%I from public, anon, authenticated',
            relation_row.relname
        );
        execute format(
            'grant select, insert, update, delete on table public.%I to service_role',
            relation_row.relname
        );
        execute format('alter table public.%I enable row level security', relation_row.relname);
        execute format('alter table public.%I force row level security', relation_row.relname);

        -- Old authenticated-read or admin-header policies must not survive.
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

        -- Supabase service_role normally has BYPASSRLS. An explicit policy also
        -- keeps the intended boundary if that flag is absent in a test database.
        execute format(
            'create policy %I on public.%I for all to service_role using (true) with check (true)',
            'psi_harness_server_only',
            relation_row.relname
        );
    end loop;

    -- The legacy matching RPC was SECURITY DEFINER and granted to anon, so table
    -- RLS alone would not close the raw-text read path. Restrict every existing
    -- overload; do not recreate the function or alter stored vectors.
    -- Timestamp trigger helpers have no browser consumers and remain executable
    -- by service_role for inserts/updates. Their trigger wiring is unchanged.
    for function_row in
        select p.proname, pg_get_function_identity_arguments(p.oid) as identity_arguments
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prokind = 'f'
           and p.proname = any(array[
               'match_risk_best_practice_vectors',
               'set_rbpv_updated_at',
               'set_harness_updated_at'
           ])
    loop
        execute format(
            'revoke all on function public.%I(%s) from public, anon, authenticated',
            function_row.proname,
            function_row.identity_arguments
        );
        execute format(
            'grant execute on function public.%I(%s) to service_role',
            function_row.proname,
            function_row.identity_arguments
        );
        execute format(
            'alter function public.%I(%s) security invoker',
            function_row.proname,
            function_row.identity_arguments
        );
        -- vector may live in public or extensions on existing Supabase projects.
        -- SECURITY INVOKER means this search path cannot confer owner privileges.
        execute format(
            'alter function public.%I(%s) set search_path = pg_catalog, public, extensions',
            function_row.proname,
            function_row.identity_arguments
        );
    end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
