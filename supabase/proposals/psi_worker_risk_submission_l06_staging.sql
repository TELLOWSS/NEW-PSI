-- L06 2026-11-22: SQL PROPOSAL FOR ISOLATED PGLITE / APPROVED TEST DATABASE ONLY.
-- DO NOT deploy via supabase migration or run in the operational PSI-Database.
-- Prerequisites: tenant identity, tenant workers + worker-account education
-- foundation; site tables from psi_tenant_site_memberships_staging.sql.
-- Does NOT enable a Vercel route or authorize a worker submission in production.
begin;

create table public.psi_tenant_risk_cycles (
  tenant_id uuid not null,
  site_id uuid not null,
  id uuid not null default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 2 and 120),
  status text not null default 'draft' check (status in ('draft','open','closed')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id,site_id,id),
  foreign key (tenant_id,site_id) references public.psi_tenant_sites(tenant_id,id) on delete restrict,
  constraint psi_l06_cycle_valid_period check (opens_at < closes_at)
);

create table public.psi_worker_risk_submissions (
  tenant_id uuid not null,
  site_id uuid not null,
  id uuid not null default gen_random_uuid(),
  cycle_id uuid not null,
  worker_id uuid not null,
  account_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  form_version text not null,
  source_language text not null check (source_language in ('ko','vi','zh','th','km','uz','id','mn','ru','my','kk','bn')),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  self_risk_grade text not null check (self_risk_grade in ('상','중','하')),
  grade_reason text not null default '' check(length(grade_reason) <= 500),
  state text not null default 'received-pending-manager-review'
    check (state = 'received-pending-manager-review'),
  received_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id,site_id,id),
  unique (tenant_id,worker_id,request_id),
  unique (tenant_id,site_id,id,worker_id),
  foreign key (tenant_id,site_id,cycle_id)
    references public.psi_tenant_risk_cycles(tenant_id,site_id,id) on delete restrict,
  foreign key (tenant_id,site_id,worker_id)
    references public.psi_tenant_site_worker_assignments(tenant_id,site_id,worker_id) on delete restrict,
  foreign key (tenant_id,worker_id)
    references public.psi_tenant_worker_accounts(tenant_id,worker_id) on delete restrict
);
create index psi_l06_submissions_cycle_idx
  on public.psi_worker_risk_submissions(tenant_id,site_id,cycle_id,received_at desc,id);

create table public.psi_worker_risk_receipt_events (
  tenant_id uuid not null,
  site_id uuid not null,
  submission_id uuid not null,
  worker_id uuid not null,
  revision integer not null check(revision = 1),
  kind text not null check(kind = 'received'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id,site_id,submission_id,revision),
  foreign key (tenant_id,site_id,submission_id,worker_id)
    references public.psi_worker_risk_submissions(tenant_id,site_id,id,worker_id) on delete restrict
);

alter table public.psi_tenant_risk_cycles enable row level security;
alter table public.psi_tenant_risk_cycles force row level security;
alter table public.psi_worker_risk_submissions enable row level security;
alter table public.psi_worker_risk_submissions force row level security;
alter table public.psi_worker_risk_receipt_events enable row level security;
alter table public.psi_worker_risk_receipt_events force row level security;

-- No direct SELECT/INSERT/UPDATE/DELETE grants to anon/authenticated.
-- Future independent manager review APIs must receive separately audited permissions.
revoke all on public.psi_tenant_risk_cycles,
 public.psi_worker_risk_submissions,public.psi_worker_risk_receipt_events
 from public,anon,authenticated,service_role;

