begin;
-- Dedicated installation: no browser table/RPC authority and no copies of original photos.
create table public.psi_inspector_shares (
 id uuid primary key, inspection_id uuid not null references public.psi_inspector_inspections(id) on delete cascade,
 action_id uuid not null, photo_id uuid not null, token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
 creation_revision integer not null, action_snapshot jsonb not null, snapshot jsonb not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 revoked_at timestamptz, responses jsonb not null default '[]'::jsonb check(jsonb_typeof(responses)='array' and jsonb_array_length(responses)<=3),
 adopted_photo_id uuid, adopted_at timestamptz
);
create index psi_inspector_shares_parent_idx on public.psi_inspector_shares(inspection_id,created_at desc);
alter table public.psi_inspector_shares enable row level security;
alter table public.psi_inspector_shares force row level security;
revoke all on public.psi_inspector_shares from public,anon,authenticated,service_role;
grant select,insert,update on public.psi_inspector_shares to service_role;

create function public.psi_inspector_share_active(p_hash text) returns public.psi_inspector_shares
language plpgsql security invoker set search_path='' as $$
declare s public.psi_inspector_shares; d jsonb;
begin
 select * into s from public.psi_inspector_shares where token_hash=p_hash;
 if s.id is null or s.revoked_at is not null or s.expires_at<=clock_timestamp() or s.adopted_at is not null then raise exception 'SHARE_UNAVAILABLE';end if;
 if exists(select 1 from public.psi_inspector_controls where inspection_id=s.inspection_id and state<>'active') then raise exception 'SHARE_UNAVAILABLE';end if;
 select document into d from public.psi_inspector_inspections where id=s.inspection_id;
 if d is null or not exists(select 1 from jsonb_array_elements(d->'actions') a where a=s.action_snapshot) then raise exception 'SHARE_CHANGED';end if;
 if not exists(select 1 from public.psi_inspector_evidence where inspection_id=s.inspection_id and id=s.photo_id and sha256=s.snapshot->>'photoSha256') then raise exception 'SHARE_UNAVAILABLE';end if;
 return s;
end;$$;

