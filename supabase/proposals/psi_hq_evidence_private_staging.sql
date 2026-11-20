-- HQ-SAFE PHASE 13 PROPOSAL ONLY. DO NOT APPLY TO PRODUCTION.
-- Prerequisites: unmerged psi_tenant_sites/site_memberships, incident cases,
-- and private reviewer proposal if reviewer metadata visibility is needed.
-- This file defines METADATA and audit events, NOT a Storage bucket/object.
-- No actual file upload, signing URL or data API is enabled here.
begin;
create schema hq_evidence_staging;
revoke all on schema hq_evidence_staging from public,anon,authenticated,service_role;
grant usage on schema hq_evidence_staging to authenticated;

create table hq_evidence_staging.evidence_manifest (
 tenant_id uuid not null,
 site_id uuid not null,
 case_id uuid not null,
 id uuid not null,
 storage_bucket text not null default 'hq-incident-evidence-private'
   check(storage_bucket='hq-incident-evidence-private'),
 storage_key text not null,
 media_type text not null check(media_type in ('image/jpeg','image/png','application/pdf')),
 byte_count bigint not null check(byte_count between 1 and 8388608),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}
   check(source_authenticity_verified=false),
 byte_integrity_verified_at timestamptz not null default now(),
 verified_by uuid not null references auth.users(id) on delete restrict,
 primary key(tenant_id,site_id,case_id,id),
 unique(storage_bucket,storage_key),
 foreign key(tenant_id,site_id,case_id)
   references public.psi_hq_incident_cases(tenant_id,site_id,id) on delete restrict,
 constraint hq_evidence_storage_path check(
   storage_key=lower(tenant_id::text)||'/'||lower(site_id::text)||'/'||
     lower(case_id::text)||'/'||lower(id::text)||'.'||
     (case when media_type='image/jpeg' then 'jpg'
           when media_type='image/png' then 'png' else 'pdf' end)
 )
);
create index hq_evidence_case_idx on hq_evidence_staging.evidence_manifest(tenant_id,site_id,case_id);

create table hq_evidence_staging.access_events (
 tenant_id uuid not null,site_id uuid not null,case_id uuid not null,
 evidence_id uuid not null,id uuid not null default gen_random_uuid(),
 event_type text not null check(event_type in (
   'intake_verified','read_requested','read_denied','download_completed','digest_mismatch')),
 actor_id uuid not null references auth.users(id) on delete restrict,
 occurred_at timestamptz not null default now(),
 -- No raw filenames, signed URLs, bearer tokens, narrative or medical details.
 event_code text not null check(event_code ~ '^[A-Z0-9_]{4,36}$'),
 primary key(tenant_id,site_id,case_id,evidence_id,id),
 foreign key(tenant_id,site_id,case_id,evidence_id)
  references hq_evidence_staging.evidence_manifest(tenant_id,site_id,case_id,id)
  on delete restrict
);
create index hq_evidence_access_idx on hq_evidence_staging.access_events
 (tenant_id,site_id,case_id,evidence_id,occurred_at);

alter table hq_evidence_staging.evidence_manifest enable row level security;
alter table hq_evidence_staging.evidence_manifest force row level security;
alter table hq_evidence_staging.access_events enable row level security;
alter table hq_evidence_staging.access_events force row level security;
revoke all on hq_evidence_staging.evidence_manifest,hq_evidence_staging.access_events
 from public,anon,authenticated,service_role;

-- A verified signed-in user can see *metadata only* if author or assigned
-- review participant, subject to active enterprise and active site membership.
-- Deliberately no browser INSERT/UPDATE/DELETE privileges for metadata or logs.
grant select on hq_evidence_staging.evidence_manifest to authenticated;
create policy hq_evidence_metadata_read on hq_evidence_staging.evidence_manifest
 for select to authenticated using (
  exists(select 1 from public.psi_tenant_memberships tm
   where tm.tenant_id=evidence_manifest.tenant_id
    and tm.user_id=(select auth.uid()) and tm.status='active')
  and exists(select 1 from public.psi_tenant_site_memberships sm
   where sm.tenant_id=evidence_manifest.tenant_id
    and sm.site_id=evidence_manifest.site_id
    and sm.user_id=(select auth.uid()) and sm.status='active')
  and exists(select 1 from public.psi_tenant_sites s
   where s.tenant_id=evidence_manifest.tenant_id and s.id=evidence_manifest.site_id
    and s.active=true)
  and (
    exists(select 1 from public.psi_hq_incident_cases c
      where c.tenant_id=evidence_manifest.tenant_id and c.site_id=evidence_manifest.site_id
        and c.id=evidence_manifest.case_id and c.created_by=(select auth.uid()))
    or exists(select 1 from hq_safe_staging.review_assignments a
      where a.tenant_id=evidence_manifest.tenant_id and a.site_id=evidence_manifest.site_id
        and a.case_id=evidence_manifest.case_id
        and (select auth.uid()) in (a.assigned_by,a.site_reviewer_id,a.hq_reviewer_id))
  )
 );
