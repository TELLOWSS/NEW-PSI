-- Rollback-only contract test, generated synthetic IDs, no physical file or existing record changes.
begin;
set local statement_timeout='5s';
set local lock_timeout='1s';
do $$
declare i uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); h text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''); d jsonb; v jsonb; path text;
begin
 d:=jsonb_build_object('title','합성 공유 검증 · 실제 점검 아님','photoIds',jsonb_build_array(p),'actions',jsonb_build_array(jsonb_build_object('id',a,'title','합성 조치 확인','owner','합성 담당','dueDate','2026-10-30','status','open','completionPhotoId','','note','합성','sourcePhotoIds',jsonb_build_array(p))));
 insert into public.psi_inspector_inspections(id,document) values(i,d);
 insert into public.psi_inspector_evidence(id,inspection_id,sha256,mime_type,byte_size,storage_key) values(p,i,repeat('a',64),'image/jpeg',10,i::text||'/'||p::text||'/synthetic-not-a-file');
 v:=public.psi_inspector_share_create(i,s,a,p,h,1,24);
 if v ? 'token_hash' or v ? 'action_snapshot' or v->'snapshot'->>'title'<>'합성 조치 확인' then raise exception 'Snapshot scope';end if;
 perform public.psi_inspector_share_reply(h,r,'planned','합성 담당','실제 현장이 아닌 검증용 회신');
 perform public.psi_inspector_share_reply(h,r,'planned','합성 담당','실제 현장이 아닌 검증용 회신');
 if (select jsonb_array_length(responses) from public.psi_inspector_shares where id=s)<>1 then raise exception 'Duplicate reply';end if;
 if (select revision from public.psi_inspector_inspections where id=i)<>1 then raise exception 'Public auto approval';end if;
 update public.psi_inspector_shares set expires_at=clock_timestamp()-interval '1 second' where id=s;
 begin perform public.psi_inspector_share_active(h);raise exception 'Expected expiry';exception when others then if sqlerrm='Expected expiry' then raise;end if;end;
 update public.psi_inspector_shares set expires_at=clock_timestamp()+interval '1 hour',revoked_at=clock_timestamp() where id=s;
 begin perform public.psi_inspector_share_active(h);raise exception 'Expected revoked';exception when others then if sqlerrm='Expected revoked' then raise;end if;end;
 update public.psi_inspector_shares set revoked_at=null where id=s;
 update public.psi_inspector_inspections set document=jsonb_set(document,'{actions,0,owner}','"변경된 합성 담당"') where id=i;
 begin perform public.psi_inspector_share_active(h);raise exception 'Expected changed';exception when others then if sqlerrm='Expected changed' then raise;end if;end;
 -- Restore the same action baseline (revision 3), then simulate a stored synthetic upload's metadata inside this rollback.
 update public.psi_inspector_inspections set document=d where id=i;
 r:=gen_random_uuid();
 if not public.psi_inspector_share_reserve(h,r,f,10) then raise exception 'Reservation rejected';end if;
 path:=i::text||'/'||f::text||'/'||repeat('c',64)||'.jpg';
 insert into storage.objects(bucket_id,name,metadata) values('psi-inspector-evidence',path,'{"size":10,"mimetype":"image/jpeg"}');
 perform public.psi_inspector_share_reply(h,r,'photo','합성 담당','개선 상태를 확인하는 합성 회신',f,repeat('c',64),10,'{}');
 perform public.psi_inspector_finish('share-upload:'||s::text||':'||r::text||':'||f::text);
 if (select revision from public.psi_inspector_inspections where id=i)<>3 then raise exception 'Public photo changed document';end if;
 v:=public.psi_inspector_share_adopt(i,s,3);
 if v->'document'->'actions'->0->>'status'<>'review-requested' or v->'document'->'actions'->0 ? 'verifiedAt' then raise exception 'Automatic completion';end if;
 if v->'document'->'actions'->0->>'completionPhotoId'<>f::text then raise exception 'Wrong improvement photo';end if;
 perform public.psi_inspector_share_adopt(i,s,3);
 if (select revision from public.psi_inspector_inspections where id=i)<>4 then raise exception 'Repeated adoption';end if;
 delete from storage.objects where bucket_id='psi-inspector-evidence' and name=path;
 delete from public.psi_inspector_evidence where inspection_id=i;
 delete from public.psi_inspector_events where inspection_id=i;
 delete from public.psi_inspector_operations where inspection_id=i;
 delete from public.psi_inspector_inspections where id=i;
 if exists(select 1 from public.psi_inspector_shares where id=s) then raise exception 'Sharing records survived deletion';end if;
end;$$;
rollback;
select 'PASS: snapshot scope, reply replay, expiry, revoke, action change, reservation, photo receipt, explicit adoption, no auto completion, retry and cascade deletion; all generated metadata rolled back' as result;
