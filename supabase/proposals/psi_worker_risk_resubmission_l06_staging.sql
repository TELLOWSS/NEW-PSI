-- L06 7th slice: append-only replacement link, isolated PGlite proposal ONLY.
-- NEVER migrate/execute against production PSI-Database without independent approval.
-- Depends on P05, submission_l06_staging.sql, manager_review_l06_staging.sql.
-- No API, no browser session, no production RLS/GRANT changes.
begin;

-- Both the old and the replacement must belong to exactly the same
-- tenant, site, worker and assessment cycle; guard at database level too.
alter table public.psi_worker_risk_submissions
 add constraint psi_l06_submissions_revision_scope_unique
 unique (tenant_id,site_id,id,worker_id,cycle_id);

create table public.psi_worker_risk_resubmission_links (
 tenant_id uuid not null,
 site_id uuid not null,
 original_submission_id uuid not null,
 replacement_submission_id uuid not null,
 worker_id uuid not null,
 cycle_id uuid not null,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 linked_at timestamptz not null default clock_timestamp(),
 primary key (tenant_id,site_id,original_submission_id),
 unique (tenant_id,site_id,replacement_submission_id),
 check (original_submission_id <> replacement_submission_id),
 foreign key (tenant_id,site_id,original_submission_id,worker_id,cycle_id)
   references public.psi_worker_risk_submissions(tenant_id,site_id,id,worker_id,cycle_id) on delete restrict,
 foreign key (tenant_id,site_id,replacement_submission_id,worker_id,cycle_id)
   references public.psi_worker_risk_submissions(tenant_id,site_id,id,worker_id,cycle_id) on delete restrict
);
create index psi_l06_revisions_child_idx
 on public.psi_worker_risk_resubmission_links(tenant_id,site_id,replacement_submission_id);

alter table public.psi_worker_risk_resubmission_links enable row level security;
alter table public.psi_worker_risk_resubmission_links force row level security;
revoke all on public.psi_worker_risk_resubmission_links
 from public,anon,authenticated,service_role;
create trigger psi_l06_revision_link_immutable before update or delete
 on public.psi_worker_risk_resubmission_links for each row
 execute function public.psi_l06_prevent_history_mutation();

