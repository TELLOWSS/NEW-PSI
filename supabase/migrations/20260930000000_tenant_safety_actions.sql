-- Additive tenant workspace. Never backfill or expose legacy PSI data.
-- Apply only after tenant_identity_foundation in an isolated project first.
begin;

create table public.psi_tenant_actions (
    tenant_id uuid not null references public.psi_tenants(id) on delete restrict,
    id uuid not null default gen_random_uuid(),
    request_id uuid not null default gen_random_uuid(),
    title text not null check (length(btrim(title)) between 1 and 200),
    site_name text not null check (length(btrim(site_name)) between 1 and 200),
    description text not null check (length(btrim(description)) between 1 and 4000),
    due_date date check (due_date between date '2000-01-01' and date '2100-12-31'),
    status text not null default 'open' check (status in ('open', 'in-progress', 'review-requested', 'closed')),
    verification_note text not null default '' check (length(verification_note) <= 2000),
    revision integer not null default 1 check (revision > 0),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id, id),
    unique (tenant_id, request_id)
);
create index psi_tenant_actions_page_idx on public.psi_tenant_actions(tenant_id, created_at desc, id desc);

create table public.psi_tenant_action_events (
    tenant_id uuid not null,
    id uuid not null default gen_random_uuid(),
    action_id uuid not null,
    action_revision integer not null,
    actor_id uuid not null references auth.users(id) on delete restrict,
    from_status text,
    to_status text not null,
    verification_note text not null,
    occurred_at timestamptz not null default clock_timestamp(),
    primary key (tenant_id, id),
    unique (tenant_id, action_id, action_revision),
    foreign key (tenant_id, action_id) references public.psi_tenant_actions(tenant_id, id) on delete restrict
);

alter table public.psi_tenant_actions enable row level security;
alter table public.psi_tenant_actions force row level security;
alter table public.psi_tenant_action_events enable row level security;
alter table public.psi_tenant_action_events force row level security;
revoke all on public.psi_tenant_actions, public.psi_tenant_action_events from public, anon, authenticated, service_role;
grant select on public.psi_tenant_actions, public.psi_tenant_action_events to authenticated, service_role;
grant insert (tenant_id, request_id, title, site_name, description, due_date) on public.psi_tenant_actions to authenticated;
grant update (title, site_name, description, due_date, status, verification_note) on public.psi_tenant_actions to authenticated;

create policy tenant_actions_read on public.psi_tenant_actions for select to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_actions.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active')
);
create policy tenant_actions_create on public.psi_tenant_actions for insert to authenticated with check (
    created_by = (select auth.uid()) and updated_by = (select auth.uid()) and status = 'open' and revision = 1
    and exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_actions.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer'))
);
create policy tenant_actions_update on public.psi_tenant_actions for update to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_actions.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer'))
) with check (
    updated_by = (select auth.uid()) and exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_actions.tenant_id and m.user_id = (select auth.uid())
          and m.status = 'active' and m.role in ('owner', 'admin', 'reviewer'))
);
create policy tenant_action_events_read on public.psi_tenant_action_events for select to authenticated using (
    exists (select 1 from public.psi_tenant_memberships m
        where m.tenant_id = psi_tenant_action_events.tenant_id and m.user_id = (select auth.uid()) and m.status = 'active')
);

-- Invoker checks apply even if a caller bypasses the application and uses PostgREST directly.
create function public.psi_protect_tenant_action() returns trigger
language plpgsql set search_path = '' as $$
declare actor_role text;
begin
    select m.role into actor_role from public.psi_tenant_memberships m
      where m.tenant_id = new.tenant_id and m.user_id = auth.uid() and m.status = 'active';
    if actor_role is null or actor_role not in ('owner', 'admin', 'reviewer') then
        raise exception 'Action write forbidden' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
        new.status := 'open'; new.verification_note := ''; new.revision := 1;
        new.created_by := auth.uid(); new.created_at := pg_catalog.clock_timestamp();
    else
        if new.tenant_id is distinct from old.tenant_id or new.id is distinct from old.id
           or new.request_id is distinct from old.request_id or new.created_by is distinct from old.created_by
           or new.created_at is distinct from old.created_at then
            raise exception 'Action identity is immutable' using errcode = '42501';
        end if;
        if old.status = 'closed' then
            if actor_role not in ('owner', 'admin') then
                raise exception 'Reopening requires an administrator' using errcode = '42501';
            end if;
            if new.status <> 'open' or length(btrim(new.verification_note)) < 5 then
                raise exception 'Reopening requires a reason' using errcode = '23514';
            end if;
        elsif new.status is distinct from old.status then
            if new.status = 'closed' then
                if actor_role not in ('owner', 'admin') then
                    raise exception 'Closure requires an administrator' using errcode = '42501';
                end if;
                if old.status <> 'review-requested' or length(btrim(new.verification_note)) < 5 then
                    raise exception 'Closure requires review and evidence' using errcode = '23514';
                end if;
            elsif not ((old.status = 'open' and new.status in ('in-progress', 'review-requested'))
                or (old.status = 'in-progress' and new.status in ('open', 'review-requested'))
                or (old.status = 'review-requested' and new.status = 'in-progress')) then
                raise exception 'Invalid action transition' using errcode = '23514';
            end if;
        end if;
        new.revision := old.revision + 1;
    end if;
    new.updated_by := auth.uid(); new.updated_at := pg_catalog.clock_timestamp();
    return new;
end;
$$;
revoke all on function public.psi_protect_tenant_action() from public, anon, authenticated;
create trigger psi_tenant_action_protect before insert or update on public.psi_tenant_actions
    for each row execute function public.psi_protect_tenant_action();

-- Append within the same transaction: an audit failure must roll back the business write.
create function public.psi_append_tenant_action_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.psi_tenant_action_events(tenant_id, action_id, action_revision, actor_id, from_status, to_status, verification_note)
      values(new.tenant_id, new.id, new.revision, new.updated_by,
        case when tg_op = 'UPDATE' then old.status else null end, new.status, new.verification_note);
    return new;
end;
$$;
revoke all on function public.psi_append_tenant_action_event() from public, anon, authenticated;
create trigger psi_tenant_action_audit after insert or update on public.psi_tenant_actions
    for each row execute function public.psi_append_tenant_action_event();

comment on table public.psi_tenant_actions is 'New tenant-scoped safety actions only; no legacy migration or worker identifiers.';
comment on table public.psi_tenant_action_events is 'Append-only action revisions and verification notes; written atomically by trigger.';
notify pgrst, 'reload schema';
commit;
