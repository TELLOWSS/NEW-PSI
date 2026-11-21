-- Slice 1: Multi-site (site_id) + HQ approval boundary for 3-Axis Structural & Substructure RC Incident DB
-- and HQ Pre-Visit Field Inspection Plans (01 행선지·현장점검 + 02 사고사례 DB + 05 AI 사고조사 승인).
-- Additive foundation: does not modify legacy records or staging aggregate proposals.
begin;

create table public.psi_structural_incident_cases (
  tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  site_id uuid,
  case_code text not null check (length(btrim(case_code)) between 3 and 40),
  title text not null check (length(btrim(title)) between 4 and 200),
  zone_axis text not null check (zone_axis in (
    'foundation', 'substructure_rc', 'superstructure_std', 'rooftop_special'
  )),
  process_axis text not null check (process_axis in (
    'formwork_general', 'gangform', 'alform', 'rebar', 'concrete_pour', 'stripping_curing'
  )),
  hazard_equipment_axis text not null check (hazard_equipment_axis in (
    'system_shoring', 'system_scaffold', 'tower_crane_rigging',
    'aerial_platform', 'opening_edge', 'confined_earth_pressure'
  )),
  hazard_mechanism text not null check (hazard_mechanism in (
    '붕괴·도괴', '추락', '낙하·비래', '협착·끼임', '질식·중독', '전도'
  )),
  direct_cause text not null check (length(btrim(direct_cause)) between 4 and 600),
  contributing_factor text not null check (length(btrim(contributing_factor)) between 4 and 600),
  root_cause text not null check (length(btrim(root_cause)) between 4 and 600),
  preventive_measure text not null check (length(btrim(preventive_measure)) between 4 and 800),
  approval_status text not null default 'draft' check (approval_status in (
    'draft', 'pending_hq_approval', 'hq_approved', 'archived'
  )),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, site_id) references public.psi_tenant_sites(tenant_id, id) on delete restrict,
  constraint psi_structural_incident_hq_approval_consistency check (
    (approval_status = 'hq_approved' and approved_by is not null and approved_at is not null and approved_by <> created_by)
    or (approval_status <> 'hq_approved' and approved_by is null and approved_at is null)
  )
);

create index psi_structural_incident_3axis_idx
  on public.psi_structural_incident_cases(tenant_id, zone_axis, process_axis, hazard_equipment_axis, approval_status);

alter table public.psi_structural_incident_cases enable row level security;
alter table public.psi_structural_incident_cases force row level security;
revoke all on public.psi_structural_incident_cases from public, anon, authenticated, service_role;
grant select, insert, update on public.psi_structural_incident_cases to authenticated;

-- Read boundary:
-- 1) Active tenant HQ roles ('owner', 'admin', 'reviewer') can inspect all structural cases across sites in their tenant.
-- 2) Site members ('viewer' or site-scoped staff) can read:
--    a) HQ-approved tenant-wide standard cases (site_id is null and approval_status = 'hq_approved'), OR
--    b) Cases scoped to an active site where the user has an active psi_tenant_site_memberships row.
create policy psi_structural_incident_cases_read
on public.psi_structural_incident_cases
for select to authenticated
using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_structural_incident_cases.tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role in ('owner', 'admin', 'reviewer')
        or (
          psi_structural_incident_cases.site_id is null
          and psi_structural_incident_cases.approval_status = 'hq_approved'
        )
        or (
          psi_structural_incident_cases.site_id is not null
          and exists (
            select 1 from public.psi_tenant_site_memberships sm
            join public.psi_tenant_sites s
              on s.tenant_id = sm.tenant_id and s.id = sm.site_id
            where sm.tenant_id = psi_structural_incident_cases.tenant_id
              and sm.site_id = psi_structural_incident_cases.site_id
              and sm.user_id = (select auth.uid())
              and sm.status = 'active'
              and s.active = true
          )
        )
      )
  )
);

-- Insert boundary: author must be the authenticated user and must belong to the active site (or be HQ owner/admin for tenant-wide standard seed).
create policy psi_structural_incident_cases_insert
on public.psi_structural_incident_cases
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and approval_status in ('draft', 'pending_hq_approval')
  and exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_structural_incident_cases.tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        (psi_structural_incident_cases.site_id is null and m.role in ('owner', 'admin'))
        or (
          psi_structural_incident_cases.site_id is not null
          and exists (
            select 1 from public.psi_tenant_site_memberships sm
            join public.psi_tenant_sites s
              on s.tenant_id = sm.tenant_id and s.id = sm.site_id
            where sm.tenant_id = psi_structural_incident_cases.tenant_id
              and sm.site_id = psi_structural_incident_cases.site_id
              and sm.user_id = (select auth.uid())
              and sm.status = 'active'
              and s.active = true
          )
        )
      )
  )
);

-- HQ Approval boundary: only an active tenant 'owner' or 'admin' who is NOT the original creator can approve ('hq_approved').
create policy psi_structural_incident_cases_hq_approve
on public.psi_structural_incident_cases
for update to authenticated
using (
  exists (
    select 1 from public.psi_tenant_memberships m
    where m.tenant_id = psi_structural_incident_cases.tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
)
with check (
  created_by <> (select auth.uid())
  and (
    (approval_status = 'hq_approved' and approved_by = (select auth.uid()) and approved_at is not null)
    or approval_status in ('pending_hq_approval', 'archived')
  )
);

commit;
