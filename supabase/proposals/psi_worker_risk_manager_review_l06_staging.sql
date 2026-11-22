-- L06 5th slice (2026-11-22): isolated PostgreSQL / PGlite proposal ONLY.
-- NEVER apply to operational PSI-Database. Not in supabase/migrations.
-- Depends on psi_worker_risk_submission_l06_staging.sql and P05 site proposals.
-- Review-plan "approved" IS NOT a work permit, a verified control, a final
-- legal risk assessment, an instruction to resume work, or education completion.
begin;

create table public.psi_worker_risk_review_events (
 tenant_id uuid not null,
 site_id uuid not null,
 submission_id uuid not null,
 revision integer not null check (revision between 1 and 2),
 action_request_id uuid not null,
 action text not null check(action in ('reviewed','request_changes','approved')),
 note text not null check(length(btrim(note)) between 10 and 800),
 reviewer_user_id uuid not null references auth.users(id) on delete restrict,
 occurred_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,site_id,submission_id,revision),
 unique(tenant_id,site_id,action_request_id),
 foreign key(tenant_id,site_id,submission_id)
   references public.psi_worker_risk_submissions(tenant_id,site_id,id) on delete restrict
);
create index psi_l06_manager_review_by_scope
  on public.psi_worker_risk_review_events(tenant_id,site_id,submission_id,revision desc);

alter table public.psi_worker_risk_review_events enable row level security;
alter table public.psi_worker_risk_review_events force row level security;
revoke all on public.psi_worker_risk_review_events
 from public,anon,authenticated,service_role;

-- Defense in depth against accidental privileged UPDATE/DELETE.
-- PostgreSQL superusers can still deliberately alter database contents;
-- a true externally anchored audit trail remains an unmet deployment gate.
create function public.psi_l06_prevent_history_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'L06 original and review history are immutable' using errcode='42501';
end;
$$;
create trigger psi_l06_original_immutable before update or delete
 on public.psi_worker_risk_submissions for each row
 execute function public.psi_l06_prevent_history_mutation();
create trigger psi_l06_receipt_immutable before update or delete
 on public.psi_worker_risk_receipt_events for each row
 execute function public.psi_l06_prevent_history_mutation();
create trigger psi_l06_review_immutable before update or delete
 on public.psi_worker_risk_review_events for each row
 execute function public.psi_l06_prevent_history_mutation();
revoke all on function public.psi_l06_prevent_history_mutation()
 from public,anon,authenticated;

-- L06 staged session revocation gate. auth.uid() alone is insufficient
-- after JWT issue when the underlying session has been revoked.
-- Scope is read within SECURITY DEFINER RPC and the auth row is key-share
-- locked until the enclosing transaction finishes.
create function public.psi_l06_require_active_session() returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid;
 v_claim text;
 v_session uuid;
 v_exists boolean;
begin
 v_actor := auth.uid();
 v_claim := auth.jwt()->>'session_id';
 if v_actor is null or v_claim is null
    or v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'L06 active auth session required' using errcode='42501';
 end if;
 v_session := v_claim::uuid;
 select true into v_exists from auth.sessions sess
 where sess.id=v_session and sess.user_id=v_actor
 for key share of sess;
 if not found or v_exists is distinct from true then
   raise exception 'L06 active auth session required' using errcode='42501';
 end if;
 return v_actor;
end;
$$;
revoke all on function public.psi_l06_require_active_session() from public,anon,authenticated,service_role;

