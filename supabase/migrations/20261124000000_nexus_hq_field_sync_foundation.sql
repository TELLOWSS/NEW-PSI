-- Phase B: Multi-site HQ ↔ Field Sync Foundation (Server-level Single-Site RLS)
-- Additive migration for:
--   1) psi_nexus_site_masters (dynamic company site & equipment master)
--   2) psi_nexus_pipeline_cases (30s capture, stop-work, HQ urgent directives)
--   3) psi_nexus_equipment_photos (pre-use heavy equipment verification with separation-of-duty)
--   4) psi_nexus_hq_visits (pre-visit briefing + field acknowledgement)
--   5) psi_nexus_training_signatures (12-language individual handwritten worker signature receipts)

begin;

-- 1. Dynamic Site & Equipment Master
create table public.psi_nexus_site_masters (
  tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  site_id uuid not null,
  site_code text not null check (length(btrim(site_code)) between 2 and 60),
  short_label text not null check (length(btrim(short_label)) between 2 and 80),
  focus_zone text not null check (focus_zone in ('foundation', 'substructure_rc', 'superstructure_std', 'rooftop_special')),
  focus_process text not null check (focus_process in ('formwork_general', 'gangform', 'alform', 'rebar', 'concrete_pour', 'stripping_curing')),
  focus_node_index text not null check (focus_node_index ~ '^(0[1-9]|10)$'),
  manager_name text not null default '' check (length(manager_name) <= 80),
  registered_equipment jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, site_id),
  foreign key (tenant_id, site_id) references public.psi_tenant_sites(tenant_id, id) on delete restrict
);