-- Workers may replace their *own* returned questionnaire only after the
-- manager's terminal request_changes. Both receipts are immutable; the new
-- Q1-Q5 record is accepted exclusively by the existing verified submit RPC.
create function public.psi_submit_worker_risk_revision_l06(
 p_tenant uuid,p_site uuid,p_cycle uuid,p_original uuid,p_request uuid,
 p_form_version text,p_source_language text,p_answers jsonb,
 p_grade text,p_grade_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid;
 v_original public.psi_worker_risk_submissions;
 v_child public.psi_worker_risk_submissions;
 v_link public.psi_worker_risk_resubmission_links;
 v_review_action text;
 v_receipt jsonb;
 v_child_id uuid;
begin
 v_actor := auth.uid();
 if v_actor is null or p_tenant is null or p_site is null or p_cycle is null
   or p_original is null or p_request is null then
   raise exception 'L06 verified revision context required' using errcode='42501';
 end if;

 -- Exclusive parent lock serializes competing new revision attempts.
 select * into v_original from public.psi_worker_risk_submissions s
 where s.tenant_id=p_tenant and s.site_id=p_site and s.id=p_original
 for update of s;
 if not found or v_original.account_user_id<>v_actor or v_original.cycle_id<>p_cycle then
    raise exception 'L06 original is not owned in the same site/cycle' using errcode='42501';
 end if;

 select r.action into v_review_action from public.psi_worker_risk_review_events r
 where r.tenant_id=p_tenant and r.site_id=p_site and r.submission_id=p_original
 order by r.revision desc limit 1;
 if not found or v_review_action<>'request_changes' then
    raise exception 'L06 manager change request is required' using errcode='42501';
 end if;

 select * into v_link from public.psi_worker_risk_resubmission_links l
 where l.tenant_id=p_tenant and l.site_id=p_site and l.original_submission_id=p_original;
 if found then
   -- Same client retry is allowed; a second revision of a finalized parent is not.
   select * into v_child from public.psi_worker_risk_submissions s
   where s.tenant_id=p_tenant and s.site_id=p_site and s.id=v_link.replacement_submission_id;
   if not found or v_child.request_id<>p_request then
     raise exception 'L06 original already has a replacement' using errcode='23505';
   end if;
 end if;

 -- Entire original+replacement+link transaction rolls back if any check fails.
 v_receipt := public.psi_submit_worker_risk_l06(
   p_tenant,p_site,p_cycle,p_request,p_form_version,p_source_language,
   p_answers,p_grade,p_grade_reason
 );
 v_child_id := (v_receipt->>'receiptId')::uuid;
 select * into v_child from public.psi_worker_risk_submissions s
 where s.tenant_id=p_tenant and s.site_id=p_site and s.id=v_child_id;
 if not found or v_child.id=p_original or v_child.worker_id<>v_original.worker_id
   or v_child.account_user_id<>v_actor or v_child.cycle_id<>v_original.cycle_id then
   raise exception 'L06 replacement scope mismatch' using errcode='42501';
 end if;

 if v_link.original_submission_id is not null then
   if v_link.replacement_submission_id<>v_child_id then
      raise exception 'L06 immutable revision link conflict' using errcode='23505';
   end if;
 else
   -- Referential constraints also prevent cross-tenant, -site, -worker and -cycle links.
   insert into public.psi_worker_risk_resubmission_links(
      tenant_id,site_id,original_submission_id,replacement_submission_id,
      worker_id,cycle_id,actor_user_id
   ) values(
      p_tenant,p_site,p_original,v_child_id,
      v_original.worker_id,p_cycle,v_actor
   );
 end if;

 return pg_catalog.jsonb_build_object(
   'schema','psi-worker-risk-resubmission-receipt-v1',
   'originalSubmissionId',p_original,'replacementSubmissionId',v_child_id,
   'requestId',p_request,'tenantId',p_tenant,'siteId',p_site,
   'workerId',v_original.worker_id,
   'receivedAt',v_receipt->>'receivedAt',
   'relation','immutable-replacement-link',
   'workClearanceGranted',false
 );
end;
$$;
revoke all on function public.psi_submit_worker_risk_revision_l06(
 uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,text
) from public,anon;
grant execute on function public.psi_submit_worker_risk_revision_l06(
 uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,text
) to authenticated;

-- Manager-only *read*, using the already-vetted site authorization of
-- psi_read_worker_risk_review_l06 for BOTH records.
create function public.psi_read_worker_risk_revision_chain_l06(
 p_tenant uuid,p_site uuid,p_original uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_original jsonb;
 v_replacement jsonb;
 v_link public.psi_worker_risk_resubmission_links;
begin
 v_original := public.psi_read_worker_risk_review_l06(p_tenant,p_site,p_original);
 select * into v_link from public.psi_worker_risk_resubmission_links l
 where l.tenant_id=p_tenant and l.site_id=p_site
   and l.original_submission_id=p_original;
 if not found then
   raise exception 'L06 replacement record is unavailable' using errcode='42501';
 end if;
 v_replacement := public.psi_read_worker_risk_review_l06(
   p_tenant,p_site,v_link.replacement_submission_id
 );
 return pg_catalog.jsonb_build_object(
   'schema','psi-worker-risk-revision-chain-v1',
   'original',v_original,'replacement',v_replacement,
   'linkedAt',pg_catalog.to_char(v_link.linked_at at time zone 'UTC',
     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'workClearanceGranted',false
 );
end;
$$;
revoke all on function public.psi_read_worker_risk_revision_chain_l06(
 uuid,uuid,uuid
) from public,anon;
grant execute on function public.psi_read_worker_risk_revision_chain_l06(
 uuid,uuid,uuid
) to authenticated;

comment on table public.psi_worker_risk_resubmission_links is
 'ISOLATED STAGING ONLY: append-only Q1-Q5 replacement links. Neither manager review nor work clearance is implied.';
commit;
