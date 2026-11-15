-- SAFETY NEXUS P2: STAGING CONTRACT ONLY. DO NOT APPLY TO PRODUCTION.
-- Data must originate from a separately authorized, auditable server-side writer.
-- No live API, no WorkerRecord migration and no grant to write to authenticated clients.
begin;
create table public.psi_nexus_site_aggregate_staging (
  tenant_id uuid not null,
  site_id uuid not null,
  period_month date not null check (extract(day from period_month)=1),
  job_field text not null check (length(btrim(job_field)) between 1 and 120),
  source_cutoff_at timestamptz not null,
  loaded_record_rows integer not null check (loaded_record_rows >= 0),
  self_risk_high integer not null default 0 check (self_risk_high >= 0),
  self_risk_medium integer not null default 0 check (self_risk_medium >= 0),
  self_risk_low integer not null default 0 check (self_risk_low >= 0),
  self_risk_unknown integer not null default 0 check (self_risk_unknown >= 0),
  followup_unresolved integer not null default 0 check (followup_unresolved >= 0),
  followup_overdue integer not null default 0 check (followup_overdue >= 0),
  followup_interim integer not null default 0 check (followup_interim >= 0),
  followup_scheduled integer not null default 0 check (followup_scheduled >= 0),
  followup_reopened_history integer not null default 0 check (followup_reopened_history >= 0),
  followup_completion_logged integer not null default 0 check (followup_completion_logged >= 0),
  official_report_denominator integer check (official_report_denominator >= 0),
  report_reconciled_at timestamptz,
  primary key (tenant_id, site_id, period_month, job_field, source_cutoff_at),
  foreign key (tenant_id, site_id) references public.psi_tenant_sites(tenant_id,id) on delete restrict,
  constraint psi_nexus_self_risk_sum_matches_rows
    check (self_risk_high + self_risk_medium + self_risk_low + self_risk_unknown = loaded_record_rows),
  constraint psi_nexus_approved_report_denominator_consistency
    check (report_reconciled_at is null or
      (official_report_denominator is not null and official_report_denominator = loaded_record_rows))
);
alter table public.psi_nexus_site_aggregate_staging enable row level security;
alter table public.psi_nexus_site_aggregate_staging force row level security;
revoke all on public.psi_nexus_site_aggregate_staging from public,anon,authenticated,service_role;
grant select on public.psi_nexus_site_aggregate_staging to authenticated;

-- Both tenant and site membership must remain active. Site must remain active.
create policy psi_nexus_site_aggregate_read
on public.psi_nexus_site_aggregate_staging
for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id=psi_nexus_site_aggregate_staging.tenant_id
      and m.user_id=(select auth.uid()) and m.status='active'
  ) and exists (
    select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_nexus_site_aggregate_staging.tenant_id
      and sm.site_id=psi_nexus_site_aggregate_staging.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active'
  ) and exists (
    select 1 from public.psi_tenant_sites s
    where s.tenant_id=psi_nexus_site_aggregate_staging.tenant_id
      and s.id=psi_nexus_site_aggregate_staging.site_id and s.active
  )
);
commit;
