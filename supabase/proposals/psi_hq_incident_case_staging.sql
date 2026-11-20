-- HQ-SAFE DESIGN PROPOSAL ONLY (2026-11-20).
-- DO NOT RUN IN PRODUCTION. Depends on unmerged psi_tenant_sites / psi_tenant_site_memberships
-- staging schema and an operator-approved tenant/site migration plan.
-- No existing records are moved, no roles/ACLs are broadened, no service keys are used.
begin;

create table public.psi_hq_incident_cases (
  tenant_id uuid not null,
  site_id uuid not null,
  id uuid not null default gen_random_uuid(),
  occurred_on date not null,
  construction_zone text not null check(construction_zone in ('기초','지하','지상','옥탑')),
  process_code text not null check(process_code in (
    'underground-wall','underground-slab','formwork','gangform','alform',
    'rebar','pour','shoring','scaffold','lifting'
  )),
  incident_type text not null check(length(btrim(incident_type)) between 1 and 80),
  summary text not null check(length(btrim(summary)) between 8 and 1000),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(tenant_id,site_id,id),
  foreign key(tenant_id,site_id) references public.psi_tenant_sites(tenant_id,id) on delete restrict
);

create table public.psi_hq_incident_claims (
  tenant_id uuid not null,
  site_id uuid not null,
  case_id uuid not null,
  id uuid not null default gen_random_uuid(),
  classification text not null check(classification in ('fact','hypothesis','unknown')),
  description text not null check(length(btrim(description)) between 8 and 1000),
  evidence_kind text check(evidence_kind in ('photo','document','statement','site-check','other')),
  evidence_ref text not null default '' check(length(evidence_ref)<=180),
  origin text not null default 'human' check(origin in ('human','ai-suggested')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(tenant_id,site_id,case_id,id),
  foreign key(tenant_id,site_id,case_id)
    references public.psi_hq_incident_cases(tenant_id,site_id,id) on delete restrict,
  constraint hq_fact_needs_reference check(
    classification <> 'fact' or (evidence_kind is not null and length(btrim(evidence_ref))>=4)
  )
);

create table public.psi_hq_incident_review_events (
  tenant_id uuid not null,
  site_id uuid not null,
  case_id uuid not null,
  id uuid not null default gen_random_uuid(),
  event_type text not null check(event_type in ('review_requested','revision_required','review_completed')),
  reason text not null check(length(btrim(reason)) between 4 and 1000),
  acted_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  primary key(tenant_id,site_id,case_id,id),
  foreign key(tenant_id,site_id,case_id)
    references public.psi_hq_incident_cases(tenant_id,site_id,id) on delete restrict
);

alter table public.psi_hq_incident_cases enable row level security;
alter table public.psi_hq_incident_cases force row level security;
alter table public.psi_hq_incident_claims enable row level security;
alter table public.psi_hq_incident_claims force row level security;
alter table public.psi_hq_incident_review_events enable row level security;
alter table public.psi_hq_incident_review_events force row level security;

revoke all on public.psi_hq_incident_cases,public.psi_hq_incident_claims,public.psi_hq_incident_review_events from public,anon,authenticated,service_role;
grant select,insert on public.psi_hq_incident_cases,public.psi_hq_incident_claims,public.psi_hq_incident_review_events to authenticated;

-- Site scope is mandatory even for tenant owner/admin. No implicit cross-site read.
create policy hq_cases_read on public.psi_hq_incident_cases
for select to authenticated using (
  exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=psi_hq_incident_cases.tenant_id and tm.user_id=(select auth.uid()) and tm.status='active')
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_hq_incident_cases.tenant_id and sm.site_id=psi_hq_incident_cases.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
);

create policy hq_cases_insert on public.psi_hq_incident_cases
for insert to authenticated with check (
  created_by=(select auth.uid())
  and exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=psi_hq_incident_cases.tenant_id and tm.user_id=(select auth.uid())
      and tm.status='active' and tm.role in ('owner','admin','reviewer'))
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_hq_incident_cases.tenant_id and sm.site_id=psi_hq_incident_cases.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
);

create policy hq_claims_read on public.psi_hq_incident_claims
for select to authenticated using (
  exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=psi_hq_incident_claims.tenant_id and tm.user_id=(select auth.uid()) and tm.status='active')
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_hq_incident_claims.tenant_id and sm.site_id=psi_hq_incident_claims.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
);

create policy hq_claims_insert on public.psi_hq_incident_claims
for insert to authenticated with check (
  created_by=(select auth.uid())
  and exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=psi_hq_incident_claims.tenant_id and tm.user_id=(select auth.uid())
      and tm.status='active' and tm.role in ('owner','admin','reviewer'))
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_hq_incident_claims.tenant_id and sm.site_id=psi_hq_incident_claims.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
);

create policy hq_review_events_read on public.psi_hq_incident_review_events
for select to authenticated using (
  exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=psi_hq_incident_review_events.tenant_id and tm.user_id=(select auth.uid()) and tm.status='active')
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_hq_incident_review_events.tenant_id and sm.site_id=psi_hq_incident_review_events.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
);

create policy hq_review_events_insert on public.psi_hq_incident_review_events
for insert to authenticated with check (
  acted_by=(select auth.uid())
  and exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=psi_hq_incident_review_events.tenant_id and tm.user_id=(select auth.uid())
      and tm.status='active' and tm.role in ('owner','admin','reviewer'))
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=psi_hq_incident_review_events.tenant_id and sm.site_id=psi_hq_incident_review_events.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
  and (
    event_type <> 'review_completed'
    or exists(select 1 from public.psi_hq_incident_cases incident
      where incident.tenant_id=psi_hq_incident_review_events.tenant_id
        and incident.site_id=psi_hq_incident_review_events.site_id
        and incident.id=psi_hq_incident_review_events.case_id
        and incident.created_by<>(select auth.uid()))
  )
);

-- Append-only case/evidence/review event records: no UPDATE/DELETE privileges or RLS policy.
-- Client can never overwrite a source or turn a recorded claim into a verified finding.
-- A separate authenticated approval service must validate case readiness and source integrity
-- before any review_completed event becomes authoritative. This SQL does NOT provide it.
commit;