create function public.psi_inspector_share_create(p_id uuid,p_share uuid,p_action uuid,p_photo uuid,p_hash text,p_revision integer,p_hours integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d jsonb; r integer; a jsonb; e public.psi_inspector_evidence; s public.psi_inspector_shares;
begin
 perform pg_advisory_xact_lock(20261020);
 if p_hash!~'^[a-f0-9]{64}$' or p_hours not between 1 and 72 then raise exception 'INVALID_SHARE';end if;
 if exists(select 1 from public.psi_inspector_controls where inspection_id=p_id and state<>'active') then raise exception 'SHARE_UNAVAILABLE';end if;
 select * into s from public.psi_inspector_shares where id=p_share;
 if s.id is not null then
  if s.inspection_id<>p_id or s.action_id<>p_action or s.photo_id<>p_photo or s.token_hash<>p_hash or s.creation_revision<>p_revision then raise exception 'SHARE_CONFLICT';end if;
  return to_jsonb(s)-'token_hash'-'action_snapshot';
 end if;
 select document,revision into d,r from public.psi_inspector_inspections where id=p_id for update;
 if r is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;
 select value into a from jsonb_array_elements(d->'actions') where value->>'id'=p_action::text;
 if a is null or a->>'status'<>'open' or not (coalesce(a->'sourcePhotoIds','[]'::jsonb)?p_photo::text) then raise exception 'ACTION_SCOPE';end if;
 if not (coalesce(d->'photoIds','[]'::jsonb)?p_photo::text) then raise exception 'ACTION_SCOPE';end if;
 select * into e from public.psi_inspector_evidence where inspection_id=p_id and id=p_photo;
 if e.id is null then raise exception 'PHOTO_MISSING';end if;
 if (select count(*) from public.psi_inspector_shares where inspection_id=p_id)>=30 then raise exception 'SHARE_LIMIT';end if;
 insert into public.psi_inspector_shares(id,inspection_id,action_id,photo_id,token_hash,creation_revision,action_snapshot,snapshot,expires_at)
 values(p_share,p_id,p_action,p_photo,p_hash,p_revision,a,jsonb_build_object('title',a->>'title','owner',a->>'owner','dueDate',a->>'dueDate','photoSha256',e.sha256,'photoNumber',(select ordinality from jsonb_array_elements_text(d->'photoIds') with ordinality where value=p_photo::text)),clock_timestamp()+make_interval(hours=>p_hours)) returning * into s;
 return to_jsonb(s)-'token_hash'-'action_snapshot';
end;$$;

create function public.psi_inspector_share_reserve(p_hash text,p_request uuid,p_photo uuid,p_bytes integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare s public.psi_inspector_shares; op text;
begin
 perform pg_advisory_xact_lock(20261020);s:=public.psi_inspector_share_active(p_hash);
 if p_bytes not between 1 and 1048576 or jsonb_array_length(s.responses)>=3 or exists(select 1 from jsonb_array_elements(s.responses) r where r->>'kind'='photo') then return false;end if;
 op:='share-upload:'||s.id::text||':'||p_request::text||':'||p_photo::text;
 if (select count(*) from public.psi_inspector_operations where inspection_id=s.inspection_id and operation_id like 'share-upload:'||s.id::text||':%')>=2 and not exists(select 1 from public.psi_inspector_operations where operation_id=op) then return false;end if;
 return public.psi_inspector_reserve(s.inspection_id,op,'upload',p_bytes);
end;$$;

create function public.psi_inspector_share_reply(p_hash text,p_request uuid,p_kind text,p_name text,p_note text,p_photo uuid default null,p_sha text default null,p_bytes integer default null,p_receipt jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.psi_inspector_shares; response jsonb; op text;
begin
 perform pg_advisory_xact_lock(20261020);s:=public.psi_inspector_share_active(p_hash);
 select value into response from jsonb_array_elements(s.responses) where value->>'requestId'=p_request::text;
 if response is not null then
  if response->>'kind'<>p_kind or response->>'name'<>p_name or response->>'note'<>p_note or (response->>'photoId') is distinct from p_photo::text or (response->>'sha256') is distinct from p_sha then raise exception 'REPLY_CONFLICT';end if;
  return response;
 end if;
 if p_kind not in ('planned','difficult','photo') or char_length(trim(p_name)) not between 2 and 50 or char_length(trim(p_note)) not between 5 and 1000 then raise exception 'INVALID_REPLY';end if;
 if jsonb_array_length(s.responses)>=3 or exists(select 1 from jsonb_array_elements(s.responses) r where r->>'kind'='photo') then raise exception 'REPLY_LIMIT';end if;
 if p_kind='photo' then
  op:='share-upload:'||s.id::text||':'||p_request::text||':'||p_photo::text;
  if p_photo is null or p_sha!~'^[a-f0-9]{64}$' or p_bytes not between 1 and 1048576 or p_receipt is null then raise exception 'INVALID_PHOTO';end if;
  if not exists(select 1 from public.psi_inspector_operations where operation_id=op and inspection_id=s.inspection_id and not finished and reserved_bytes=p_bytes) then raise exception 'UPLOAD_NOT_RESERVED';end if;
  if not exists(select 1 from storage.objects where bucket_id='psi-inspector-evidence' and name=s.inspection_id::text||'/'||p_photo::text||'/'||p_sha||'.jpg' and (metadata->>'size')::bigint=p_bytes) then raise exception 'PHOTO_MISSING';end if;
  insert into public.psi_inspector_evidence(id,inspection_id,sha256,mime_type,byte_size,storage_key,optimization_receipt)
   values(p_photo,s.inspection_id,p_sha,'image/jpeg',p_bytes,s.inspection_id::text||'/'||p_photo::text||'/'||p_sha||'.jpg',p_receipt);
 elsif p_photo is not null or p_sha is not null or p_bytes is not null or p_receipt is not null then raise exception 'INVALID_PHOTO';end if;
 response:=jsonb_build_object('requestId',p_request,'kind',p_kind,'name',p_name,'note',p_note,'photoId',p_photo,'sha256',p_sha,'submittedAt',clock_timestamp());
 update public.psi_inspector_shares set responses=responses||jsonb_build_array(response) where id=s.id;
 return response;
end;$$;

create function public.psi_inspector_share_adopt(p_id uuid,p_share uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.psi_inspector_shares; d jsonb; r integer; a jsonb; response jsonb; changed jsonb;
begin
 perform pg_advisory_xact_lock(20261020);
 if exists(select 1 from public.psi_inspector_controls where inspection_id=p_id and state<>'active') then raise exception 'SHARE_UNAVAILABLE';end if;
 select * into s from public.psi_inspector_shares where id=p_share and inspection_id=p_id for update;
 if s.id is null then raise exception 'SHARE_UNAVAILABLE';end if;
 select document,revision into d,r from public.psi_inspector_inspections where id=p_id for update;
 select value into a from jsonb_array_elements(d->'actions') where value->>'id'=s.action_id::text;
 if s.adopted_at is not null and a->>'completionPhotoId'=s.adopted_photo_id::text then return (select to_jsonb(i) from public.psi_inspector_inspections i where id=p_id);end if;
 if r is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;
 -- Administrator may review a received response after expiry/revocation, but never substitute a changed action.
 if a is distinct from s.action_snapshot then raise exception 'ACTION_CHANGED';end if;
 select value into response from jsonb_array_elements(s.responses) where value->>'kind'='photo';
 if response is null or not exists(select 1 from public.psi_inspector_evidence where inspection_id=p_id and id=(response->>'photoId')::uuid and sha256=response->>'sha256') then raise exception 'PHOTO_MISSING';end if;
 if jsonb_array_length(d->'photoIds')>=20 then raise exception 'PHOTO_LIMIT';end if;
 changed:=a||jsonb_build_object('status','review-requested','completionPhotoId',response->>'photoId','note','외부 회신 검토 후 반영 · 응답자(본인 입력): '||(response->>'name')||E'\n'||(response->>'note'));
 d:=jsonb_set(d,'{actions}',(select jsonb_agg(case when value->>'id'=s.action_id::text then changed else value end order by ordinality) from jsonb_array_elements(d->'actions') with ordinality));
 d:=jsonb_set(d,'{photoIds}',(d->'photoIds')||jsonb_build_array(response->>'photoId'))-'materialCompletion';
 update public.psi_inspector_inspections set document=d where id=p_id;
 update public.psi_inspector_shares set adopted_at=clock_timestamp(),adopted_photo_id=(response->>'photoId')::uuid where id=s.id;
 return (select to_jsonb(i) from public.psi_inspector_inspections i where id=p_id);
end;$$;

revoke all on function public.psi_inspector_share_active(text),public.psi_inspector_share_create(uuid,uuid,uuid,uuid,text,integer,integer),public.psi_inspector_share_reserve(text,uuid,uuid,integer),public.psi_inspector_share_reply(text,uuid,text,text,text,uuid,text,integer,jsonb),public.psi_inspector_share_adopt(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.psi_inspector_share_active(text),public.psi_inspector_share_create(uuid,uuid,uuid,uuid,text,integer,integer),public.psi_inspector_share_reserve(text,uuid,uuid,integer),public.psi_inspector_share_reply(text,uuid,text,text,text,uuid,text,integer,jsonb),public.psi_inspector_share_adopt(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;


