-- HQ-SAFE 12th-phase DESIGN PROPOSAL ONLY. NEVER RUN AGAINST PRODUCTION.
-- Prerequisites (also unmerged): psi_tenant_sites, psi_tenant_site_memberships,
-- psi_hq_incident_cases, tenant_identity_foundation. No migration or live state changes.
-- Separate private schema: NOT exposed through Supabase Data API by default.
-- No approval, adjudication, return-to-work, original evidence, medical data or AI findings.
begin;

create schema hq_safe_staging;
revoke all on schema hq_safe_staging from public, anon, authenticated, service_role;
grant usage on schema hq_safe_staging to authenticated;

create table hq_safe_staging.review_assignments (
  tenant_id uuid not null,
  site_id uuid not null,
  case_id uuid not null,
  id uuid not null default gen_random_uuid(),
  -- A report number is a reference LABEL, not a trusted verified report.
  -- Browser accounts are never granted assignment INSERT.
  report_version integer not null check(report_version between 1 and 100000),
  report_ref text not null check(length(btrim(report_ref)) between 8 and 120),
  author_id uuid not null references auth.users(id) on delete restrict,
  site_reviewer_id uuid not null references auth.users(id) on delete restrict,
  hq_reviewer_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(tenant_id,site_id,case_id,id),
  foreign key(tenant_id,site_id,case_id)
    references public.psi_hq_incident_cases(tenant_id,site_id,id) on delete restrict,
  constraint hq_review_three_distinct_people check(
    author_id<>site_reviewer_id and author_id<>hq_reviewer_id
    and site_reviewer_id<>hq_reviewer_id
  )
);

create table hq_safe_staging.review_feedback (
  tenant_id uuid not null,
  site_id uuid not null,
  case_id uuid not null,
  assignment_id uuid not null,
  id uuid not null default gen_random_uuid(),
  reviewer_role text not null check(reviewer_role in ('site','hq')),
  topic text not null check(topic in ('chronology','evidence','causation','controls','sixw')),
  note_kind text not null check(note_kind in ('question','revision_suggested')),
  note text not null check(length(btrim(note)) between 8 and 500),
  evidence_ref text check(evidence_ref is null or length(btrim(evidence_ref)) between 4 and 180),
  reviewed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  primary key(tenant_id,site_id,case_id,assignment_id,id),
  foreign key(tenant_id,site_id,case_id,assignment_id)
    references hq_safe_staging.review_assignments(tenant_id,site_id,case_id,id) on delete restrict
);

alter table hq_safe_staging.review_assignments enable row level security;
alter table hq_safe_staging.review_assignments force row level security;
alter table hq_safe_staging.review_feedback enable row level security;
alter table hq_safe_staging.review_feedback force row level security;
revoke all on hq_safe_staging.review_assignments,hq_safe_staging.review_feedback
 from public,anon,authenticated,service_role;
-- Narrow column INSERT grants prevent client spoofing of assigned_by, reviewed_by,
-- created_at and recorded_at, which MUST come from the database defaults.
grant select on hq_safe_staging.review_assignments,hq_safe_staging.review_feedback
  to authenticated;
-- No INSERT privilege on assignments for authenticated browsers.
-- A separate trusted operator must create them after validating real identities.
grant insert (tenant_id,site_id,case_id,assignment_id,
  reviewer_role,topic,note_kind,note,evidence_ref)
  on hq_safe_staging.review_feedback to authenticated;

-- Read is participant-only, on the same tenant and active site.
create policy hq_assignments_read on hq_safe_staging.review_assignments
for select to authenticated using (
  (select auth.uid()) in (assigned_by,author_id,site_reviewer_id,hq_reviewer_id)
  and exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=review_assignments.tenant_id
      and tm.user_id=(select auth.uid()) and tm.status='active')
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=review_assignments.tenant_id and sm.site_id=review_assignments.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
  and exists(select 1 from public.psi_tenant_sites s
    where s.tenant_id=review_assignments.tenant_id and s.id=review_assignments.site_id
      and s.active=true)
);

