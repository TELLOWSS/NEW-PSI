-- Additive foundation only. Does not assign, move or expose legacy records.
-- Provision organizations and membership through a trusted operator, never a browser.
begin;

create table public.psi_tenants (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 1 and 200),
    created_at timestamptz not null default now()
);

create table public.psi_tenant_memberships (
    tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'reviewer', 'viewer')),
    status text not null default 'active' check (status in ('active', 'suspended')),
    created_at timestamptz not null default now(),
    primary key (tenant_id, user_id)
);
create index psi_tenant_memberships_user_idx on public.psi_tenant_memberships(user_id, tenant_id);

alter table public.psi_tenants enable row level security;
alter table public.psi_tenants force row level security;
alter table public.psi_tenant_memberships enable row level security;
alter table public.psi_tenant_memberships force row level security;
revoke all on public.psi_tenants, public.psi_tenant_memberships from anon, authenticated;
grant select on public.psi_tenants, public.psi_tenant_memberships to authenticated;
grant all on public.psi_tenants, public.psi_tenant_memberships to service_role;

create policy tenant_membership_self_read on public.psi_tenant_memberships
    for select to authenticated
    using (user_id = (select auth.uid()) and status = 'active');

create policy tenant_member_read on public.psi_tenants
    for select to authenticated
    using (exists (
        select 1 from public.psi_tenant_memberships membership
        where membership.tenant_id = psi_tenants.id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
    ));

comment on table public.psi_tenants is 'Identity foundation. Legacy PSI data is not yet tenant scoped.';
commit;
