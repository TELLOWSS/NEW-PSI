-- SAFETY NEXUS P2 · PROPOSAL ONLY / NOT AN APPLIED MIGRATION.
-- Source rows and signed official report documents are NOT currently on this path.
-- These receipts store ONLY anonymous counts + SHA-256 digests, never worker identities.
-- They are append-only: revisions require a new receipt, not a silent overwrite.
-- NO client write grant. NO official verification state exists until an independently
-- authorized evidence intake + separate reviewer acceptance pipeline is implemented.
begin;

create table public.psi_nexus_source_manifest_staging (
  receipt_id uuid primary key,
  tenant_id uuid not null,
  site_id uuid not null,
  assessment_month date not null check (extract(day from assessment_month)=1),
  job_field text not null check (length(btrim(job_field)) between 1 and 120),
  source_cutoff_at timestamptz not null,
  source_record_count integer not null check (source_record_count > 0 and source_record_count <= 10000),
  self_risk_high integer not null check (self_risk_high>=0),
  self_risk_medium integer not null check (self_risk_medium>=0),
  self_risk_low integer not null check (self_risk_low>=0),
  self_risk_unknown integer not null check (self_risk_unknown>=0),
  source_id_set_sha256 text not null check (source_id_set_sha256 ~ '^[a-f0-9]{64}$'),
  canonical_snapshot_sha256 text not null check (canonical_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  provenance_status text not null default 'scope_checked_not_server_attested'
    check (provenance_status='scope_checked_not_server_attested'),
  foreign key (tenant_id,site_id) references public.psi_tenant_sites(tenant_id,id) on delete restrict,
  constraint psi_nexus_manifest_risk_sum check (
    self_risk_high+self_risk_medium+self_risk_low+self_risk_unknown=source_record_count
  ),
  unique(tenant_id,site_id,assessment_month,job_field,source_cutoff_at,canonical_snapshot_sha256),
  unique(receipt_id,tenant_id,site_id,assessment_month,job_field,source_cutoff_at)
);

create table public.psi_nexus_external_report_receipt_staging (
  report_receipt_id uuid primary key,
  manifest_receipt_id uuid not null,
  tenant_id uuid not null,
  site_id uuid not null,
  assessment_month date not null,
  job_field text not null,
  source_cutoff_at timestamptz not null,
  external_original_sha256 text not null check (external_original_sha256 ~ '^[a-f0-9]{64}$'),
  external_document_mime text not null check (external_document_mime in (
    'application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  report_reference text not null check (length(btrim(report_reference)) between 1 and 160),
  source_system text not null check (length(btrim(source_system)) between 1 and 160),
  document_issued_at timestamptz not null,
  denominator_kind text not null check (denominator_kind='assessment_record_rows'),
  declared_denominator integer not null check (declared_denominator>=0),
  received_by uuid not null,
  received_at timestamptz not null default now(),
  independent_verification_status text not null default 'pending_external_evidence_review'
    check (independent_verification_status='pending_external_evidence_review'),
  foreign key (manifest_receipt_id,tenant_id,site_id,assessment_month,job_field,source_cutoff_at)
    references public.psi_nexus_source_manifest_staging
    (receipt_id,tenant_id,site_id,assessment_month,job_field,source_cutoff_at) on delete restrict,
  constraint psi_nexus_external_report_after_cutoff check (document_issued_at>=source_cutoff_at),
  unique (manifest_receipt_id, external_original_sha256)
);

create function public.psi_nexus_staging_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'NEXUS receipts are append-only; create a new version';
end;
$$;
create trigger psi_nexus_manifest_append_only
before update or delete on public.psi_nexus_source_manifest_staging
for each row execute function public.psi_nexus_staging_append_only();
create trigger psi_nexus_report_append_only
before update or delete on public.psi_nexus_external_report_receipt_staging
for each row execute function public.psi_nexus_staging_append_only();
revoke all on function public.psi_nexus_staging_append_only() from public,anon,authenticated,service_role;

alter table public.psi_nexus_source_manifest_staging enable row level security;
alter table public.psi_nexus_source_manifest_staging force row level security;
alter table public.psi_nexus_external_report_receipt_staging enable row level security;
alter table public.psi_nexus_external_report_receipt_staging force row level security;

revoke all on public.psi_nexus_source_manifest_staging from public,anon,authenticated,service_role;
revoke all on public.psi_nexus_external_report_receipt_staging from public,anon,authenticated,service_role;
grant select on public.psi_nexus_source_manifest_staging to authenticated;
grant select on public.psi_nexus_external_report_receipt_staging to authenticated;

create policy psi_nexus_manifest_site_member_read
on public.psi_nexus_source_manifest_staging for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id=psi_nexus_source_manifest_staging.tenant_id
      and m.user_id=(select auth.uid()) and m.status='active'
  ) and exists (
    select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_nexus_source_manifest_staging.tenant_id
      and sm.site_id=psi_nexus_source_manifest_staging.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active'
  ) and exists (
    select 1 from public.psi_tenant_sites s
    where s.tenant_id=psi_nexus_source_manifest_staging.tenant_id
      and s.id=psi_nexus_source_manifest_staging.site_id and s.active
  )
);
create policy psi_nexus_external_report_site_member_read
on public.psi_nexus_external_report_receipt_staging for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id=psi_nexus_external_report_receipt_staging.tenant_id
      and m.user_id=(select auth.uid()) and m.status='active'
  ) and exists (
    select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_nexus_external_report_receipt_staging.tenant_id
      and sm.site_id=psi_nexus_external_report_receipt_staging.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active'
  ) and exists (
    select 1 from public.psi_tenant_sites s
    where s.tenant_id=psi_nexus_external_report_receipt_staging.tenant_id
      and s.id=psi_nexus_external_report_receipt_staging.site_id and s.active
  )
);
commit;
