-- 13차 P05 실험용 SQL: 운영 DB에는 적용하지 않습니다.
begin;
create table public.psi_tenant_sites(
 tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
 id uuid not null default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 2 and 160),
 active boolean not null default true,
 primary key(tenant_id,id)
);
create table public.psi_tenant_site_memberships(
 tenant_id uuid not null,
 site_id uuid not null,
 user_id uuid not null,
 status text not null default 'active' check(status in ('active','suspended')),
 primary key(tenant_id,site_id,user_id),
 foreign key(tenant_id,site_id) references public.psi_tenant_sites(tenant_id,id) on delete restrict,
 foreign key(tenant_id,user_id) references public.psi_tenant_memberships(tenant_id,user_id) on delete restrict
);
create table public.psi_tenant_site_worker_assignments(
 tenant_id uuid not null,
 site_id uuid not null,
 worker_id uuid not null,
 active boolean not null default true,
 primary key(tenant_id,site_id,worker_id),
 foreign key(tenant_id,site_id) references public.psi_tenant_sites(tenant_id,id) on delete restrict,
 foreign key(tenant_id,worker_id) references public.psi_tenant_workers(tenant_id,id) on delete restrict
);
alter table public.psi_tenant_sites enable row level security;
alter table public.psi_tenant_sites force row level security;
alter table public.psi_tenant_site_memberships enable row level security;
alter table public.psi_tenant_site_memberships force row level security;
alter table public.psi_tenant_site_worker_assignments enable row level security;
alter table public.psi_tenant_site_worker_assignments force row level security;
revoke all on public.psi_tenant_sites,public.psi_tenant_site_memberships,public.psi_tenant_site_worker_assignments from public,anon,authenticated,service_role;
grant select on public.psi_tenant_sites,public.psi_tenant_site_memberships to authenticated;
create policy psi_site_memberships_read on public.psi_tenant_site_memberships
for select to authenticated using(
 user_id=(select auth.uid()) and status='active'
 and exists(select 1 from public.psi_tenant_memberships m
 where m.tenant_id=psi_tenant_site_memberships.tenant_id and m.user_id=(select auth.uid()) and m.status='active')
);
create policy psi_sites_read on public.psi_tenant_sites
for select to authenticated using(active and exists(
 select 1 from public.psi_tenant_site_memberships sm
 where sm.tenant_id=psi_tenant_sites.tenant_id and sm.site_id=psi_tenant_sites.id
 and sm.user_id=(select auth.uid()) and sm.status='active'
));
commit;
