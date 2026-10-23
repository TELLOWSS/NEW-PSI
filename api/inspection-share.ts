import {createHash} from 'node:crypto';
import {createSupabaseServerClient} from '../lib/server/supabaseServer.js';
import {consumeApiQuota,resolveRequestFingerprint} from '../lib/server/apiSecurity.js';
import {shareHash} from '../lib/server/admin/inspectorShare.js';
import {validateOptimization} from '../lib/server/admin/inspectorAssets.js';
import {UUID} from '../lib/inspector/validation.js';
import {shareTokenFromHash} from '../lib/inspector/actionShare.js';
class Failure extends Error{constructor(public status:number,message:string){super(message);}}
function input(req:any){let b:any;try{const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(!raw||Buffer.byteLength(raw)>1450000)throw 0;b=JSON.parse(raw);}catch{throw new Failure(400,'회신 형식이나 사진 크기를 확인해 주세요.');}if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.token!=='string'||!shareTokenFromHash(b.token)||!['detail','photo','reply'].includes(b.op)||Object.keys(b).some(k=>!['op','token',...(b.op==='reply'?['requestId','kind','name','note','photoId','base64','receipt','consent']:[])].includes(k)))throw new Failure(400,'유효한 공유 링크와 입력을 확인해 주세요.');return b;}
async function active(db:any,hash:string){const r=await db.rpc('psi_inspector_share_active',{p_hash:hash});if(r.error||!r.data)throw new Failure(410,'만료·차단되었거나 요청이 변경된 링크입니다. 새 링크를 요청하세요.');return r.data;}
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,message:'지원하지 않는 요청입니다.'});}
 if(process.env.PSI_DEPLOYMENT_MODEL==='shared-saas')return res.status(403).json({ok:false,message:'이 환경에서는 회신을 사용할 수 없습니다.'});
 try{
  const b=input(req),db=createSupabaseServerClient({includeAdminSecret:false}),hash=shareHash(b.token);
  for(const q of [{scope:'inspector.share.ip',clientKeyHash:resolveRequestFingerprint(req),maxRequests:30,windowSeconds:60},{scope:'inspector.share.global',clientKeyHash:'installation',maxRequests:300,windowSeconds:60},{scope:'inspector.share.'+b.op,clientKeyHash:hash,maxRequests:b.op==='photo'?12:b.op==='reply'?8:30,windowSeconds:b.op==='detail'?60:3600}]){const limit=await consumeApiQuota(db,q);if(!limit.allowed){res.setHeader('Retry-After',String(limit.retryAfterSeconds));throw new Failure(429,'요청이 많습니다. 잠시 후 확인해 주세요.');}}
  const s=await active(db,hash);
  if(b.op==='detail')return res.status(200).json({ok:true,snapshot:s.snapshot,createdAt:s.created_at,expiresAt:s.expires_at,responses:s.responses});
  if(b.op==='photo'){
   const r=await db.from('psi_inspector_evidence').select('storage_key,sha256,mime_type').eq('inspection_id',s.inspection_id).eq('id',s.photo_id).maybeSingle();if(r.error||!r.data||r.data.sha256!==s.snapshot.photoSha256)throw new Failure(410,'사진을 열 수 없습니다.');
   const f=await db.storage.from('psi-inspector-evidence').download(r.data.storage_key);if(f.error||!f.data)throw new Failure(410,'사진을 열 수 없습니다.');const bytes=Buffer.from(await f.data.arrayBuffer());if(bytes.length>3145728||createHash('sha256').update(bytes).digest('hex')!==s.snapshot.photoSha256)throw new Failure(410,'사진 무결성을 확인하지 못했습니다.');await active(db,hash);return res.status(200).json({ok:true,base64:bytes.toString('base64'),mime:r.data.mime_type});
  }
  if(typeof b.requestId!=='string'||!UUID.test(b.requestId)||!['planned','difficult','photo'].includes(b.kind)||typeof b.name!=='string'||b.name.trim().length<2||b.name.length>50||typeof b.note!=='string'||b.note.trim().length<5||b.note.length>1000||[b.name,b.note].some(t=>t.includes('\u0000'))||b.consent!==true)throw new Failure(400,'응답자 2자·설명 5자 이상과 보관 허용을 확인해 주세요.');
  const withPhoto=b.kind==='photo';let bytes:Buffer|undefined,sha:string|undefined,receipt:any;
  if(withPhoto){
   if(typeof b.photoId!=='string'||!UUID.test(b.photoId)||typeof b.base64!=='string'||b.base64.length>1398104||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.base64))throw new Failure(400,'개선사진은 최적화한 1MB 이하 사진이어야 합니다.');
   bytes=Buffer.from(b.base64,'base64');sha=createHash('sha256').update(bytes).digest('hex');try{receipt=validateOptimization(b.receipt,bytes,sha);if(!bytes.length||bytes.length>1048576||!receipt||Math.max(receipt.uploaded_width,receipt.uploaded_height)>1280)throw 0;}catch{throw new Failure(400,'사진 최적화 증빙을 확인하지 못했습니다.');}if(sha===s.snapshot.photoSha256)throw new Failure(400,'원본과 같은 사진입니다. 개선 상태를 촬영해 주세요.');
  }else if(b.photoId!==undefined||b.base64!==undefined||b.receipt!==undefined)throw new Failure(400,'이 회신에는 사진을 첨부하지 않습니다.');
  const params={p_hash:hash,p_request:b.requestId,p_kind:b.kind,p_name:b.name.trim(),p_note:b.note.trim(),p_photo:withPhoto?b.photoId:null,p_sha:sha||null,p_bytes:bytes?.length||null,p_receipt:receipt||null};
  const previous=s.responses.find((r:any)=>r.requestId===b.requestId);if(previous){if(previous.kind!==b.kind||previous.name!==params.p_name||previous.note!==params.p_note||previous.photoId!==params.p_photo||previous.sha256!==params.p_sha)throw new Failure(409,'같은 회신 번호에 다른 내용이 있습니다.');return res.status(200).json({ok:true,response:previous,replayed:true});}
  let operation='';try{
   if(bytes){const r=await db.rpc('psi_inspector_share_reserve',{p_hash:hash,p_request:b.requestId,p_photo:b.photoId,p_bytes:bytes.length});if(r.error||!r.data)throw new Failure(409,'사진 수·업로드 횟수·용량 또는 링크 상태를 확인해 주세요.');operation=`share-upload:${s.id}:${b.requestId}:${b.photoId}`;const bucket=db.storage.from('psi-inspector-evidence'),prefix=`${s.inspection_id}/${b.photoId}`,prior=await bucket.list(prefix,{limit:3});if(prior.error||(prior.data||[]).some((f:any)=>f.name!==sha+'.jpg'))throw new Failure(409,'같은 회신 사진 번호에 다른 사진이 있습니다. 점검자에게 확인해 주세요.');const path=`${prefix}/${sha}.jpg`,f=await bucket.upload(path,bytes,{contentType:'image/jpeg',upsert:false});if(f.error){const old=await db.storage.from('psi-inspector-evidence').download(path);if(old.error||!old.data||createHash('sha256').update(Buffer.from(await old.data.arrayBuffer())).digest('hex')!==sha)throw new Failure(503,'사진 보관을 완료하지 못했습니다. 같은 사진으로 재시도하세요.');}}
   const r=await db.rpc('psi_inspector_share_reply',params);if(r.error)throw new Failure(409,'회신을 확인하지 못했습니다. 같은 내용으로 재시도하거나 점검자에게 확인해 주세요.');return res.status(200).json({ok:true,response:r.data});
  }finally{if(operation){const done=await db.rpc('psi_inspector_finish',{p_operation:operation});if(done.error)console.warn('inspector_share_finish_pending');}}
 }catch(e){return res.status(e instanceof Failure?e.status:503).json({ok:false,message:e instanceof Failure?e.message:'공유 회신을 사용할 수 없습니다. 잠시 후 재시도하세요.'});}
}