-- 2. Pipeline Actions, Stop-Work & HQ Directives
create table public.psi_nexus_pipeline_cases (
  tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  site_id uuid not null,
  case_code text not null check (length(btrim(case_code)) between 2 and 60),
  location_label text not null check (length(btrim(location_label)) between 2 and 200),
  observation_note text not null check (length(btrim(observation_note)) between 2 and 600),
  action_title text not null check (length(btrim(action_title)) between 2 and 600),
  assignee text not null check (length(btrim(assignee)) between 1 and 120),
  due_date date not null,
  stop_work_flag boolean not null default false,
  hq_directive_note text check (hq_directive_note is null or length(btrim(hq_directive_note)) <= 500),
  hq_directive_actor text check (hq_directive_actor is null or length(btrim(hq_directive_actor)) <= 120),
  hq_directive_at timestamptz,
  status text not null default 'action_required' check (status in ('action_required', 'handover_pending', 'recheck_pending', 'closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, site_id) references public.psi_tenant_sites(tenant_id, id) on delete restrict
);

create index psi_nexus_pipeline_cases_site_idx
  on public.psi_nexus_pipeline_cases(tenant_id, site_id, status, stop_work_flag);

-- 3. Construction Equipment Pre-Use Photo Verification (with separation-of-duty CHECK)
create table public.psi_nexus_equipment_photos (
  tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  site_id uuid not null,
  equipment_type text not null check (equipment_type in ('concrete_pump_car', 'tower_crane', 'mobile_crane', 'aerial_work_platform', 'excavator_drilling', 'gangform_hoist')),
  work_activity text not null check (length(btrim(work_activity)) between 2 and 300),
  storage_path text not null check (length(btrim(storage_path)) between 3 and 400),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_by_label text not null check (length(btrim(uploaded_by_label)) between 1 and 80),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_by_label text check (reviewed_by_label is null or length(btrim(reviewed_by_label)) <= 80),
  review_note text check (review_note is null or length(btrim(review_note)) <= 500),
  field_supplement_note text check (field_supplement_note is null or length(btrim(field_supplement_note)) <= 500),
  status text not null default 'submitted_to_hq' check (status in ('submitted_to_hq', 'hq_verified_for_ceo', 'revision_requested_hq', 'reported_to_ceo')),
  reviewed_at timestamptz,
  ceo_reported_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, site_id) references public.psi_tenant_sites(tenant_id, id) on delete restrict,
  constraint psi_nexus_equipment_separation_of_duty check (
    (status = 'submitted_to_hq')
    or (
      status in ('hq_verified_for_ceo', 'revision_requested_hq', 'reported_to_ceo')
      and reviewed_by is not null
      and reviewed_by <> uploaded_by
    )
  )
);

create index psi_nexus_equipment_photos_site_idx
  on public.psi_nexus_equipment_photos(tenant_id, site_id, status);

-- 4. HQ Visit Plans with Field Acknowledgement
create table public.psi_nexus_hq_visits (
  tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  site_id uuid not null,
  visit_date date not null,
  inspector_role text not null check (length(btrim(inspector_role)) between 2 and 120),
  purpose text not null check (length(btrim(purpose)) between 2 and 500),
  field_acknowledged_at timestamptz,
  field_acknowledged_by uuid references auth.users(id) on delete restrict,
  field_acknowledge_note text check (field_acknowledge_note is null or length(btrim(field_acknowledge_note)) <= 400),
  status text not null default 'scheduled_briefed' check (status in ('scheduled_briefed', 'in_field_inspection', 'action_issued_closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, site_id) references public.psi_tenant_sites(tenant_id, id) on delete restrict
);

-- 5. Individual 12-Language Handwritten Training Signature Receipts
create table public.psi_nexus_training_signatures (
  tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  site_id uuid not null,
  campaign_code text not null check (length(btrim(campaign_code)) between 2 and 80),
  worker_name text not null check (length(btrim(worker_name)) between 1 and 80),
  language_code text not null check (length(btrim(language_code)) between 2 and 16),
  signature_hash text not null check (length(btrim(signature_hash)) between 8 and 128),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  signed_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, site_id) references public.psi_tenant_sites(tenant_id, id) on delete restrict
);

-- Enable & Force RLS across all 5 tables
alter table public.psi_nexus_site_masters enable row level security;
alter table public.psi_nexus_site_masters force row level security;
alter table public.psi_nexus_pipeline_cases enable row level security;
alter table public.psi_nexus_pipeline_cases force row level security;
alter table public.psi_nexus_equipment_photos enable row level security;
alter table public.psi_nexus_equipment_photos force row level security;
alter table public.psi_nexus_hq_visits enable row level security;
alter table public.psi_nexus_hq_visits force row level security;
alter table public.psi_nexus_training_signatures enable row level security;
alter table public.psi_nexus_training_signatures force row level security;

revoke all on
  public.psi_nexus_site_masters,
  public.psi_nexus_pipeline_cases,
  public.psi_nexus_equipment_photos,
  public.psi_nexus_hq_visits,
  public.psi_nexus_training_signatures
  from public, anon, authenticated, service_role;

grant select, insert, update on
  public.psi_nexus_site_masters,
  public.psi_nexus_pipeline_cases,
  public.psi_nexus_equipment_photos,
  public.psi_nexus_hq_visits
  to authenticated;

grant select, insert on
  public.psi_nexus_training_signatures
  to authenticated;

-- RLS Policies: HQ roles ('owner','admin','reviewer') access all sites in tenant;
-- Site members read/write ONLY their active psi_tenant_site_memberships site_id.

-- Site Masters
create policy psi_nexus_site_masters_read on public.psi_nexus_site_masters
for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_site_masters.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_site_masters.tenant_id and sm.site_id = psi_nexus_site_masters.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

create policy psi_nexus_site_masters_hq_write on public.psi_nexus_site_masters
for all to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_site_masters.tenant_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin')
  )
) with check (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_site_masters.tenant_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin')
  )
);

-- Pipeline Cases
create policy psi_nexus_pipeline_cases_read on public.psi_nexus_pipeline_cases
for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_pipeline_cases.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_pipeline_cases.tenant_id and sm.site_id = psi_nexus_pipeline_cases.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

create policy psi_nexus_pipeline_cases_insert on public.psi_nexus_pipeline_cases
for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_pipeline_cases.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_pipeline_cases.tenant_id and sm.site_id = psi_nexus_pipeline_cases.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