-- Shared active-session gate for BOTH worker submission and manager review.
-- Staging order: submission → manager_review → resubmission.
-- L06 staged session revocation gate. auth.uid() alone is insufficient
-- after JWT issue when the underlying session has been revoked.
-- Scope is read within SECURITY DEFINER RPC and both the auth session and
-- manager account rows are SHARE-locked until the transaction finishes.
-- This closes a gap where an otherwise-valid session remains stored after
-- the account has been banned or soft-deleted. Even if a session row remains,
-- a missing/expired/future-issued JWT must not authorize a new database read
-- or receipt. Supabase's signed JWT verification at its gateway is still
-- mandatory; these DB checks are defense in depth, not signature verification.
create function public.psi_l06_require_active_session() returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid;
 v_claim text;
 v_claims jsonb;
 v_session uuid;
 v_exists boolean;
 v_exp numeric;
 v_iat numeric;
 v_now_epoch numeric;
begin
 v_actor := auth.uid();
 v_claims := auth.jwt();
 v_claim := v_claims->>'session_id';
 if v_actor is null or v_claim is null
    or v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(v_claims->'exp') is distinct from 'number'
    or pg_catalog.jsonb_typeof(v_claims->'iat') is distinct from 'number' then
   raise exception 'L06 active auth session required' using errcode='42501';
 end if;
 -- Supabase's required exp/iat JWT fields are numeric Unix seconds.
 -- Trust the database clock, never a client-provided time.
 v_exp := (v_claims->>'exp')::numeric;
 v_iat := (v_claims->>'iat')::numeric;
 v_now_epoch := pg_catalog.extract(epoch from pg_catalog.clock_timestamp());
 if v_exp <= v_now_epoch or v_iat > v_now_epoch or v_iat >= v_exp then
   raise exception 'L06 JWT lifetime invalid' using errcode='42501';
 end if;
 v_session := v_claim::uuid;
 select true into v_exists
 from auth.sessions sess
 join auth.users u on u.id=sess.user_id
 where sess.id=v_session and sess.user_id=v_actor
   and u.deleted_at is null
   and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
 for share of sess,u;
 if not found or v_exists is distinct from true then
   raise exception 'L06 active auth session required' using errcode='42501';
 end if;
 return v_actor;
end;
$$;
revoke all on function public.psi_l06_require_active_session() from public,anon,authenticated,service_role;

