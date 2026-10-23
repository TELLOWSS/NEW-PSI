import {serializeSnapshot} from '../../inspector/snapshot.js';
import {createHash,createHmac} from 'node:crypto';
import {UUID} from '../../inspector/validation.js';
import type {Inspection} from '../../inspector/types.js';
export const shareHash=(t:string)=>createHash('sha256').update(t).digest('hex');
export function inspectorShareToken(id:string){const secret=process.env.ADMIN_SESSION_SECRET;if(!secret||!UUID.test(id))throw new Error('공유 설정을 확인해 주세요.');return createHmac('sha256',secret).update('psi-inspector-share-v1:'+id).digest('base64url');}
const check=(e:any)=>{if(e)throw new Error('공유 요청을 처리하지 못했습니다. 버전·조치 변경·사진 보관 상태 또는 공유 횟수를 확인해 주세요.');};
export async function inspectorShareAdmin(db:any,current:Inspection,b:any){
 const ops:Record<string,string[]>={'share-create':['actionId','photoId','shareId','expectedRevision','hours'],'share-list':[],'share-revoke':['shareId'],'share-adopt':['shareId','expectedRevision','confirmed']};
 if(!ops[b.op]||Object.keys(b).some(k=>!['op','id',...ops[b.op]].includes(k)))throw new Error('지원하지 않는 공유 입력입니다.');
 if(b.op==='share-list'){
  const r=await db.from('psi_inspector_shares').select('*').eq('inspection_id',current.id).order('created_at',{ascending:false}).limit(30);check(r.error);
  return {shares:(r.data||[]).map(({token_hash,action_snapshot,...s}:any)=>{const token=inspectorShareToken(s.id);return {...s,...(!s.revoked_at&&!s.adopted_at&&Date.parse(s.expires_at)>Date.now()&&shareHash(token)===token_hash&&current.document.actions.some(a=>serializeSnapshot(a)===serializeSnapshot(action_snapshot))?{token}:{})};})};
 }
 if(typeof b.shareId!=='string'||!UUID.test(b.shareId))throw new Error('공유 번호를 확인해 주세요.');
 if(b.op==='share-create'){
  if(!UUID.test(b.actionId)||!UUID.test(b.photoId)||!Number.isInteger(b.expectedRevision)||!Number.isInteger(b.hours)||b.hours<1||b.hours>72)throw new Error('공유 범위·만료 시간을 확인해 주세요.');
  const token=inspectorShareToken(b.shareId),r=await db.rpc('psi_inspector_share_create',{p_id:current.id,p_share:b.shareId,p_action:b.actionId,p_photo:b.photoId,p_hash:shareHash(token),p_revision:b.expectedRevision,p_hours:b.hours});check(r.error);return {share:{...r.data,token}};
 }
 if(b.op==='share-revoke'){const r=await db.from('psi_inspector_shares').update({revoked_at:new Date().toISOString()}).eq('id',b.shareId).eq('inspection_id',current.id).select('id').maybeSingle();check(r.error);if(!r.data)throw new Error('공유 기록을 찾지 못했습니다.');return {revoked:true};}
 if(!Number.isInteger(b.expectedRevision)||b.confirmed!==true)throw new Error('전후 사진과 적용 범위를 확인해 주세요.');
 const r=await db.rpc('psi_inspector_share_adopt',{p_id:current.id,p_share:b.shareId,p_revision:b.expectedRevision});check(r.error);
 const e=await db.from('psi_inspector_evidence').select('id,inspection_id,sha256,mime_type,byte_size,created_at,optimization_receipt').eq('inspection_id',current.id).order('created_at');check(e.error);return {item:r.data,evidence:e.data||[]};
}
