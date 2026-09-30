-- Additive account-bound education release. No legacy data migration or public bearer grants.
begin;
create table public.psi_tenant_worker_accounts (
 tenant_id uuid not null, worker_id uuid not null,
 user_id uuid not null references auth.users(id) on delete restrict,
 email text not null check(length(email) between 3 and 320),
 active boolean not null default true, revision integer not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id) on delete restrict,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,worker_id), unique(tenant_id,user_id),
 foreign key(tenant_id,worker_id) references public.psi_tenant_workers(tenant_id,id) on delete restrict
);
create table public.psi_tenant_worker_account_events (
 tenant_id uuid not null, worker_id uuid not null, revision integer not null,
 user_id uuid not null references auth.users(id) on delete restrict,
 email text not null, active boolean not null, actor_id uuid not null references auth.users(id) on delete restrict,
 occurred_at timestamptz not null default clock_timestamp(), primary key(tenant_id,worker_id,revision),
 foreign key(tenant_id,worker_id) references public.psi_tenant_worker_accounts(tenant_id,worker_id) on delete restrict
);
create table public.psi_tenant_education_releases (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(), request_id uuid not null,
 draft_id uuid not null, draft_revision integer not null check(draft_revision>0),
 title text not null, site_name text not null, source_text_ko text not null,
 worker_ids uuid[] not null check(cardinality(worker_ids) between 1 and 200),
 duration_hours integer not null check(duration_hours between 1 and 168),
 expires_at timestamptz not null, revoked boolean not null default false,
 revision integer not null default 1 check(revision in (1,2)),
 created_by uuid not null references auth.users(id) on delete restrict,
 revoked_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,id), unique(id), unique(tenant_id,request_id),
 foreign key(tenant_id,draft_id) references public.psi_tenant_training_drafts(tenant_id,id) on delete restrict
);
create index psi_education_release_page_idx on public.psi_tenant_education_releases(tenant_id,draft_id,created_at desc,id desc);
create table public.psi_tenant_education_release_events (
 tenant_id uuid not null, release_id uuid not null, revision integer not null,
 action text not null check(action in ('published','revoked')),
 actor_id uuid not null references auth.users(id) on delete restrict,
 occurred_at timestamptz not null default clock_timestamp(), primary key(tenant_id,release_id,revision),
 foreign key(tenant_id,release_id) references public.psi_tenant_education_releases(tenant_id,id) on delete restrict
);
alter table public.psi_tenant_worker_accounts enable row level security;
alter table public.psi_tenant_worker_accounts force row level security;
alter table public.psi_tenant_worker_account_events enable row level security;
alter table public.psi_tenant_worker_account_events force row level security;
alter table public.psi_tenant_education_releases enable row level security;
alter table public.psi_tenant_education_releases force row level security;
alter table public.psi_tenant_education_release_events enable row level security;
alter table public.psi_tenant_education_release_events force row level security;
revoke all on public.psi_tenant_worker_accounts,public.psi_tenant_worker_account_events,
 public.psi_tenant_education_releases,public.psi_tenant_education_release_events from public,anon,authenticated,service_role;
grant select on public.psi_tenant_worker_accounts,public.psi_tenant_worker_account_events,
 public.psi_tenant_education_releases,public.psi_tenant_education_release_events to authenticated,service_role;
