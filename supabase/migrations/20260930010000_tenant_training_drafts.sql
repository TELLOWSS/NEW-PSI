-- Additive tenant workspace. Never backfill or expose legacy PSI data.
-- Apply only after tenant_identity_foundation in an isolated project first.
begin;

create table public.psi_tenant_training_drafts (
    tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
    id uuid not null default gen_random_uuid(),
    request_id uuid not null default gen_random_uuid(),
    title text not null check (length(btrim(title)) between 1 and 200),
    site_name text not null check (length(btrim(site_name)) between 1 and 200),
    source_text_ko text not null check (length(btrim(source_text_ko)) between 1 and 10000),
    revision integer not null default 1 check (revision > 0),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id, id),
    unique (tenant_id, request_id)
);
create index psi_tenant_training_drafts_page_idx on public.psi_tenant_training_drafts(tenant_id, created_at desc, id desc);

create table public.psi_tenant_training_draft_events (
    tenant_id uuid not null,
    id uuid not null default gen_random_uuid(),
    draft_id uuid not null,
    draft_revision integer not null,
    actor_id uuid not null references auth.users(id) on delete restrict,
    title text not null,
    site_name text not null,
    source_text_ko text not null,
    occurred_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id, id),
    unique (tenant_id, draft_id, draft_revision),
    foreign key (tenant_id, draft_id) references public.psi_tenant_training_drafts(tenant_id, id) on delete restrict
);

alter table public.psi_tenant_training_drafts enable row level security;
alter table public.psi_tenant_training_drafts force row level security;
alter table public.psi_tenant_training_draft_events enable row level security;
alter table public.psi_tenant_training_draft_events force row level security;
revoke all on public.psi_tenant_training_drafts, public.psi_tenant_training_draft_events from public, anon, authenticated, service_role;
grant select on public.psi_tenant_training_drafts, public.psi_tenant_training_draft_events to authenticated, service_role;
grant insert (tenant_id, request_id, title, site_name, source_text_ko) on public.psi_tenant_training_drafts to authenticated;
grant update (title, site_name, source_text_ko) on public.psi_tenant_training_drafts to authenticated;

create policy tenant_training_drafts_read on public.psi_tenant_training_drafts for select to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_training_drafts.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active')
);
create policy tenant_training_drafts_create on public.psi_tenant_training_drafts for insert to authenticated with check (
    created_by = (select auth.uid()) and updated_by = (select auth.uid()) and revision = 1
    and exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_training_drafts.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer'))
);
create policy tenant_training_drafts_update on public.psi_tenant_training_drafts for update to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_training_drafts.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer'))
) with check (
    updated_by = (select auth.uid()) and exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_training_drafts.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer'))
);
create policy tenant_training_draft_events_read on public.psi_tenant_training_draft_events for select to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_training_draft_events.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active')
);

-- Invoker checks apply even if a caller bypasses the application and uses PostgREST directly.
create function public.psi_protect_tenant_training_draft() returns trigger
language plpgsql set search_path = '' as $$
declare actor_role text;
begin
    select m.role into actor_role from public.psi_tenant_memberships m
      where m.tenant_id = new.tenant_id and m.user_id = auth.uid() and m.status = 'active';
    if actor_role is null or actor_role not in ('owner', 'admin', 'reviewer') then
        raise exception 'Draft write forbidden' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
        new.revision := 1;
        new.created_by := auth.uid(); new.created_at := pg_catalog.clock_timestamp();
    else
        if new.tenant_id is distinct from old.tenant_id or new.id is distinct from old.id
           or new.request_id is distinct from old.request_id or new.created_by is distinct from old.created_by
           or new.created_at is distinct from old.created_at then
            raise exception 'Draft identity is immutable' using errcode = '42501';
        end if;
        new.revision := old.revision + 1;
    end if;
    new.updated_by := auth.uid(); new.updated_at := pg_catalog.clock_timestamp();
    return new;
end;
$$;
revoke all on function public.psi_protect_tenant_training_draft() from public, anon, authenticated;
create trigger psi_tenant_training_draft_protect before insert or update on public.psi_tenant_training_drafts
    for each row execute function public.psi_protect_tenant_training_draft();

-- Append within the same transaction: an audit failure must roll back the business write.
create function public.psi_append_tenant_training_draft_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.psi_tenant_training_draft_events(tenant_id, draft_id, draft_revision, actor_id, title, site_name, source_text_ko)
      values(new.tenant_id, new.id, new.revision, new.updated_by, new.title, new.site_name, new.source_text_ko);
    return new;
end;
$$;
revoke all on function public.psi_append_tenant_training_draft_event() from public, anon, authenticated;
create trigger psi_tenant_training_draft_audit after insert or update on public.psi_tenant_training_drafts
    for each row execute function public.psi_append_tenant_training_draft_event();

comment on table public.psi_tenant_training_drafts is 'New tenant-scoped education drafts only; never published to workers or migrated from legacy data.';
comment on table public.psi_tenant_training_draft_events is 'Append-only education draft snapshots; written atomically by trigger.';
notify pgrst, 'reload schema';
commit;
