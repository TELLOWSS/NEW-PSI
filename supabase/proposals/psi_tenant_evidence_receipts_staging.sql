-- STAGING / CODE REVIEW ONLY. Not a live migration.
-- Requires: psi_tenants, psi_tenant_memberships, psi_tenant_workers.
-- Do not run against production before role, retention and legal review.
begin;

create table public.psi_tenant_evidence_receipts (
    tenant_id uuid not null,
    id uuid not null default gen_random_uuid(),
    request_id uuid not null,
    worker_id uuid not null,
    source_kind text not null check (source_kind in ('worker_form','field_evidence')),
    media_type text not null check (media_type in ('image/jpeg','image/png','image/webp','application/pdf')),
    original_bytes bytea not null check (octet_length(original_bytes) between 1 and 2097152),
    byte_size integer generated always as (octet_length(original_bytes)) stored,
    client_recorded_at timestamptz,
    received_at timestamptz not null default clock_timestamp(),
    received_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    primary key (tenant_id,id),
    unique (tenant_id,request_id),
    foreign key (tenant_id,worker_id) references public.psi_tenant_workers (tenant_id,id) on delete restrict,
    foreign key (tenant_id) references public.psi_tenants (id) on delete restrict
);
create index psi_tenant_evidence_receipts_worker_idx
    on public.psi_tenant_evidence_receipts (tenant_id,worker_id,received_at desc,id desc);

alter table public.psi_tenant_evidence_receipts enable row level security;
alter table public.psi_tenant_evidence_receipts force row level security;
revoke all on public.psi_tenant_evidence_receipts from public, anon, authenticated, service_role;
grant select on public.psi_tenant_evidence_receipts to authenticated;
grant insert (tenant_id,request_id,worker_id,source_kind,media_type,original_bytes,client_recorded_at)
    on public.psi_tenant_evidence_receipts to authenticated;

create policy psi_evidence_receipts_read on public.psi_tenant_evidence_receipts
    for select to authenticated using (
      exists (
        select 1 from public.psi_tenant_memberships as m
        where m.tenant_id=psi_tenant_evidence_receipts.tenant_id
          and m.user_id=(select auth.uid())
          and m.status='active' and m.role in ('owner','admin','reviewer')
      )
    );

create policy psi_evidence_receipts_write on public.psi_tenant_evidence_receipts
    for insert to authenticated with check (
      received_by=(select auth.uid())
      and exists (
        select 1 from public.psi_tenant_memberships as m
        where m.tenant_id=psi_tenant_evidence_receipts.tenant_id
          and m.user_id=(select auth.uid())
          and m.status='active' and m.role in ('owner','admin','reviewer')
      )
    );

create function public.psi_evidence_receipt_insert_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
    -- Database received time cannot be supplied by the browser.
    new.received_at := pg_catalog.clock_timestamp();
    new.received_by := auth.uid();
    if new.received_by is null then
        raise exception 'A verified user is required' using errcode = '42501';
    end if;
    if new.client_recorded_at is not null
       and new.client_recorded_at > pg_catalog.clock_timestamp() + interval '5 minutes' then
        raise exception 'Claimed capture time cannot be in the future' using errcode = '23514';
    end if;
    return new;
end $$;

create function public.psi_evidence_receipt_block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
    raise exception 'Evidence receipts are append-only. New bytes require a new receipt.'
      using errcode = '42501';
end $$;

create trigger psi_evidence_receipt_insert_guard
    before insert on public.psi_tenant_evidence_receipts
    for each row execute function public.psi_evidence_receipt_insert_guard();

create trigger psi_evidence_receipt_block_mutation
    before update or delete on public.psi_tenant_evidence_receipts
    for each row execute function public.psi_evidence_receipt_block_mutation();

revoke all on function public.psi_evidence_receipt_insert_guard(),
    public.psi_evidence_receipt_block_mutation() from public, anon, authenticated;
-- Trigger functions run via trigger; no user EXECUTE is needed.

commit;
