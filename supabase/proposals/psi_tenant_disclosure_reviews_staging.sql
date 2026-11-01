-- REVIEW PROPOSAL ONLY (not a deployed migration).
-- Authenticated review-plan approval is NOT permission to send files.
-- Two distinct append-only relations prevent after-the-fact alteration of
-- the original proposed package and its independent review decision.
begin;

create table public.psi_tenant_disclosure_requests (
    tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
    id uuid not null default gen_random_uuid(),
    client_request_id uuid not null,
    external_record_ref text not null check (
        length(external_record_ref) between 1 and 100
        and external_record_ref ~ '^[A-Za-z0-9_-]+$'
    ),
    package_sha256 text not null check (package_sha256 ~ '^[a-f0-9]{64}$'),
    selection_sha256 text not null check (selection_sha256 ~ '^[a-f0-9]{64}$'),
    purpose text not null check (length(btrim(purpose)) between 10 and 500),
    recipient_organization text not null check (length(btrim(recipient_organization)) between 2 and 180),
    request_reference text not null check (length(btrim(request_reference)) between 2 and 200),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id,id),
    unique (tenant_id,client_request_id)
);
create index psi_tenant_disclosure_requests_by_date
    on public.psi_tenant_disclosure_requests(tenant_id,created_at desc,id desc);

create table public.psi_tenant_disclosure_decisions (
    tenant_id uuid not null,
    request_id uuid not null,
    decision text not null check (decision in ('review_plan_approved','review_plan_rejected')),
    decision_note text not null check (length(btrim(decision_note)) between 10 and 1000),
    decided_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    decided_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id,request_id),
    foreign key (tenant_id,request_id)
        references public.psi_tenant_disclosure_requests(tenant_id,id) on delete restrict
);

alter table public.psi_tenant_disclosure_requests enable row level security;
alter table public.psi_tenant_disclosure_requests force row level security;
alter table public.psi_tenant_disclosure_decisions enable row level security;
alter table public.psi_tenant_disclosure_decisions force row level security;
revoke all on public.psi_tenant_disclosure_requests,
    public.psi_tenant_disclosure_decisions from public,anon,authenticated,service_role;

grant select on public.psi_tenant_disclosure_requests,
    public.psi_tenant_disclosure_decisions to authenticated;
grant insert (tenant_id,client_request_id,external_record_ref,package_sha256,
    selection_sha256,purpose,recipient_organization,request_reference)
    on public.psi_tenant_disclosure_requests to authenticated;
grant insert (tenant_id,request_id,decision,decision_note)
    on public.psi_tenant_disclosure_decisions to authenticated;

create policy psi_disclosure_requests_read on public.psi_tenant_disclosure_requests
    for select to authenticated using (exists (
        select 1 from public.psi_tenant_memberships m
        where m.tenant_id=psi_tenant_disclosure_requests.tenant_id
          and m.user_id=(select auth.uid()) and m.status='active'
          and m.role in ('owner','admin','reviewer')
    ));
create policy psi_disclosure_requests_create on public.psi_tenant_disclosure_requests
    for insert to authenticated with check (
        created_by=(select auth.uid())
        and exists (select 1 from public.psi_tenant_memberships m
            where m.tenant_id=psi_tenant_disclosure_requests.tenant_id
              and m.user_id=(select auth.uid()) and m.status='active'
              and m.role in ('owner','admin','reviewer'))
    );
create policy psi_disclosure_decisions_read on public.psi_tenant_disclosure_decisions
    for select to authenticated using (exists (
        select 1 from public.psi_tenant_memberships m
        where m.tenant_id=psi_tenant_disclosure_decisions.tenant_id
          and m.user_id=(select auth.uid()) and m.status='active'
          and m.role in ('owner','admin','reviewer')
    ));
create policy psi_disclosure_decisions_create on public.psi_tenant_disclosure_decisions
    for insert to authenticated with check (
        decided_by=(select auth.uid())
        and exists (select 1 from public.psi_tenant_memberships m
            where m.tenant_id=psi_tenant_disclosure_decisions.tenant_id
              and m.user_id=(select auth.uid()) and m.status='active'
              and m.role in ('owner','admin'))
    );

create function public.psi_disclosure_request_insert_guard() returns trigger
language plpgsql set search_path='' as $$
begin
    if auth.uid() is null then
        raise exception 'Verified account required' using errcode='42501';
    end if;
    new.created_by:=auth.uid();
    new.created_at:=pg_catalog.clock_timestamp();
    return new;
end $$;

create function public.psi_disclosure_decision_insert_guard() returns trigger
language plpgsql set search_path='' as $$
declare
    author uuid;
    reviewer_role text;
begin
    if auth.uid() is null then
        raise exception 'Verified account required' using errcode='42501';
    end if;
    select request.created_by into author
    from public.psi_tenant_disclosure_requests request
    where request.tenant_id=new.tenant_id and request.id=new.request_id;
    if author is null then
        raise exception 'Unknown request or company' using errcode='42501';
    end if;
    if author=auth.uid() then
        raise exception 'Request author cannot approve/reject their own proposal'
            using errcode='42501';
    end if;
    select m.role into reviewer_role from public.psi_tenant_memberships m
    where m.tenant_id=new.tenant_id and m.user_id=auth.uid() and m.status='active';
    if reviewer_role not in ('owner','admin') or reviewer_role is null then
        raise exception 'Independent tenant approver required' using errcode='42501';
    end if;
    new.decided_by:=auth.uid();
    new.decided_at:=pg_catalog.clock_timestamp();
    return new;
end $$;

create function public.psi_disclosure_block_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
    raise exception 'Review proposals and decisions are append-only'
        using errcode='42501';
end $$;

create trigger psi_disclosure_request_insert_guard before insert
    on public.psi_tenant_disclosure_requests for each row
    execute function public.psi_disclosure_request_insert_guard();
create trigger psi_disclosure_decision_insert_guard before insert
    on public.psi_tenant_disclosure_decisions for each row
    execute function public.psi_disclosure_decision_insert_guard();
create trigger psi_disclosure_request_block_mutation before update or delete
    on public.psi_tenant_disclosure_requests for each row
    execute function public.psi_disclosure_block_mutation();
create trigger psi_disclosure_decision_block_mutation before update or delete
    on public.psi_tenant_disclosure_decisions for each row
    execute function public.psi_disclosure_block_mutation();

revoke all on function public.psi_disclosure_request_insert_guard(),
    public.psi_disclosure_decision_insert_guard(),
    public.psi_disclosure_block_mutation() from public,anon,authenticated;

comment on table public.psi_tenant_disclosure_requests is
    'STAGED: immutable evidence REVIEW proposal only; not release authorization or delivery.';
comment on table public.psi_tenant_disclosure_decisions is
    'STAGED: independent approval/rejection of review plan only; no automatic data transfer.';
commit;
