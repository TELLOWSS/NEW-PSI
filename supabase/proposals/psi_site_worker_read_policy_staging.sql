-- Staging supplement: RLS policy lookup must have SELECT privilege.
begin;
grant select on public.psi_tenant_site_worker_assignments to authenticated;
create policy psi_site_worker_assignments_read
on public.psi_tenant_site_worker_assignments for select to authenticated
using(active and exists(
 select 1 from public.psi_tenant_site_memberships sm
 where sm.tenant_id=psi_tenant_site_worker_assignments.tenant_id
 and sm.site_id=psi_tenant_site_worker_assignments.site_id
 and sm.user_id=(select auth.uid()) and sm.status='active'
));
commit;
