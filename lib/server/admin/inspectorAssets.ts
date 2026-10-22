import type { OptimizationReceipt } from '../../inspector/types.js';
export function validateOptimization(value:unknown, bytes:Buffer, hash:string):OptimizationReceipt|null {
    if(value===undefined)return null; // legacy imports retain original semantics
    const r=value as OptimizationReceipt;
    const keys=['version','source_kind','source_bytes','source_width','source_height','uploaded_bytes','uploaded_width','uploaded_height','quality','uploaded_asset_sha256','created_at'];
    if(!r || typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==keys.length||Object.keys(r).some(k=>!keys.includes(k))||r.version!=='browser-jpeg-v2'||r.source_kind!=='optimized'||r.uploaded_bytes!==bytes.length||r.uploaded_asset_sha256!==hash||!Number.isFinite(Date.parse(r.created_at))||!Number.isFinite(r.quality)||r.quality<.5||r.quality>.9)throw new Error('INVALID_OPTIMIZATION');
    for(const n of [r.source_bytes,r.source_width,r.source_height,r.uploaded_width,r.uploaded_height])if(!Number.isSafeInteger(n)||n<1||n>40*1024*1024)throw new Error('INVALID_OPTIMIZATION');
    if(Math.max(r.uploaded_width,r.uploaded_height)>3072 || r.uploaded_width>r.source_width || r.uploaded_height>r.source_height)throw new Error('INVALID_OPTIMIZATION');
    // Verify actual JPEG SOF dimensions, not only client assertions; reject metadata-bearing output.
    let dimensions=false;
    for(let i=2;i+3<bytes.length;){if(bytes[i]!==255)break;const marker=bytes[i+1];if(marker===0xda||marker===0xd9)break;const length=bytes.readUInt16BE(i+2);if(length<2||i+2+length>bytes.length)break;if(marker>=0xe1&&marker<=0xef && !(marker===0xe2 && bytes.toString('ascii',i+4,i+16)==='ICC_PROFILE\u0000'))throw new Error('INVALID_OPTIMIZATION');if([0xc0,0xc1,0xc2].includes(marker)&&length>=7){dimensions=bytes.readUInt16BE(i+5)===r.uploaded_height&&bytes.readUInt16BE(i+7)===r.uploaded_width;}i+=length+2;}
    if(bytes[0]!==255||bytes[1]!==216||!dimensions)throw new Error('INVALID_OPTIMIZATION');
    return r;
}
/** Read only, including after the inspection row has been purged. Never infer completion from a failed lookup. */
export async function inspectionDeletionStatus(db:any,id:string){
    const control=await db.from('psi_inspector_controls').select('state,deletion_mode,verify_after,receipt,changed_at').eq('inspection_id',id).maybeSingle();
    if(control.error)throw new Error('삭제 상태를 확인하지 못했습니다.');
    const tables=['inspections','evidence','reports','events','operations'];
    const counts=await Promise.all(tables.map(async name=>{const q=db.from(`psi_inspector_${name}`).select('*',{count:'exact',head:true}).eq(name==='inspections'?'id':'inspection_id',id);const r=await q;if(r.error||!Number.isSafeInteger(r.count))throw new Error('남은 기록을 확인하지 못했습니다.');return r.count as number;}));
    const pending=await db.from('psi_inspector_operations').select('started_at,kind',{count:'exact'}).eq('inspection_id',id).eq('finished',false).order('started_at').limit(1);
    if(pending.error||!Number.isSafeInteger(pending.count))throw new Error('진행 중 작업을 확인하지 못했습니다.');
    const bucket=db.storage.from('psi-inspector-evidence'),root=await bucket.list(id,{limit:1000});
    if(root.error||root.data?.length===1000)throw new Error('남은 사진을 확인하지 못했습니다.');
    let files=0,bytes=0;
    const add=(file:any)=>{const n=Number(file.metadata?.size);if(!file.id||!Number.isSafeInteger(n)||n<0)throw new Error('사진 경로·용량을 확인하지 못했습니다.');files++;bytes+=n;};
    for(const f of root.data||[]){if(f.id){add(f);continue;}const child=await bucket.list(`${id}/${f.name}`,{limit:1000});if(child.error||child.data?.length===1000)throw new Error('남은 사진 하위 경로를 확인하지 못했습니다.');for(const c of child.data||[])add(c);}
    const remaining=Object.fromEntries(tables.map((name,n)=>[name,counts[n]])) as Record<string,number>;
    const c=control.data,state=c?.state||'active',mode=c?.deletion_mode||null;
    const verified=files===0&&remaining.operations===0&&pending.count===0&&(state==='files-deleted'||(state==='purged'&&counts.every(n=>n===0)));
    return {state,mode,verifyAfter:c?.verify_after||null,receipt:c?.receipt||null,remainingFiles:files,remainingBytes:bytes,remainingRecords:remaining,pendingOperations:pending.count,oldestPendingAt:pending.data?.[0]?.started_at||null,verified,checkedAt:new Date().toISOString()};
}
export async function purgeInspection(db:any,id:string,mode:'files'|'all',revision:number){
    const begun=await db.rpc('psi_inspector_begin_delete',{p_id:id,p_mode:mode,p_revision:revision});if(begun.error)throw new Error('삭제 범위나 최신 버전을 다시 확인해 주세요.');
    const job=begun.data;
    if(job.state==='purged'||job.state==='files-deleted')return job.receipt;
    if(job.verify_after && Date.parse(job.verify_after)>Date.now())throw new Error('기존 사진 링크 검증이 미완료입니다. 약 2분 후 삭제를 다시 실행해 주세요.');
    const pending=await db.from('psi_inspector_operations').select('operation_id').eq('inspection_id',id).eq('finished',false);if(pending.error)throw new Error('진행 중 작업을 확인하지 못했습니다.');
    if(pending.data?.length)throw new Error('진행 중 업로드·분석이 있습니다. 종료 후 삭제를 다시 실행해 주세요. 기록은 삭제 대기 상태로 보호됩니다.');
    // Every first deletion fences writes and waits out ALL previously issued 120-second URLs,
    // even when a fresh probe is uncached or an earlier attempt already removed the objects.
    const firstPass=!job.verify_after;
    if(firstPass){const wait=await db.rpc('psi_inspector_defer_delete',{p_id:id});if(wait.error)throw new Error('사진 링크 만료 대기를 설정하지 못했습니다. 다시 실행해 주세요.');}
    const bucket=db.storage.from('psi-inspector-evidence');
    const paths:string[]=[];const sizes=new Map<string,number>();
    // Upload paths are always inspection/photo/hash. Include orphaned/retried bytes.
    const folders=await bucket.list(id,{limit:1000});if(folders.error)throw new Error('사진 목록 확인 실패: 삭제가 완료되지 않았습니다.');
    for(const folder of folders.data||[]){if(folder.id){const path=`${id}/${folder.name}`;paths.push(path);sizes.set(path,Number(folder.metadata?.size));continue;}const files=await bucket.list(`${id}/${folder.name}`,{limit:1000});if(files.error)throw new Error('하위 사진 확인 실패: 삭제가 완료되지 않았습니다.');if(files.data?.length===1000)throw new Error('삭제 대상이 너무 많습니다. 관리자 확인이 필요합니다.');for(const file of files.data||[]){const path=`${id}/${folder.name}/${file.name}`;paths.push(path);sizes.set(path,Number(file.metadata?.size));}}
    if(folders.data?.length===1000)throw new Error('삭제 대상이 너무 많습니다. 관리자 확인이 필요합니다.');
    let bytes=0;let signedReadChecks=0;
    for(const path of paths){const size=sizes.get(path);if(!Number.isSafeInteger(size)||size! < 0)throw new Error('파일 용량 확인 실패: 삭제가 완료되지 않았습니다.');bytes+=size!;const signed=await bucket.createSignedUrl(path,120);if(signed.error||!signed.data?.signedUrl)throw new Error('삭제 전 접근 검증 준비 실패: 완료되지 않았습니다.');const removed=await bucket.remove([path]);if(removed.error)throw new Error('일부 사진 삭제 실패: 다시 실행해 남은 사진을 처리해 주세요.');const read=await bucket.download(path);if(!read.error || !(/not found|does not exist|NoSuchKey/i.test(read.error.message||'') || String(read.error.statusCode||read.error.status)==='404'))throw new Error('삭제 후 사진 부재를 확인하지 못했습니다. 완료되지 않았습니다.');let oldRead:Response;try{oldRead=await fetch(signed.data.signedUrl,{cache:'no-store',signal:AbortSignal.timeout(5000)});}catch{await db.rpc('psi_inspector_defer_delete',{p_id:id});throw new Error('기존 사진 링크 검증 중 연결이 끊겼습니다. 약 2분 후 다시 실행해 주세요.');}await oldRead.body?.cancel();if(![400,404,410].includes(oldRead.status)){await db.rpc('psi_inspector_defer_delete',{p_id:id});throw new Error('기존 사진 링크의 접근 차단을 확인하지 못했습니다. 약 2분 후 다시 검증해 주세요.');}signedReadChecks++;}
    const remaining=await bucket.list(id,{limit:1000});if(remaining.error || remaining.data?.some((f:any)=>f.id))throw new Error('삭제 후 목록을 확인하지 못했습니다.');
    for(const f of remaining.data||[]){const check=await bucket.list(`${id}/${f.name}`,{limit:1});if(check.error||check.data?.length)throw new Error('삭제 후 하위 경로에 파일이 남아 있습니다.');}
    if(firstPass)throw new Error('사진 파일 제거를 확인했습니다. 기존 사진 링크가 만료되는 약 2분 후 기록 정리를 마무리해 주세요.');
    const receipt={jobId:job.job_id,mode,deletedFiles:paths.length,deletedBytes:bytes,verifiedAt:new Date().toISOString(),managedResidualFiles:0,countScope:'final-attempt-only',signedReadChecks,priorSignedLinkExpiryWaited:!!job.verify_after,scope:'PSI 관리 경로 및 선택한 기록. 외부 ChatGPT·기기 원본·PDF·클립보드 제외'};
    const done=await db.rpc('psi_inspector_complete_delete',{p_id:id,p_receipt:receipt});if(done.error)throw new Error('파일 제거 후 기록 정리가 완료되지 않았습니다. 삭제를 다시 실행해 주세요.');return receipt;
}
