-- PHASE 17 PROPOSAL ONLY. Do NOT apply to Production.
-- Requires unmerged: psi_hq_evidence_private_staging.sql and its incident cases.
-- Dedicated durable transport ledger: NOT an immutable/WORM audit sink.
begin;

create table hq_evidence_staging.transport_outbox (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 site_id uuid not null,
 case_id uuid not null,
 evidence_id uuid not null,
 actor_id uuid not null references auth.users(id) on delete restrict,
 -- PREPARED must be committed before any sensitive response bytes are sent.
 state text not null default 'prepared' check (
   state in ('prepared','response_flushed','response_aborted','unconfirmed')
 ),
 created_at timestamptz not null default now(),
 settled_at timestamptz,
 -- A response finish is only a server-side transport signal.
 constraint hq_transport_state_time check (
   (state='prepared' and settled_at is null)
    or (state<>'prepared' and settled_at is not null)
 ),
 -- Two workers must not claim the same row simultaneously. Implement as
 -- a trusted transactional SELECT FOR UPDATE SKIP LOCKED + UPDATE.
 claim_token uuid,
 claim_expires_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 delivery_attempts integer not null default 0
   check(delivery_attempts between 0 and 1000),
 acked_at timestamptz,
 last_failure_code text check (
   last_failure_code is null or last_failure_code ~ '^[A-Z0-9_]{4,36}$'
 ),
 -- Persist only scoped IDs/status; NO raw file contents, URLs, names, IPs,
 -- authorization headers, occupational health records or narrative.
 foreign key(tenant_id,site_id,case_id,evidence_id)
  references hq_evidence_staging.evidence_manifest(tenant_id,site_id,case_id,id)
  on delete restrict
);
create index hq_transport_due_idx on hq_evidence_staging.transport_outbox
 (next_attempt_at,created_at) where acked_at is null;
create index hq_transport_scope_idx on hq_evidence_staging.transport_outbox
 (tenant_id,site_id,case_id,evidence_id,created_at);

alter table hq_evidence_staging.transport_outbox enable row level security;
alter table hq_evidence_staging.transport_outbox force row level security;
revoke all on hq_evidence_staging.transport_outbox
 from public,anon,authenticated,service_role;
-- Staging owner can simulate prepare/settle/claim/ack/retry in isolated PGlite.
-- Production must dedicate a least-privileged private operator with audited
-- grants; never expose this table/schema in a browser Data API.
-- Delivery sink MUST be idempotent on transport_outbox.id.
-- If no finish/close signal survived a crash, mark UNCONFIRMED, NEVER DELIVERED.
-- A stale PREPARED event needs reconciliation, not a fabricated receipt.
commit;