-- Only a verified active manager of THIS tenant and active site can
-- review or read. Authorization is performed in the privileged function.
-- function. No reviewer identity or work site is accepted from the answers.
create function public.psi_review_worker_risk_l06(
 p_tenant uuid,p_site uuid,p_submission uuid,p_action_request uuid,
 p_action text,p_note text,p_expected_revision integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid;
 v_role text;
 v_submission public.psi_worker_risk_submissions;
 v_last public.psi_worker_risk_review_events;
 v_existing public.psi_worker_risk_review_events;
 v_new public.psi_worker_risk_review_events;
 v_revision integer := 0;
begin
 v_actor := auth.uid();
 if v_actor is null or p_tenant is null or p_site is null
   or p_submission is null or p_action_request is null
   or p_expected_revision is null or p_expected_revision not between 0 and 1
   or p_action is null
   or p_action not in ('reviewed','request_changes','approved')
   or p_note is null or length(pg_catalog.btrim(p_note)) not between 10 and 800
 then
   raise exception 'L06 review input or session invalid' using errcode='42501';
 end if;

 -- Use locks to prevent a concurrently suspended tenant/site membership
 -- or closed site from being ignored in a review transaction.
 select m.role into v_role
 from public.psi_tenant_memberships m
 join public.psi_tenant_site_memberships sm
   on sm.tenant_id=m.tenant_id and sm.user_id=m.user_id
 join public.psi_tenant_sites site
   on site.tenant_id=sm.tenant_id and site.id=sm.site_id
 where m.tenant_id=p_tenant and m.user_id=v_actor and m.status='active'
   and m.role in ('owner','admin','reviewer')
   and sm.site_id=p_site and sm.status='active' and site.active=true
 for share of m,sm,site;
 if not found then
   raise exception 'L06 site reviewer not authorized' using errcode='42501';
 end if;

 if p_action='approved' and v_role not in ('owner','admin') then
   raise exception 'L06 independent manager required for approval' using errcode='42501';
 end if;

 -- Parent-row lock serializes expected revision and transition checks for
 -- this submission, even across simultaneous reviewer sessions.
 select * into v_submission from public.psi_worker_risk_submissions s
 where s.tenant_id=p_tenant and s.site_id=p_site and s.id=p_submission
 for update of s;
 if not found or v_submission.account_user_id=v_actor then
   raise exception 'L06 worker cannot review own submission' using errcode='42501';
 end if;

 -- Exact replay works after the first transition, but a changed action,
 -- note or submission under a reused idempotency key never does.
 select * into v_existing from public.psi_worker_risk_review_events r
 where r.tenant_id=p_tenant and r.site_id=p_site
   and r.action_request_id=p_action_request;
 if found then
   if v_existing.submission_id<>p_submission
      or v_existing.reviewer_user_id<>v_actor
      or v_existing.action<>p_action or v_existing.note<>p_note
      or v_existing.revision<>p_expected_revision+1
   then
      raise exception 'L06 review replay changed' using errcode='23505';
   end if;
   return pg_catalog.jsonb_build_object(
     'schema','psi-worker-risk-review-receipt-v1',
     'eventId',p_action_request,'submissionId',v_existing.submission_id,
     'tenantId',v_existing.tenant_id,'siteId',v_existing.site_id,
     'revision',v_existing.revision,'action',v_existing.action,
     'recordedAt',pg_catalog.to_char(v_existing.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     'scope','record-review-only-no-work-clearance'
   );
 end if;

 select * into v_last from public.psi_worker_risk_review_events r
 where r.tenant_id=p_tenant and r.site_id=p_site and r.submission_id=p_submission
 order by r.revision desc limit 1;
 if found then v_revision := v_last.revision; end if;
 if v_revision<>p_expected_revision then
   raise exception 'L06 stale review revision' using errcode='40001';
 end if;
 if v_revision=0 and p_action='approved' then
   raise exception 'L06 independent initial review required' using errcode='42501';
 end if;
 if v_revision>0 then
   if v_last.action<>'reviewed'
     or p_action not in ('request_changes','approved')
   then
      raise exception 'L06 review already finalized' using errcode='42501';
   end if;
   if p_action='approved' and v_last.reviewer_user_id=v_actor then
      raise exception 'L06 two distinct reviewers required' using errcode='42501';
   end if;
 end if;

 insert into public.psi_worker_risk_review_events(
  tenant_id,site_id,submission_id,revision,action_request_id,
  action,note,reviewer_user_id
 ) values (
  p_tenant,p_site,p_submission,v_revision+1,p_action_request,
  p_action,p_note,v_actor
 ) returning * into v_new;

 return pg_catalog.jsonb_build_object(
   'schema','psi-worker-risk-review-receipt-v1',
   'eventId',v_new.action_request_id,'submissionId',v_new.submission_id,
   'tenantId',v_new.tenant_id,'siteId',v_new.site_id,
   'revision',v_new.revision,'action',v_new.action,
   'recordedAt',pg_catalog.to_char(v_new.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'scope','record-review-only-no-work-clearance'
 );
end;
$$;
revoke all on function public.psi_review_worker_risk_l06(uuid,uuid,uuid,uuid,text,text,integer)
 from public,anon;
grant execute on function public.psi_review_worker_risk_l06(uuid,uuid,uuid,uuid,text,text,integer)
 to authenticated;

-- Manager-only read. Q1-Q5 originals have NO anonymous worker name/email,
-- and cannot be changed or marked as "risks removed" through this function.
create function public.psi_read_worker_risk_review_l06(
 p_tenant uuid,p_site uuid,p_submission uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid;
 v_scope boolean := false;
 v_data public.psi_worker_risk_submissions;
 v_events jsonb;
begin
 v_actor := auth.uid();
 if v_actor is null or p_tenant is null or p_site is null or p_submission is null then
   raise exception 'L06 verified reviewer required' using errcode='42501';
 end if;
 select true into v_scope from public.psi_tenant_memberships m
 join public.psi_tenant_site_memberships sm
   on sm.tenant_id=m.tenant_id and sm.user_id=m.user_id
 join public.psi_tenant_sites site
   on site.tenant_id=sm.tenant_id and site.id=sm.site_id
 where m.tenant_id=p_tenant and m.user_id=v_actor and m.status='active'
  and m.role in ('owner','admin','reviewer') and sm.site_id=p_site
  and sm.status='active' and site.active=true;
 if not found then
   raise exception 'L06 reviewer read denied' using errcode='42501';
 end if;
 select * into v_data from public.psi_worker_risk_submissions s
 where s.tenant_id=p_tenant and s.site_id=p_site and s.id=p_submission;
 if not found then
    raise exception 'L06 review source inaccessible' using errcode='42501';
 end if;
 select coalesce(pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('revision',r.revision,'action',r.action,
    'note',r.note,'reviewerId',r.reviewer_user_id,
    'recordedAt',pg_catalog.to_char(r.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   order by r.revision), '[]'::jsonb) into v_events
 from public.psi_worker_risk_review_events r
 where r.tenant_id=p_tenant and r.site_id=p_site and r.submission_id=p_submission;
 return pg_catalog.jsonb_build_object(
   'schema','psi-worker-risk-manager-review-v1',
   'tenantId',v_data.tenant_id,'siteId',v_data.site_id,
   'submissionId',v_data.id,'workerId',v_data.worker_id,
   'formVersion',v_data.form_version,'sourceLanguage',v_data.source_language,
   'answers',v_data.answers,'selfRiskGrade',v_data.self_risk_grade,
   'gradeReason',v_data.grade_reason,
   'receivedAt',pg_catalog.to_char(v_data.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'events',v_events,'workClearanceGranted',false
 );
end;
$$;
revoke all on function public.psi_read_worker_risk_review_l06(uuid,uuid,uuid)
 from public,anon;
grant execute on function public.psi_read_worker_risk_review_l06(uuid,uuid,uuid)
 to authenticated;

comment on table public.psi_worker_risk_review_events is
 'STAGING only: immutable manager review events; does NOT authorize work, prove risks removed, or clear site operations.';
commit;