-- Security-definer is strictly an isolated PROPOSAL. The caller needs a
-- Supabase-verified, authenticated session; never trust raw browser user IDs.
-- No dynamic SQL, no user_metadata, no service-role client or arbitrary field update.
create function public.psi_submit_worker_risk_l06(
  p_tenant uuid,p_site uuid,p_cycle uuid,p_request uuid,
  p_form_version text,p_source_language text,p_answers jsonb,
  p_grade text,p_grade_reason text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
 v_user uuid;
 v_worker uuid;
 v_row public.psi_worker_risk_submissions;
 v_inserted boolean := false;
 v_now timestamptz;
 v_key text;
begin
 v_user := public.psi_l06_require_active_session();
 v_now := pg_catalog.clock_timestamp();
 if v_user is null or p_tenant is null or p_site is null
    or p_cycle is null or p_request is null then
   raise exception 'L06 identity or scope required' using errcode = '42501';
 end if;
 if p_form_version is distinct from 'psi-form-master-2026-11-22-v2-legacy-compatible'
    or p_source_language is null
    or p_source_language not in ('ko','vi','zh','th','km','uz','id','mn','ru','my','kk','bn')
    or p_grade is null or p_grade not in ('상','중','하')
    or p_grade_reason is null or length(p_grade_reason)>500
    or p_answers is null or jsonb_typeof(p_answers)<>'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(p_answers))<>5
 then
    raise exception 'L06 invalid submission' using errcode='23514';
 end if;
 foreach v_key in array array['Q1','Q2','Q3','Q4','Q5'] loop
   if pg_catalog.jsonb_typeof(p_answers->v_key) is distinct from 'string'
      or length(p_answers->>v_key)>500
      or (v_key='Q3' and length(pg_catalog.btrim(p_answers->>v_key))<1)
      or (v_key<>'Q3' and length(pg_catalog.btrim(p_answers->>v_key))<2)
   then
     raise exception 'L06 incomplete five-question entry' using errcode='23514';
   end if;
 end loop;
 if p_answers->>'Q3' <> p_grade then
   raise exception 'L06 self-assessed grade mismatch' using errcode='23514';
 end if;
 if exists(select 1 from pg_catalog.jsonb_object_keys(p_answers) k
           where k not in ('Q1','Q2','Q3','Q4','Q5')) then
   raise exception 'L06 unknown field' using errcode='23514';
 end if;

 -- Account binding derives worker_id exclusively from authenticated principal.
 -- An unconfirmed, banned, deleted, inactive or relinked account cannot submit.
 select a.worker_id into v_worker
 from public.psi_tenant_worker_accounts a
 join public.psi_tenant_workers w on w.tenant_id=a.tenant_id and w.id=a.worker_id
 join auth.users u on u.id=a.user_id
 where a.tenant_id=p_tenant and a.user_id=v_user and a.active=true and w.active=true
   and u.email_confirmed_at is not null and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<=v_now)
   and pg_catalog.lower(u.email)=a.email
 for share of a,w,u;
 if not found then
   raise exception 'L06 worker not authorized' using errcode='42501';
 end if;

 perform 1 from public.psi_tenant_site_worker_assignments a
 join public.psi_tenant_sites s on s.tenant_id=a.tenant_id and s.id=a.site_id
 where a.tenant_id=p_tenant and a.site_id=p_site and a.worker_id=v_worker
   and a.active=true and s.active=true
 for share of a,s;
 if not found then raise exception 'L06 site not authorized' using errcode='42501'; end if;

 perform 1 from public.psi_tenant_risk_cycles c
 where c.tenant_id=p_tenant and c.site_id=p_site and c.id=p_cycle
   and c.status='open' and c.opens_at<=v_now and c.closes_at>v_now
 for share of c;
 if not found then raise exception 'L06 assessment cycle unavailable' using errcode='42501'; end if;

 insert into public.psi_worker_risk_submissions(
   tenant_id,site_id,cycle_id,worker_id,account_user_id,request_id,
   form_version,source_language,answers,self_risk_grade,grade_reason
 ) values (
   p_tenant,p_site,p_cycle,v_worker,v_user,p_request,
   p_form_version,p_source_language,p_answers,p_grade,p_grade_reason
 )
 on conflict (tenant_id,worker_id,request_id) do nothing
 returning * into v_row;
 v_inserted := found;
 if not v_inserted then
   select * into v_row from public.psi_worker_risk_submissions s
   where s.tenant_id=p_tenant and s.worker_id=v_worker and s.request_id=p_request;
   if not found or v_row.site_id<>p_site or v_row.cycle_id<>p_cycle
     or v_row.account_user_id<>v_user or v_row.form_version<>p_form_version
     or v_row.source_language<>p_source_language
     or v_row.answers<>p_answers or v_row.self_risk_grade<>p_grade
     or v_row.grade_reason<>p_grade_reason then
      raise exception 'L06 request replay changed' using errcode='23505';
   end if;
 else
   insert into public.psi_worker_risk_receipt_events(
      tenant_id,site_id,submission_id,worker_id,revision,kind,actor_user_id
   ) values(p_tenant,p_site,v_row.id,v_worker,1,'received',v_user);
 end if;

 return pg_catalog.jsonb_build_object(
    'schema','psi-worker-self-risk-receipt-v1',
    'receiptId',v_row.id,'requestId',v_row.request_id,
    'tenantId',v_row.tenant_id,'siteId',v_row.site_id,'workerId',v_row.worker_id,
    'receivedAt',pg_catalog.to_char(v_row.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'state','received-pending-manager-review'
 );
end;
$$;
revoke all on function public.psi_submit_worker_risk_l06(
 uuid,uuid,uuid,uuid,text,text,jsonb,text,text
) from public,anon;
grant execute on function public.psi_submit_worker_risk_l06(
 uuid,uuid,uuid,uuid,text,text,jsonb,text,text
) to authenticated;
commit;