create policy worker_accounts_manager_read on public.psi_tenant_worker_accounts for select to authenticated using (
 exists(select 1 from public.psi_tenant_memberships m where m.tenant_id=psi_tenant_worker_accounts.tenant_id
 and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin')));
create policy worker_account_events_manager_read on public.psi_tenant_worker_account_events for select to authenticated using (
 exists(select 1 from public.psi_tenant_memberships m where m.tenant_id=psi_tenant_worker_account_events.tenant_id
 and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin')));
create policy education_releases_staff_read on public.psi_tenant_education_releases for select to authenticated using (
 exists(select 1 from public.psi_tenant_memberships m where m.tenant_id=psi_tenant_education_releases.tenant_id
 and m.user_id=(select auth.uid()) and m.status='active'));
create policy education_release_events_staff_read on public.psi_tenant_education_release_events for select to authenticated using (
 exists(select 1 from public.psi_tenant_memberships m where m.tenant_id=psi_tenant_education_release_events.tenant_id
 and m.user_id=(select auth.uid()) and m.status='active'));

create function public.psi_assert_education_manager(p_tenant uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform m.user_id from public.psi_tenant_memberships m where m.tenant_id=p_tenant and m.user_id=auth.uid()
 and m.status='active' and m.role in ('owner','admin') for share;
 if not found then raise exception 'Education management forbidden' using errcode='42501'; end if;
end $$;
revoke all on function public.psi_assert_education_manager(uuid) from public,anon,authenticated;

create function public.psi_link_worker_account(p_tenant uuid,p_worker uuid,p_email text,p_expected integer)
returns public.psi_tenant_worker_accounts language plpgsql security definer set search_path='' as $$
declare account public.psi_tenant_worker_accounts; selected_user uuid; normalized text; existing public.psi_tenant_worker_accounts; candidates uuid[];
begin
 perform public.psi_assert_education_manager(p_tenant);
 if p_expected is null or p_expected<0 or p_expected>2147483646 or p_email is null
 or length(p_email)>320 then raise exception 'Invalid account link' using errcode='23514'; end if;
 normalized:=lower(btrim(p_email));
 perform w.id from public.psi_tenant_workers w where w.tenant_id=p_tenant and w.id=p_worker and w.active for share;
 if not found then raise exception 'Worker unavailable' using errcode='23514'; end if;
 select array_agg(u.id) into candidates from auth.users u where lower(u.email)=normalized
 and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=pg_catalog.clock_timestamp());
 if coalesce(cardinality(candidates),0)<>1 then raise exception 'Confirmed account required' using errcode='23514'; end if;
 select u.id into selected_user from auth.users u where u.id=candidates[1] and lower(u.email)=normalized
 and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=pg_catalog.clock_timestamp()) for share;
 if selected_user is null then raise exception 'Confirmed account required' using errcode='23514'; end if;
 select * into existing from public.psi_tenant_worker_accounts a where a.tenant_id=p_tenant and a.worker_id=p_worker for update;
 if found then
   if existing.revision<>p_expected then raise exception 'Account link revision conflict' using errcode='40001'; end if;
   update public.psi_tenant_worker_accounts set user_id=selected_user,email=normalized,active=true,
    revision=existing.revision+1,updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
    where tenant_id=p_tenant and worker_id=p_worker returning * into account;
 else
   if p_expected<>0 then raise exception 'Account link revision conflict' using errcode='40001'; end if;
   insert into public.psi_tenant_worker_accounts(tenant_id,worker_id,user_id,email,updated_by)
    values(p_tenant,p_worker,selected_user,normalized,auth.uid()) returning * into account;
 end if;
 insert into public.psi_tenant_worker_account_events(tenant_id,worker_id,revision,user_id,email,active,actor_id)
 values(account.tenant_id,account.worker_id,account.revision,account.user_id,account.email,account.active,auth.uid());
 return account;
end $$;
revoke all on function public.psi_link_worker_account(uuid,uuid,text,integer) from public,anon;
grant execute on function public.psi_link_worker_account(uuid,uuid,text,integer) to authenticated;

create function public.psi_suspend_worker_account(p_tenant uuid,p_worker uuid,p_expected integer)
returns public.psi_tenant_worker_accounts language plpgsql security definer set search_path='' as $$
declare account public.psi_tenant_worker_accounts;
begin
 perform public.psi_assert_education_manager(p_tenant);
 -- Same lock order as publication: worker before binding.
 perform w.id from public.psi_tenant_workers w where w.tenant_id=p_tenant and w.id=p_worker for share;
 update public.psi_tenant_worker_accounts set active=false,revision=revision+1,updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
 where tenant_id=p_tenant and worker_id=p_worker and revision=p_expected and active returning * into account;
 if not found then raise exception 'Account link revision conflict' using errcode='40001'; end if;
 insert into public.psi_tenant_worker_account_events(tenant_id,worker_id,revision,user_id,email,active,actor_id)
 values(account.tenant_id,account.worker_id,account.revision,account.user_id,account.email,account.active,auth.uid());
 return account;
end $$;
revoke all on function public.psi_suspend_worker_account(uuid,uuid,integer) from public,anon;
grant execute on function public.psi_suspend_worker_account(uuid,uuid,integer) to authenticated;

create function public.psi_publish_tenant_education(p_tenant uuid,p_draft uuid,p_expected integer,p_request uuid,p_hours integer)
returns public.psi_tenant_education_releases language plpgsql security definer set search_path='' as $$
declare draft public.psi_tenant_training_drafts; release public.psi_tenant_education_releases; matched integer;
begin
 perform public.psi_assert_education_manager(p_tenant);
 if p_expected is null or p_expected<1 or p_expected>2147483646 or p_request is null or p_hours is null or p_hours<1 or p_hours>168 then raise exception 'Invalid publication' using errcode='23514'; end if;
 select * into draft from public.psi_tenant_training_drafts d where d.tenant_id=p_tenant and d.id=p_draft for share;
 if not found or draft.revision<>p_expected then raise exception 'Draft revision conflict' using errcode='40001'; end if;
 if cardinality(draft.worker_ids)=0 then raise exception 'Targets required' using errcode='23514'; end if;
 perform w.id from public.psi_tenant_workers w where w.tenant_id=p_tenant and w.id=any(draft.worker_ids) and w.active order by w.id for share;
 get diagnostics matched=row_count;
 if matched<>cardinality(draft.worker_ids) then raise exception 'Worker unavailable' using errcode='23514'; end if;
 perform a.worker_id from public.psi_tenant_worker_accounts a join auth.users u on u.id=a.user_id
 where a.tenant_id=p_tenant and a.worker_id=any(draft.worker_ids) and a.active
 and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=pg_catalog.clock_timestamp())
 and lower(u.email)=a.email order by a.worker_id for share of a,u;
 get diagnostics matched=row_count;
 if matched<>cardinality(draft.worker_ids) then raise exception 'Confirmed accounts required for all targets' using errcode='23514'; end if;
 select * into release from public.psi_tenant_education_releases r where r.tenant_id=p_tenant and r.request_id=p_request;
 if found then
   if release.created_by<>auth.uid() or release.draft_id<>p_draft or release.draft_revision<>p_expected or release.duration_hours<>p_hours
   then raise exception 'Publication request conflict' using errcode='40001'; end if;
   return release;
 end if;
 insert into public.psi_tenant_education_releases(tenant_id,request_id,draft_id,draft_revision,title,site_name,source_text_ko,worker_ids,duration_hours,expires_at,created_by)
 values(p_tenant,p_request,draft.id,draft.revision,draft.title,draft.site_name,draft.source_text_ko,draft.worker_ids,p_hours,
 pg_catalog.clock_timestamp()+pg_catalog.make_interval(hours=>p_hours),auth.uid()) returning * into release;
 insert into public.psi_tenant_education_release_events(tenant_id,release_id,revision,action,actor_id)
 values(release.tenant_id,release.id,release.revision,'published',auth.uid());
 return release;
end $$;
revoke all on function public.psi_publish_tenant_education(uuid,uuid,integer,uuid,integer) from public,anon;
grant execute on function public.psi_publish_tenant_education(uuid,uuid,integer,uuid,integer) to authenticated;

create function public.psi_revoke_tenant_education(p_tenant uuid,p_release uuid,p_expected integer)
returns public.psi_tenant_education_releases language plpgsql security definer set search_path='' as $$
declare release public.psi_tenant_education_releases;
begin
 perform public.psi_assert_education_manager(p_tenant);
 update public.psi_tenant_education_releases set revoked=true,revoked_by=auth.uid(),revision=2
 where tenant_id=p_tenant and id=p_release and revision=p_expected and not revoked returning * into release;
 if not found then raise exception 'Release revision conflict' using errcode='40001'; end if;
 insert into public.psi_tenant_education_release_events(tenant_id,release_id,revision,action,actor_id)
 values(release.tenant_id,release.id,release.revision,'revoked',auth.uid());
 return release;
end $$;
revoke all on function public.psi_revoke_tenant_education(uuid,uuid,integer) from public,anon;
grant execute on function public.psi_revoke_tenant_education(uuid,uuid,integer) to authenticated;

create function public.psi_read_worker_education(p_release uuid,p_worker uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('title',r.title,'siteName',r.site_name,'sourceTextKo',r.source_text_ko,
 'workerName',w.name,'expiresAt',r.expires_at,'draftRevision',r.draft_revision) into result
 from public.psi_tenant_education_releases r
 join public.psi_tenant_training_drafts d on d.tenant_id=r.tenant_id and d.id=r.draft_id and d.revision=r.draft_revision
 join public.psi_tenant_workers w on w.tenant_id=r.tenant_id and w.id=p_worker and w.active
 join public.psi_tenant_worker_accounts a on a.tenant_id=w.tenant_id and a.worker_id=w.id and a.active and a.user_id=auth.uid()
 join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=pg_catalog.clock_timestamp()) and lower(u.email)=a.email
 where r.id=p_release and p_worker=any(r.worker_ids) and p_worker=any(d.worker_ids)
 and not r.revoked and r.expires_at>pg_catalog.clock_timestamp()
 and exists(select 1 from public.psi_tenant_memberships m where m.tenant_id=r.tenant_id and m.user_id=r.created_by
 and m.status='active' and m.role in ('owner','admin'));
 if result is null then raise exception 'Education unavailable' using errcode='42501'; end if;
 return result;
end $$;
revoke all on function public.psi_read_worker_education(uuid,uuid) from public,anon;
grant execute on function public.psi_read_worker_education(uuid,uuid) to authenticated;
comment on table public.psi_tenant_education_releases is 'Immutable published snapshot; draft edits invalidate worker access. Account-bound, expiring, revocable; no legacy worker link authorization.';
notify pgrst,'reload schema';
commit;
