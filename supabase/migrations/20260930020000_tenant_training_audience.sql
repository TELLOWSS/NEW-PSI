-- Additive tenant workspace. Never backfill or expose legacy PSI data.
-- Apply only after tenant_identity_foundation in an isolated project first.
begin;

create table public.psi_tenant_workers (
    tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
    id uuid not null default gen_random_uuid(),
    request_id uuid not null default gen_random_uuid(),
    name text not null check (length(btrim(name)) between 1 and 200),
    worker_code text not null check (length(btrim(worker_code)) between 1 and 200),
    trade text not null check (length(btrim(trade)) between 1 and 200),
    active boolean not null default true,
    revision integer not null default 1 check (revision > 0),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id, id),
    unique (tenant_id, worker_code),
    unique (tenant_id, request_id)
);
create index psi_tenant_workers_page_idx on public.psi_tenant_workers(tenant_id, created_at desc, id desc);

create table public.psi_tenant_worker_events (
    tenant_id uuid not null,
    id uuid not null default gen_random_uuid(),
    worker_id uuid not null,
    worker_revision integer not null,
    actor_id uuid not null references auth.users(id) on delete restrict,
    name text not null,
    worker_code text not null,
    trade text not null,
    active boolean not null,
    occurred_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id, id),
    unique (tenant_id, worker_id, worker_revision),
    foreign key (tenant_id, worker_id) references public.psi_tenant_workers(tenant_id, id) on delete restrict
);

alter table public.psi_tenant_workers enable row level security;
alter table public.psi_tenant_workers force row level security;
alter table public.psi_tenant_worker_events enable row level security;
alter table public.psi_tenant_worker_events force row level security;
revoke all on public.psi_tenant_workers, public.psi_tenant_worker_events from public, anon, authenticated, service_role;
grant select on public.psi_tenant_workers, public.psi_tenant_worker_events to authenticated, service_role;
grant insert (tenant_id, request_id, name, worker_code, trade, active) on public.psi_tenant_workers to authenticated;
grant update (name, trade, active) on public.psi_tenant_workers to authenticated;

create policy tenant_workers_read on public.psi_tenant_workers for select to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_workers.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active')
);
create policy tenant_workers_create on public.psi_tenant_workers for insert to authenticated with check (
    created_by = (select auth.uid()) and updated_by = (select auth.uid()) and revision = 1
    and exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_workers.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin'))
);
create policy tenant_workers_update on public.psi_tenant_workers for update to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_workers.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin'))
) with check (
    updated_by = (select auth.uid()) and exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_workers.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin'))
);
create policy tenant_worker_events_read on public.psi_tenant_worker_events for select to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_worker_events.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active')
);

-- Invoker checks apply even if a caller bypasses the application and uses PostgREST directly.
create function public.psi_protect_tenant_worker() returns trigger
language plpgsql set search_path = '' as $$
declare actor_role text;
begin
    select m.role into actor_role from public.psi_tenant_memberships m
      where m.tenant_id = new.tenant_id and m.user_id = auth.uid() and m.status = 'active';
    if actor_role is null or actor_role not in ('owner', 'admin') then
        raise exception 'Draft write forbidden' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
        new.revision := 1;
        new.created_by := auth.uid(); new.created_at := pg_catalog.clock_timestamp();
    else
        if new.tenant_id is distinct from old.tenant_id or new.id is distinct from old.id
           or new.request_id is distinct from old.request_id or new.created_by is distinct from old.created_by
           or new.created_at is distinct from old.created_at or new.worker_code is distinct from old.worker_code then
            raise exception 'Draft identity is immutable' using errcode = '42501';
        end if;
        new.revision := old.revision + 1;
    end if;
    new.updated_by := auth.uid(); new.updated_at := pg_catalog.clock_timestamp();
    return new;
end;
$$;
revoke all on function public.psi_protect_tenant_worker() from public, anon, authenticated;
create trigger psi_tenant_worker_protect before insert or update on public.psi_tenant_workers
    for each row execute function public.psi_protect_tenant_worker();

-- Append within the same transaction: an audit failure must roll back the business write.
create function public.psi_append_tenant_worker_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.psi_tenant_worker_events(tenant_id, worker_id, worker_revision, actor_id, name, worker_code, trade, active)
      values(new.tenant_id, new.id, new.revision, new.updated_by, new.name, new.worker_code, new.trade, new.active);
    return new;
end;
$$;
revoke all on function public.psi_append_tenant_worker_event() from public, anon, authenticated;
create trigger psi_tenant_worker_audit after insert or update on public.psi_tenant_workers
    for each row execute function public.psi_append_tenant_worker_event();

comment on table public.psi_tenant_workers is 'New tenant-scoped worker registry; no legacy migration, contact details or credentials.';
comment on table public.psi_tenant_worker_events is 'Append-only worker registry snapshots, written atomically.';


alter table public.psi_tenant_training_drafts add column worker_ids uuid[] not null default '{}'
    check (cardinality(worker_ids) <= 200);
alter table public.psi_tenant_training_draft_events add column worker_ids uuid[] not null default '{}';
grant insert (worker_ids), update (worker_ids) on public.psi_tenant_training_drafts to authenticated;

create function public.psi_validate_draft_workers() returns trigger
language plpgsql security definer set search_path = '' as $$
declare matched integer;
begin
    -- The definer only locks workers after confirming the actual user's draft-write membership.
    -- This avoids granting reviewers registry update rights merely to take a row lock.
    if not exists (select 1 from public.psi_tenant_memberships m
       where m.tenant_id = new.tenant_id and m.user_id = auth.uid()
       and m.status = 'active' and m.role in ('owner','admin','reviewer')) then
        raise exception 'Draft target selection forbidden' using errcode = '42501';
    end if;
    if coalesce(array_ndims(new.worker_ids), 1) <> 1 or array_position(new.worker_ids, null) is not null
       or cardinality(new.worker_ids) <> (select count(distinct v) from unnest(new.worker_ids) v) then
        raise exception 'Invalid worker selection' using errcode = '23514';
    end if;
    -- Locks serialize selection with an administrative deactivation; no name-based matching.
    perform w.id from public.psi_tenant_workers w
      where w.tenant_id = new.tenant_id and w.id = any(new.worker_ids) and w.active
      order by w.id for share;
    get diagnostics matched = row_count;
    if matched <> cardinality(new.worker_ids) then
        raise exception 'Worker unavailable in this company' using errcode = '23514';
    end if;
    return new;
end;
$$;
revoke all on function public.psi_validate_draft_workers() from public, anon, authenticated;
create trigger psi_training_draft_workers_validate before insert or update on public.psi_tenant_training_drafts
    for each row execute function public.psi_validate_draft_workers();

create or replace function public.psi_append_tenant_training_draft_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.psi_tenant_training_draft_events(tenant_id, draft_id, draft_revision, actor_id, title, site_name, source_text_ko, worker_ids)
      values(new.tenant_id, new.id, new.revision, new.updated_by, new.title, new.site_name, new.source_text_ko, new.worker_ids);
    return new;
end;
$$;
revoke all on function public.psi_append_tenant_training_draft_event() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
