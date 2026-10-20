begin;
alter table public.psi_inspector_evidence add column optimization_receipt jsonb;
create table public.psi_inspector_controls (
 inspection_id uuid primary key, state text not null default 'active' check(state in ('active','deleting','files-deleted','purged')),
 verify_after timestamptz, deletion_mode text check(deletion_mode in ('files','all')), job_id uuid, receipt jsonb, changed_at timestamptz not null default clock_timestamp()
);
create table public.psi_inspector_operations (
 operation_id text primary key, inspection_id uuid not null, kind text not null check(kind in ('upload','analysis')),
 reserved_bytes bigint not null default 0, started_at timestamptz not null default clock_timestamp(), finished boolean not null default false
);
create index psi_inspector_operations_parent_idx on public.psi_inspector_operations(inspection_id,kind);
alter table public.psi_inspector_controls enable row level security;
alter table public.psi_inspector_controls force row level security;
alter table public.psi_inspector_operations enable row level security;
alter table public.psi_inspector_operations force row level security;
revoke all on public.psi_inspector_controls,public.psi_inspector_operations from public,anon,authenticated,service_role;
grant select on public.psi_inspector_controls,public.psi_inspector_operations to service_role;

create function public.psi_inspector_reserve(p_id uuid,p_operation text,p_kind text,p_bytes bigint default 0) returns boolean
language plpgsql security definer set search_path='' as $$
declare used_bytes bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(20261020);
 if p_kind not in ('upload','analysis') or p_bytes<0 or p_bytes>3145728 then raise exception 'Invalid operation';end if;
 if exists(select 1 from public.psi_inspector_controls where inspection_id=p_id and state<>'active') then return false;end if;
 if not exists(select 1 from public.psi_inspector_inspections where id=p_id) then return false;end if;
 if exists(select 1 from public.psi_inspector_operations where operation_id=p_operation) then
 if p_kind='upload' and exists(select 1 from public.psi_inspector_operations where operation_id=p_operation and inspection_id=p_id and kind='upload' and finished) then delete from public.psi_inspector_operations where operation_id=p_operation;else return false;end if;end if;
 if p_kind='analysis' and ((select count(*) from public.psi_inspector_operations where inspection_id=p_id and kind='analysis')>=20
   or coalesce((select (document->>'apiEnabled')::boolean from public.psi_inspector_inspections where id=p_id),false)=false) then return false;end if;
 if p_kind='upload' then
   if (select count(*) from public.psi_inspector_evidence where inspection_id=p_id)+(select count(*) from public.psi_inspector_operations where inspection_id=p_id and kind='upload' and not finished)>=20 then return false;end if;
   select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) into used_bytes from storage.objects;
   used_bytes:=used_bytes+coalesce((select sum(reserved_bytes) from public.psi_inspector_operations where kind='upload' and not finished),0);
   if used_bytes+p_bytes>900000000 then return false;end if;
 end if;
 insert into public.psi_inspector_operations(operation_id,inspection_id,kind,reserved_bytes) values(p_operation,p_id,p_kind,p_bytes);
 return true;