-- SECURITY INVOKER trigger: used ONLY during trusted operator provisioning.
-- It rejects a forged author, same-person reviewers or an inactive/unassigned site.
-- Current self-read membership RLS intentionally does not allow a browser administrator
-- to enumerate other users' memberships. Do not widen it just to assign reviewers.
create function hq_safe_staging.check_review_assignment()
returns trigger language plpgsql security invoker as $$
begin
 if not exists(select 1 from public.psi_hq_incident_cases c
     where c.tenant_id=new.tenant_id and c.site_id=new.site_id
       and c.id=new.case_id and c.created_by=new.author_id) then
   raise exception 'case author does not match incident' using errcode='23514';
 end if;
 if not exists(select 1 from public.psi_tenant_sites s
     where s.tenant_id=new.tenant_id and s.id=new.site_id and s.active=true) then
   raise exception 'inactive or missing site' using errcode='23514';
 end if;
 if not exists(select 1 from public.psi_tenant_memberships tm
     join public.psi_tenant_site_memberships sm
       on sm.tenant_id=tm.tenant_id and sm.user_id=tm.user_id
     where tm.tenant_id=new.tenant_id and sm.site_id=new.site_id
       and tm.user_id=new.site_reviewer_id
       and tm.status='active' and sm.status='active' and tm.role='reviewer') then
   raise exception 'site reviewer is not actively assigned' using errcode='23514';
 end if;
 if not exists(select 1 from public.psi_tenant_memberships tm
     join public.psi_tenant_site_memberships sm
       on sm.tenant_id=tm.tenant_id and sm.user_id=tm.user_id
     where tm.tenant_id=new.tenant_id and sm.site_id=new.site_id
       and tm.user_id=new.hq_reviewer_id
       and tm.status='active' and sm.status='active' and tm.role in ('owner','admin')) then
   raise exception 'HQ reviewer is not actively assigned' using errcode='23514';
 end if;
 if not exists(select 1 from public.psi_tenant_memberships tm
     join public.psi_tenant_site_memberships sm
       on sm.tenant_id=tm.tenant_id and sm.user_id=tm.user_id
     where tm.tenant_id=new.tenant_id and sm.site_id=new.site_id
       and tm.user_id=new.assigned_by
       and tm.status='active' and sm.status='active' and tm.role in ('owner','admin')) then
   raise exception 'assignment operator is not an active HQ supervisor' using errcode='23514';
 end if;
 return new;
end $$;
revoke execute on function hq_safe_staging.check_review_assignment()
 from public,anon,authenticated,service_role;
create trigger hq_review_assignment_operator_check
 before insert on hq_safe_staging.review_assignments
 for each row execute function hq_safe_staging.check_review_assignment();

-- A feedback row can be viewed only by an authorized assignment participant.
create policy hq_feedback_read on hq_safe_staging.review_feedback
for select to authenticated using (
  exists(select 1 from hq_safe_staging.review_assignments a
    where a.tenant_id=review_feedback.tenant_id and a.site_id=review_feedback.site_id
      and a.case_id=review_feedback.case_id and a.id=review_feedback.assignment_id
      and (select auth.uid()) in (a.assigned_by,a.author_id,a.site_reviewer_id,a.hq_reviewer_id))
);

-- The authenticated caller, never client-supplied reviewer ID, must equal
-- the assigned site or HQ reviewer. The incident author is excluded.
create policy hq_feedback_insert on hq_safe_staging.review_feedback
for insert to authenticated with check (
  reviewed_by=(select auth.uid())
  and exists(select 1 from public.psi_tenant_memberships tm
    where tm.tenant_id=review_feedback.tenant_id and tm.user_id=(select auth.uid())
      and tm.status='active'
      and ((review_feedback.reviewer_role='site' and tm.role='reviewer')
        or (review_feedback.reviewer_role='hq' and tm.role in ('owner','admin'))))
  and exists(select 1 from public.psi_tenant_site_memberships sm
    where sm.tenant_id=review_feedback.tenant_id and sm.site_id=review_feedback.site_id
      and sm.user_id=(select auth.uid()) and sm.status='active')
  and exists(select 1 from public.psi_tenant_sites s
    where s.tenant_id=review_feedback.tenant_id and s.id=review_feedback.site_id
      and s.active=true)
  and exists(select 1 from hq_safe_staging.review_assignments a
    where a.tenant_id=review_feedback.tenant_id and a.site_id=review_feedback.site_id
      and a.case_id=review_feedback.case_id and a.id=review_feedback.assignment_id
      and a.author_id<>(select auth.uid())
      and ((review_feedback.reviewer_role='site' and a.site_reviewer_id=(select auth.uid()))
        or (review_feedback.reviewer_role='hq' and a.hq_reviewer_id=(select auth.uid()))))
);

-- Deliberately no UPDATE/DELETE policy or privileges; no approval event type.
-- No SECURITY DEFINER, service-role override, automatic migration or frontend writes.
commit;