create policy psi_nexus_pipeline_cases_update on public.psi_nexus_pipeline_cases
for update to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_pipeline_cases.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_pipeline_cases.tenant_id and sm.site_id = psi_nexus_pipeline_cases.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
) with check (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_pipeline_cases.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or (
        psi_nexus_pipeline_cases.hq_directive_note is null
        and exists (
          select 1 from public.psi_tenant_site_memberships sm
          join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
          where sm.tenant_id = psi_nexus_pipeline_cases.tenant_id and sm.site_id = psi_nexus_pipeline_cases.site_id
            and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
        )
      ))
  )
);

-- Equipment Photos (HQ verifies across all sites; Site uploads/resubmits strictly for own site)
create policy psi_nexus_equipment_photos_read on public.psi_nexus_equipment_photos
for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_equipment_photos.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_equipment_photos.tenant_id and sm.site_id = psi_nexus_equipment_photos.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

create policy psi_nexus_equipment_photos_insert on public.psi_nexus_equipment_photos
for insert to authenticated with check (
  uploaded_by = (select auth.uid())
  and status = 'submitted_to_hq'
  and exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_equipment_photos.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_equipment_photos.tenant_id and sm.site_id = psi_nexus_equipment_photos.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

create policy psi_nexus_equipment_photos_hq_update on public.psi_nexus_equipment_photos
for update to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_equipment_photos.tenant_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer')
  )
) with check (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_equipment_photos.tenant_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer')
  )
);

create policy psi_nexus_equipment_photos_field_resubmit on public.psi_nexus_equipment_photos
for update to authenticated using (
  status = 'revision_requested_hq'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.psi_tenant_site_memberships sm
    join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
    where sm.tenant_id = psi_nexus_equipment_photos.tenant_id and sm.site_id = psi_nexus_equipment_photos.site_id
      and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
  )
) with check (
  status = 'submitted_to_hq'
  and uploaded_by = (select auth.uid())
);

-- HQ Visits
create policy psi_nexus_hq_visits_read on public.psi_nexus_hq_visits
for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_hq_visits.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_hq_visits.tenant_id and sm.site_id = psi_nexus_hq_visits.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

create policy psi_nexus_hq_visits_hq_write on public.psi_nexus_hq_visits
for all to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_hq_visits.tenant_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer')
  )
) with check (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_hq_visits.tenant_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer')
  )
);

create policy psi_nexus_hq_visits_field_ack on public.psi_nexus_hq_visits
for update to authenticated using (
  exists (
    select 1 from public.psi_tenant_site_memberships sm
    join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
    where sm.tenant_id = psi_nexus_hq_visits.tenant_id and sm.site_id = psi_nexus_hq_visits.site_id
      and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
  )
) with check (
  field_acknowledged_by = (select auth.uid())
  and exists (
    select 1 from public.psi_tenant_site_memberships sm
    join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
    where sm.tenant_id = psi_nexus_hq_visits.tenant_id and sm.site_id = psi_nexus_hq_visits.site_id
      and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
  )
);

-- Training Handwritten Signatures (site-scoped insert/read + HQ read)
create policy psi_nexus_training_signatures_read on public.psi_nexus_training_signatures
for select to authenticated using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_training_signatures.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_training_signatures.tenant_id and sm.site_id = psi_nexus_training_signatures.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

create policy psi_nexus_training_signatures_insert on public.psi_nexus_training_signatures
for insert to authenticated with check (
  recorded_by = (select auth.uid()) and exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_nexus_training_signatures.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('owner', 'admin', 'reviewer') or exists (
        select 1 from public.psi_tenant_site_memberships sm
        join public.psi_tenant_sites s on s.tenant_id = sm.tenant_id and s.id = sm.site_id
        where sm.tenant_id = psi_nexus_training_signatures.tenant_id and sm.site_id = psi_nexus_training_signatures.site_id
          and sm.user_id = (select auth.uid()) and sm.status = 'active' and s.active = true
      ))
  )
);

commit;