end;$$;
create function public.psi_inspector_finish(p_operation text) returns void
language sql security definer set search_path='' as $$update public.psi_inspector_operations set finished=true where operation_id=p_operation;$$;
create function public.psi_inspector_usage() returns jsonb
language sql security definer set search_path='' as $$select pg_catalog.jsonb_build_object('projectBytes',coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0),'uploadCeilingBytes',900000000,'scope','project-storage','monthlyEgressKnown',false,'databaseBytes',pg_catalog.pg_database_size(pg_catalog.current_database())) from storage.objects;$$;
create function public.psi_inspector_begin_delete(p_id uuid,p_mode text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.psi_inspector_controls; r integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(20261020);
 if p_mode not in ('files','all') then raise exception 'Invalid deletion mode';end if;
 select * into c from public.psi_inspector_controls where inspection_id=p_id;
 if c.state in ('deleting','purged') or (c.state='files-deleted' and p_mode='files') then
   if c.deletion_mode<>p_mode then raise exception 'Deletion mode conflict';end if;
   return pg_catalog.to_jsonb(c);
 end if;
 select revision into r from public.psi_inspector_inspections where id=p_id for update;
 if r is null or r<>p_revision then raise exception 'Revision conflict';end if;
 insert into public.psi_inspector_controls(inspection_id,state,deletion_mode,job_id) values(p_id,'deleting',p_mode,gen_random_uuid())
 on conflict(inspection_id) do update set state='deleting',deletion_mode=p_mode,job_id=gen_random_uuid(),changed_at=clock_timestamp() returning * into c;
 return pg_catalog.to_jsonb(c);
end;$$;
create function public.psi_inspector_defer_delete(p_id uuid) returns void
language sql security definer set search_path='' as $$update public.psi_inspector_controls set verify_after=clock_timestamp()+interval '125 seconds' where inspection_id=p_id and state='deleting';$$;
create function public.psi_inspector_complete_delete(p_id uuid,p_receipt jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.psi_inspector_controls;
begin
 perform pg_catalog.pg_advisory_xact_lock(20261020);
 select * into c from public.psi_inspector_controls where inspection_id=p_id for update;
 if c.state<>'deleting' then raise exception 'Deletion not started';end if;
 if c.verify_after>clock_timestamp() then raise exception 'Signed read verification pending';end if;
 -- Unfinished uploads/AI must finish. No timeout-based assumption of success.
 if exists(select 1 from public.psi_inspector_operations where inspection_id=p_id and not finished) then raise exception 'Operations still pending';end if;
 if exists(select 1 from storage.objects where bucket_id='psi-inspector-evidence' and name like p_id::text||'/%') then raise exception 'Objects remain';end if;
 if c.deletion_mode='all' then
   delete from public.psi_inspector_reports where inspection_id=p_id;
   delete from public.psi_inspector_evidence where inspection_id=p_id;
   delete from public.psi_inspector_events where inspection_id=p_id;
   delete from public.psi_inspector_inspections where id=p_id;
 end if;
 delete from public.psi_inspector_operations where inspection_id=p_id;
 update public.psi_inspector_controls set state=case when deletion_mode='all' then 'purged' else 'files-deleted' end,receipt=p_receipt,changed_at=clock_timestamp() where inspection_id=p_id;
end;$$;
create function psi_inspector_private.fence_writes() returns trigger language plpgsql security definer set search_path='' as $$
declare parent_id uuid;
begin
 if tg_table_name='psi_inspector_inspections' then parent_id:=new.id;else parent_id:=new.inspection_id;end if;
 if exists(select 1 from public.psi_inspector_controls where inspection_id=parent_id and state<>'active') then raise exception 'Inspection deletion fence';end if;
 return new;
end;$$;
create trigger inspector_fence_inspection before insert or update on public.psi_inspector_inspections for each row execute function psi_inspector_private.fence_writes();
create trigger inspector_fence_evidence before insert on public.psi_inspector_evidence for each row execute function psi_inspector_private.fence_writes();
create trigger inspector_fence_report before insert on public.psi_inspector_reports for each row execute function psi_inspector_private.fence_writes();
revoke all on function psi_inspector_private.fence_writes() from public,anon,authenticated,service_role;
revoke all on function public.psi_inspector_reserve(uuid,text,text,bigint),public.psi_inspector_finish(text),public.psi_inspector_usage(),public.psi_inspector_begin_delete(uuid,text,integer),public.psi_inspector_complete_delete(uuid,jsonb),public.psi_inspector_defer_delete(uuid) from public,anon,authenticated;
grant execute on function public.psi_inspector_reserve(uuid,text,text,bigint),public.psi_inspector_finish(text),public.psi_inspector_usage(),public.psi_inspector_begin_delete(uuid,text,integer),public.psi_inspector_complete_delete(uuid,jsonb),public.psi_inspector_defer_delete(uuid) to service_role;
notify pgrst,'reload schema';
commit;
