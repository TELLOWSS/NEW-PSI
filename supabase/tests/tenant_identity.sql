-- Run against an isolated Supabase test database after applying the migration.
-- Always rolled back. Any unexpected result raises an exception.
begin;
insert into auth.users(id) values
 ('a7290000-0000-4000-8000-000000000001'),
 ('a7290000-0000-4000-8000-000000000002');
insert into public.psi_tenants(id, name) values
 ('b7290000-0000-4000-8000-000000000001', 'Isolation test A'),
 ('b7290000-0000-4000-8000-000000000002', 'Isolation test B');
insert into public.psi_tenant_memberships(tenant_id, user_id, role, status) values
 ('b7290000-0000-4000-8000-000000000001', 'a7290000-0000-4000-8000-000000000001', 'owner', 'active'),
 ('b7290000-0000-4000-8000-000000000002', 'a7290000-0000-4000-8000-000000000002', 'owner', 'active'),
 ('b7290000-0000-4000-8000-000000000002', 'a7290000-0000-4000-8000-000000000001', 'viewer', 'suspended');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7290000-0000-4000-8000-000000000001', true);
do $$
begin
 if (select count(*) from public.psi_tenants) <> 1 then raise exception 'Cross-tenant visibility'; end if;
 if not exists(select 1 from public.psi_tenants where id = 'b7290000-0000-4000-8000-000000000001') then raise exception 'Own tenant missing'; end if;
 if (select count(*) from public.psi_tenant_memberships) <> 1 then raise exception 'Membership disclosure'; end if;
 begin
   update public.psi_tenant_memberships set role = 'admin';
   raise exception 'Membership mutation unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claim.sub', 'a7290000-0000-4000-8000-000000000002', true);
do $$
begin
 if (select count(*) from public.psi_tenants) <> 1 then raise exception 'Reverse isolation failure'; end if;
 if exists(select 1 from public.psi_tenants where id = 'b7290000-0000-4000-8000-000000000001') then raise exception 'Tenant A disclosed'; end if;
end $$;

reset role;
set local role anon;
do $$
begin
 begin
   perform 1 from public.psi_tenants;
   raise exception 'Anonymous access unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
