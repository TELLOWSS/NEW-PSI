-- Staging-only strict policies. Requires identity, workers, evidence and disclosure proposals.
-- Do NOT run against live data: existing rows are deliberately refused.
begin;
do $$ begin
 if exists(select 1 from public.psi_tenant_evidence_receipts limit 1)
 or exists(select 1 from public.psi_tenant_disclosure_requests limit 1)
 or exists(select 1 from public.psi_tenant_disclosure_decisions limit 1)
 then raise exception 'Existing records require separately verified non-destructive migration'; end if;
end $$;
alter table public.psi_tenant_evidence_receipts add column site_id uuid not null;
grant insert(site_id) on public.psi_tenant_evidence_receipts to authenticated;
alter table public.psi_tenant_disclosure_requests add column site_id uuid not null;
grant insert(site_id) on public.psi_tenant_disclosure_requests to authenticated;
alter table public.psi_tenant_disclosure_decisions add column site_id uuid not null;
grant insert(site_id) on public.psi_tenant_disclosure_decisions to authenticated;
alter table public.psi_tenant_evidence_receipts
 add constraint psi_receipt_site_fk foreign key(tenant_id,site_id)
 references public.psi_tenant_sites(tenant_id,id);
alter table public.psi_tenant_evidence_receipts
 add constraint psi_receipt_site_worker_fk foreign key(tenant_id,site_id,worker_id)
 references public.psi_tenant_site_worker_assignments(tenant_id,site_id,worker_id);
alter table public.psi_tenant_disclosure_requests
 add constraint psi_request_site_fk foreign key(tenant_id,site_id)
 references public.psi_tenant_sites(tenant_id,id);
alter table public.psi_tenant_disclosure_requests
 add constraint psi_request_site_unique unique(tenant_id,site_id,id);
alter table public.psi_tenant_disclosure_decisions
 add constraint psi_decision_same_site_fk foreign key(tenant_id,site_id,request_id)
 references public.psi_tenant_disclosure_requests(tenant_id,site_id,id);
create policy psi_evidence_site_select on public.psi_tenant_evidence_receipts as restrictive
for select to authenticated using(
 exists(select 1 from public.psi_tenant_site_memberships sm
   join public.psi_tenant_sites s on s.tenant_id=sm.tenant_id and s.id=sm.site_id
   join public.psi_tenant_memberships m on m.tenant_id=sm.tenant_id and m.user_id=sm.user_id
   where sm.tenant_id=psi_tenant_evidence_receipts.tenant_id and sm.site_id=psi_tenant_evidence_receipts.site_id
     and sm.user_id=(select auth.uid()) and sm.status='active'
     and s.active and m.status='active')
);
create policy psi_evidence_site_insert on public.psi_tenant_evidence_receipts as restrictive
for insert to authenticated with check(
 exists(select 1 from public.psi_tenant_site_memberships sm
   join public.psi_tenant_sites s on s.tenant_id=sm.tenant_id and s.id=sm.site_id
   join public.psi_tenant_memberships m on m.tenant_id=sm.tenant_id and m.user_id=sm.user_id
   where sm.tenant_id=psi_tenant_evidence_receipts.tenant_id and sm.site_id=psi_tenant_evidence_receipts.site_id
     and sm.user_id=(select auth.uid()) and sm.status='active'
     and s.active and m.status='active')
 and exists(select 1 from public.psi_tenant_site_worker_assignments wa
 where wa.tenant_id=psi_tenant_evidence_receipts.tenant_id and wa.site_id=psi_tenant_evidence_receipts.site_id
 and wa.worker_id=psi_tenant_evidence_receipts.worker_id and wa.active)
);
create policy psi_disclosure_site_select on public.psi_tenant_disclosure_requests as restrictive
for select to authenticated using(
 exists(select 1 from public.psi_tenant_site_memberships sm
   join public.psi_tenant_sites s on s.tenant_id=sm.tenant_id and s.id=sm.site_id
   join public.psi_tenant_memberships m on m.tenant_id=sm.tenant_id and m.user_id=sm.user_id
   where sm.tenant_id=psi_tenant_disclosure_requests.tenant_id and sm.site_id=psi_tenant_disclosure_requests.site_id
     and sm.user_id=(select auth.uid()) and sm.status='active'
     and s.active and m.status='active')
);
create policy psi_disclosure_site_insert on public.psi_tenant_disclosure_requests as restrictive
for insert to authenticated with check(
 exists(select 1 from public.psi_tenant_site_memberships sm
   join public.psi_tenant_sites s on s.tenant_id=sm.tenant_id and s.id=sm.site_id
   join public.psi_tenant_memberships m on m.tenant_id=sm.tenant_id and m.user_id=sm.user_id
   where sm.tenant_id=psi_tenant_disclosure_requests.tenant_id and sm.site_id=psi_tenant_disclosure_requests.site_id
     and sm.user_id=(select auth.uid()) and sm.status='active'
     and s.active and m.status='active')
);
create policy psi_decision_site_select on public.psi_tenant_disclosure_decisions as restrictive
for select to authenticated using(
 exists(select 1 from public.psi_tenant_site_memberships sm
   join public.psi_tenant_sites s on s.tenant_id=sm.tenant_id and s.id=sm.site_id
   join public.psi_tenant_memberships m on m.tenant_id=sm.tenant_id and m.user_id=sm.user_id
   where sm.tenant_id=psi_tenant_disclosure_decisions.tenant_id and sm.site_id=psi_tenant_disclosure_decisions.site_id
     and sm.user_id=(select auth.uid()) and sm.status='active'
     and s.active and m.status='active')
);
create policy psi_decision_site_insert on public.psi_tenant_disclosure_decisions as restrictive
for insert to authenticated with check(
 exists(select 1 from public.psi_tenant_site_memberships sm
   join public.psi_tenant_sites s on s.tenant_id=sm.tenant_id and s.id=sm.site_id
   join public.psi_tenant_memberships m on m.tenant_id=sm.tenant_id and m.user_id=sm.user_id
   where sm.tenant_id=psi_tenant_disclosure_decisions.tenant_id and sm.site_id=psi_tenant_disclosure_decisions.site_id
     and sm.user_id=(select auth.uid()) and sm.status='active'
     and s.active and m.status='active')
);
commit;
