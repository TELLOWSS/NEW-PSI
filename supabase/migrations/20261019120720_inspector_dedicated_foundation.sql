-- Dedicated NEW-PSI installation only. No backfill, legacy changes or browser data grants.
begin;
create schema if not exists psi_inspector_private;
revoke all on schema psi_inspector_private from public, anon, authenticated;

create table public.psi_inspector_inspections (
    id uuid primary key,
    revision integer not null default 1 check(revision>0),
    document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=512000),
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    unique(id,revision)
);
create index psi_inspector_inspections_page_idx on public.psi_inspector_inspections(created_at desc,id desc);
-- A bounded list projection avoids returning dozens of full image-analysis documents.
create view public.psi_inspector_summary with(security_invoker=true) as
select id,revision,document->>'title' as title,document->>'workType' as work_type,document->>'location' as location,
    coalesce((document->>'urgent')::boolean,false) as urgent,
    (select count(*)::integer from jsonb_array_elements(coalesce(document->'actions','[]')) a where a->>'status'<>'verified') as open_actions,
    exists(select 1 from jsonb_object_keys(coalesce(document->'analyses','{}')) k where not coalesce(document->'reviews','{}') ? k) as needs_review,
    created_at,updated_at from public.psi_inspector_inspections;
revoke all on public.psi_inspector_summary from public,anon,authenticated,service_role;
grant select on public.psi_inspector_summary to service_role;

create table public.psi_inspector_evidence (
    id uuid primary key,
    inspection_id uuid not null references public.psi_inspector_inspections(id) on delete restrict,
    sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
    mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
    byte_size integer not null check(byte_size between 1 and 3145728),
    storage_key text not null unique,
    created_at timestamptz not null default clock_timestamp(),
    unique(inspection_id,id)
);
create index psi_inspector_evidence_parent_idx on public.psi_inspector_evidence(inspection_id,created_at);
create table public.psi_inspector_events (
    inspection_id uuid not null references public.psi_inspector_inspections(id) on delete restrict,
    revision integer not null,
    actor_label text not null default 'dedicated-admin' check(actor_label='dedicated-admin'),
    document_snapshot jsonb not null,
    occurred_at timestamptz not null default clock_timestamp(),
    primary key(inspection_id,revision)
);
create table public.psi_inspector_reports (
    id uuid primary key,
    inspection_id uuid not null references public.psi_inspector_inspections(id) on delete restrict,
    inspection_revision integer not null,
    snapshot jsonb not null,
    snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
    created_at timestamptz not null default clock_timestamp(),
    foreign key(inspection_id,inspection_revision) references public.psi_inspector_events(inspection_id,revision) on delete restrict
);
create index psi_inspector_reports_parent_idx on public.psi_inspector_reports(inspection_id,created_at);

alter table public.psi_inspector_inspections enable row level security;
alter table public.psi_inspector_inspections force row level security;
alter table public.psi_inspector_evidence enable row level security;
alter table public.psi_inspector_evidence force row level security;
alter table public.psi_inspector_events enable row level security;
alter table public.psi_inspector_events force row level security;
alter table public.psi_inspector_reports enable row level security;
alter table public.psi_inspector_reports force row level security;
-- No anon/authenticated policy: browsers cannot read or write this dedicated workspace.
revoke all on public.psi_inspector_inspections,public.psi_inspector_evidence,public.psi_inspector_events,public.psi_inspector_reports from public,anon,authenticated,service_role;
grant select,insert on public.psi_inspector_inspections to service_role;
grant update(document) on public.psi_inspector_inspections to service_role;
grant select,insert on public.psi_inspector_evidence,public.psi_inspector_reports to service_role;
grant select on public.psi_inspector_events to service_role;

create function psi_inspector_private.protect_inspection() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if tg_op='UPDATE' then
        if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
            raise exception 'Immutable inspection identity' using errcode='23514';
        end if;
        new.revision:=old.revision+1;
    else
        new.revision:=1;
        new.created_at:=pg_catalog.clock_timestamp();
    end if;
    new.updated_at:=pg_catalog.clock_timestamp();
    return new;
end;
$$;
revoke all on function psi_inspector_private.protect_inspection() from public,anon,authenticated,service_role;
create trigger psi_inspector_protect before insert or update on public.psi_inspector_inspections
    for each row execute function psi_inspector_private.protect_inspection();

-- Trigger-only append: API callers cannot forge or edit audit records, even with its DB role.
create function psi_inspector_private.append_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
    insert into public.psi_inspector_events(inspection_id,revision,document_snapshot)
      values(new.id,new.revision,new.document);
    return new;
end;
$$;
revoke all on function psi_inspector_private.append_revision() from public,anon,authenticated,service_role;
create trigger psi_inspector_audit after insert or update on public.psi_inspector_inspections
    for each row execute function psi_inspector_private.append_revision();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('psi-inspector-evidence','psi-inspector-evidence',false,3145728,array['image/jpeg','image/png','image/webp']);
-- Storage permits uploads only through the authenticated server. Existing broad storage
-- policies are restricted for this bucket even if they target all buckets.
create policy inspector_evidence_browser_deny on storage.objects as restrictive for all to anon,authenticated
    using(bucket_id<>'psi-inspector-evidence') with check(bucket_id<>'psi-inspector-evidence');
comment on table public.psi_inspector_inspections is 'Dedicated installation only. All access requires server-verified administrator session. Shared SaaS disabled in API.';
comment on table public.psi_inspector_events is 'Atomic immutable revision snapshots. Shared administrator actor is not an individual signature.';
notify pgrst,'reload schema';
commit;