-- No authenticated SELECT policy on access_events; auditors must go through
-- a separately reviewed privileged workflow, not direct browser queries.
-- No INSERT/UPDATE/DELETE grants or policies for either table.
-- A trusted operator alone provisionally writes metadata/events, after verifying
-- bytes, authenticated scope, malware scanning and actual private object existence.
commit;
),
 -- Only a trusted, independent malware scanner may register CLEAN at intake.
 -- Pending/blocked objects are never downloadable through the Phase-14 gate.
 malware_scan_status text not null default 'pending'
   check(malware_scan_status in ('pending','clean','blocked')),
 source_authenticity_verified boolean not null default false
   check(source_authenticity_verified=false),
 byte_integrity_verified_at timestamptz not null default now(),
 verified_by uuid not null references auth.users(id) on delete restrict,
 primary key(tenant_id,site_id,case_id,id),
 unique(storage_bucket,storage_key),
 foreign key(tenant_id,site_id,case_id)
   references public.psi_hq_incident_cases(tenant_id,site_id,id) on delete restrict,
 constraint hq_evidence_storage_path check(
   storage_key=lower(tenant_id::text)||'/'||lower(site_id::text)||'/'||
     lower(case_id::text)||'/'||lower(id::text)||'.'||
     (case when media_type='image/jpeg' then 'jpg'
           when media_type='image/png' then 'png' else 'pdf' end)
 )
);
create index hq_evidence_case_idx on hq_evidence_staging.evidence_manifest(tenant_id,site_id,case_id);

create table hq_evidence_staging.access_events (
 tenant_id uuid not null,site_id uuid not null,case_id uuid not null,
 evidence_id uuid not null,id uuid not null default gen_random_uuid(),
 event_type text not null check(event_type in (
   'intake_verified','read_requested','read_denied','download_completed','digest_mismatch')),
 actor_id uuid not null references auth.users(id) on delete restrict,
 occurred_at timestamptz not null default now(),
 -- No raw filenames, signed URLs, bearer tokens, narrative or medical details.
 event_code text not null check(event_code ~ '^[A-Z0-9_]{4,36}$'),
 primary key(tenant_id,site_id,case_id,evidence_id,id),
 foreign key(tenant_id,site_id,case_id,evidence_id)
  references hq_evidence_staging.evidence_manifest(tenant_id,site_id,case_id,id)
  on delete restrict
);
create index hq_evidence_access_idx on hq_evidence_staging.access_events
 (tenant_id,site_id,case_id,evidence_id,occurred_at);

alter table hq_evidence_staging.evidence_manifest enable row level security;
alter table hq_evidence_staging.evidence_manifest force row level security;
alter table hq_evidence_staging.access_events enable row level security;
alter table hq_evidence_staging.access_events force row level security;
revoke all on hq_evidence_staging.evidence_manifest,hq_evidence_staging.access_events
 from public,anon,authenticated,service_role;

-- A verified signed-in user can see *metadata only* if author or assigned
-- review participant, subject to active enterprise and active site membership.
-- Deliberately no browser INSERT/UPDATE/DELETE privileges for metadata or logs.
grant select on hq_evidence_staging.evidence_manifest to authenticated;
create policy hq_evidence_metadata_read on hq_evidence_staging.evidence_manifest
 for select to authenticated using (
  exists(select 1 from public.psi_tenant_memberships tm
   where tm.tenant_id=evidence_manifest.tenant_id
    and tm.user_id=(select auth.uid()) and tm.status='active')
  and exists(select 1 from public.psi_tenant_site_memberships sm
   where sm.tenant_id=evidence_manifest.tenant_id
    and sm.site_id=evidence_manifest.site_id
    and sm.user_id=(select auth.uid()) and sm.status='active')
  and exists(select 1 from public.psi_tenant_sites s
   where s.tenant_id=evidence_manifest.tenant_id and s.id=evidence_manifest.site_id
    and s.active=true)
  and (
    exists(select 1 from public.psi_hq_incident_cases c
      where c.tenant_id=evidence_manifest.tenant_id and c.site_id=evidence_manifest.site_id
        and c.id=evidence_manifest.case_id and c.created_by=(select auth.uid()))
    or exists(select 1 from hq_safe_staging.review_assignments a
      where a.tenant_id=evidence_manifest.tenant_id and a.site_id=evidence_manifest.site_id
        and a.case_id=evidence_manifest.case_id
        and (select auth.uid()) in (a.assigned_by,a.site_reviewer_id,a.hq_reviewer_id))
  )
 );
-- No authenticated SELECT policy on access_events; auditors must go through
-- a separately reviewed privileged workflow, not direct browser queries.
-- No INSERT/UPDATE/DELETE grants or policies for either table.
-- A trusted operator alone provisionally writes metadata/events, after verifying
-- bytes, authenticated scope, malware scanning and actual private object existence.
commit;
