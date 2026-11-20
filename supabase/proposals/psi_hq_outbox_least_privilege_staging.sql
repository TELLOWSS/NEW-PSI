-- HQ-SAFE PHASE 20: PRIVATE, REVIEW-ONLY STAGING PROPOSAL.
-- Execute ONLY in an ephemeral/explicitly approved TEST database.
-- Requires psi_hq_transport_outbox_staging.sql and its private schema.
-- This creates a cluster-local NOLOGIN ROLE, not a Supabase Auth user,
-- deployment secret, exposed API or production credential.
begin;

do $$
begin
 if not exists(select 1 from pg_roles where rolname='hq_safe_outbox_operator') then
  create role hq_safe_outbox_operator
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 end if;
end $$;

grant usage on schema hq_evidence_staging to hq_safe_outbox_operator;
-- A verified private server worker reads all cases it must reconcile,
-- but it does not get general tenant, personnel, evidence payload or Storage grants.
grant select on hq_evidence_staging.transport_outbox to hq_safe_outbox_operator;
grant insert (tenant_id,site_id,case_id,evidence_id,actor_id)
 on hq_evidence_staging.transport_outbox to hq_safe_outbox_operator;
grant update (
 state,settled_at,claim_token,claim_expires_at,
 next_attempt_at,delivery_attempts,acked_at,last_failure_code
) on hq_evidence_staging.transport_outbox to hq_safe_outbox_operator;
revoke delete on hq_evidence_staging.transport_outbox from hq_safe_outbox_operator;
-- Deliberately no privileges on evidence_manifest, access_events,
-- security_attempts, auth.users, files/Storage or other schemas.

create policy hq_outbox_operator_select on hq_evidence_staging.transport_outbox
 for select to hq_safe_outbox_operator using (true);
create policy hq_outbox_operator_insert on hq_evidence_staging.transport_outbox
 for insert to hq_safe_outbox_operator with check (true);
create policy hq_outbox_operator_update on hq_evidence_staging.transport_outbox
 for update to hq_safe_outbox_operator using (true) with check (true);

-- No LOGIN credential, privileged service key, role membership or web endpoint
-- is provisioned. An independently reviewed deployment-only private identity
-- would need to be bound by an administrator, with secret rotation and auditing.
commit;
