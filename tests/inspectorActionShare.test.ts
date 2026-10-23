import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
const mock=vi.hoisted(()=>({client:vi.fn(),quota:vi.fn()}));
vi.mock('../lib/server/supabaseServer.js',()=>({createSupabaseServerClient:mock.client}));
vi.mock('../lib/server/apiSecurity.js',()=>({consumeApiQuota:mock.quota,resolveRequestFingerprint:()=> 'qa-ip'}));
import handler from '../api/inspection-share';
import {inspectorShareAdmin,inspectorShareToken,shareHash} from '../lib/server/admin/inspectorShare';
import {shareTokenFromHash,actionShareUrl} from '../lib/inspector/actionShare';
import {validMarks} from '../lib/inspector/photoMarks';
const token='Q'.repeat(43),pid='10000000-0000-4000-8000-000000000002',id='10000000-0000-4000-8000-000000000001',rid='10000000-0000-4000-8000-000000000003';
const res=()=>({code:0,body:null as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},status(n:number){this.code=n;return this;},json(v:any){this.body=v;return this;}});
const req=(b:any,method='POST')=>({method,body:b,headers:{}});
let db:any,s:any,storage:any;
beforeEach(()=>{vi.resetAllMocks();delete process.env.PSI_DEPLOYMENT_MODEL;process.env.ADMIN_SESSION_SECRET='test-only-share-secret';s={id:rid,inspection_id:id,photo_id:pid,snapshot:{title:'합성 조치',owner:'합성 담당',dueDate:'2026-10-30',photoSha256:'a'.repeat(64)},responses:[],expires_at:'2026-10-30T00:00:00Z'};storage={download:vi.fn(),upload:vi.fn(),list:vi.fn()};db={rpc:vi.fn().mockImplementation(async(name:string)=>({data:name==='psi_inspector_share_active'?s:{requestId:rid},error:null})),from:vi.fn(),storage:{from:()=>storage}};mock.client.mockReturnValue(db);mock.quota.mockResolvedValue({allowed:true});});
describe('scoped external inspection action replies',()=>{
 it('keeps the capability in the fragment, deterministic per share, never an administrator session token',()=>{const t=inspectorShareToken(rid);expect(t).toHaveLength(43);expect(inspectorShareToken(rid)).toBe(t);expect(t).not.toBe(inspectorShareToken(pid));expect(shareHash(t)).toHaveLength(64);expect(actionShareUrl('https://example.test',t)).toBe('https://example.test/inspection-reply#'+t);expect(shareTokenFromHash('#'+t)).toBe(t);for(const bad of ['../','Q'.repeat(44),''])expect(shareTokenFromHash(bad)).toBe('');});
 it('validates input and dedicated mode before accessing the database',async()=>{for(const body of [{op:'detail',token:'bad'},{op:'delete',token},{op:'detail',token,id},'{bad']){const r=res();await handler(req(body),r);expect(r.code).toBe(400);}expect(mock.client).not.toHaveBeenCalled();process.env.PSI_DEPLOYMENT_MODEL='shared-saas';const r=res();await handler(req({op:'detail',token}),r);expect(r.code).toBe(403);});
 it('returns only the fixed public request and received replies without internal IDs, paths or token hashes',async()=>{const r=res();await handler(req({op:'detail',token}),r);expect(r.code).toBe(200);expect(r.body.snapshot.title).toBe('합성 조치');expect(r.body).not.toHaveProperty('inspection_id');expect(r.body).not.toHaveProperty('token_hash');expect(r.headers['Cache-Control']).toContain('no-store');expect(db.from).not.toHaveBeenCalled();});
 it('fails closed on expiry, revoke, source deletion and action changes without reading images',async()=>{db.rpc.mockResolvedValue({data:null,error:{message:'SHARE_UNAVAILABLE'}});const r=res();await handler(req({op:'photo',token}),r);expect(r.code).toBe(410);expect(storage.download).not.toHaveBeenCalled();});
 it('enforces quota before any capability or storage lookup',async()=>{mock.quota.mockResolvedValue({allowed:false,retryAfterSeconds:60});const r=res();await handler(req({op:'detail',token}),r);expect(r.code).toBe(429);expect(db.rpc).not.toHaveBeenCalled();expect(r.headers['Retry-After']).toBe('60');});
 it('records an explicit planned response through the bounded RPC without changing an inspection or calling AI',async()=>{const r=res();await handler(req({op:'reply',token,requestId:rid,kind:'planned',name:'합성 담당',note:'내일 조치 상태를 확인하겠습니다',consent:true}),r);expect(r.code).toBe(200);expect(db.rpc).toHaveBeenLastCalledWith('psi_inspector_share_reply',expect.objectContaining({p_photo:null,p_name:'합성 담당',p_kind:'planned'}));expect(db.from).not.toHaveBeenCalled();expect(storage.upload).not.toHaveBeenCalled();});
 it('replays an identical lost response and rejects a different body using the same request UUID',async()=>{s.responses=[{requestId:rid,kind:'planned',name:'합성 담당',note:'내일 조치 상태를 확인하겠습니다',photoId:null,sha256:null}];const b={op:'reply',token,requestId:rid,kind:'planned',name:'합성 담당',note:'내일 조치 상태를 확인하겠습니다',consent:true};const r=res();await handler(req(b),r);expect(r.body.replayed).toBe(true);expect(db.rpc).toHaveBeenCalledTimes(1);const bad=res();await handler(req({...b,note:'변경된 다른 회신입니다'}),bad);expect(bad.code).toBe(409);});
 it('requires explicit consent and rejects short or image-bearing text responses',async()=>{const b={op:'reply',token,requestId:rid,kind:'planned',name:'합성 담당',note:'사진과 조치 상태를 확인했습니다',consent:true};for(const x of [{...b,consent:false},{...b,name:'가'},{...b,note:'확인'},{...b,base64:'YQ=='}]){const r=res();await handler(req(x),r);expect(r.code).toBe(400);}expect(storage.upload).not.toHaveBeenCalled();});
 it('rechecks revocation after private image download and verifies the original hash',async()=>{const bytes=Buffer.from('synthetic image');s.snapshot.photoSha256=createHash('sha256').update(bytes).digest('hex');const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{storage_key:'private/path',sha256:s.snapshot.photoSha256,mime_type:'image/jpeg'},error:null})};db.from.mockReturnValue(q);storage.download.mockResolvedValue({data:new Blob([bytes]),error:null});db.rpc.mockResolvedValueOnce({data:s,error:null}).mockResolvedValueOnce({error:{message:'revoked'}});const r=res();await handler(req({op:'photo',token}),r);expect(r.code).toBe(410);expect(r.body).not.toHaveProperty('base64');});
 it('keeps marks bounded to eight normalized positions and rejects invalid coordinates',()=>{expect(validMarks([{kind:'circle',x:.5,y:.5,endX:.5,endY:.5}])).toBe(true);expect(validMarks([{kind:'arrow',x:-1,y:.5,endX:1,endY:.5}])).toBe(false);expect(validMarks(Array(9).fill({kind:'circle',x:.5,y:.5,endX:.5,endY:.5}))).toBe(false);});
 it('keeps reply-photo storage bounded and finishes reservations after a conflicting retry',async()=>{
  const bytes=Buffer.from([255,216,255,192,0,11,8,0,10,0,20,1,1,17,0,255,217]);
  const sha=createHash('sha256').update(bytes).digest('hex');
  const receipt={version:'browser-jpeg-v2',source_kind:'optimized',source_bytes:100,source_width:20,source_height:10,uploaded_bytes:bytes.length,uploaded_width:20,uploaded_height:10,quality:.85,uploaded_asset_sha256:sha,created_at:'2026-10-24T00:00:00Z'};
  const b={op:'reply',token,requestId:rid,kind:'photo',name:'합성 담당',note:'합성 개선사진을 접수합니다',consent:true,photoId:pid,base64:bytes.toString('base64'),receipt};
  storage.list.mockResolvedValue({data:[],error:null});storage.upload.mockResolvedValue({error:null});
  const ok=res();await handler(req(b),ok);expect(ok.code).toBe(200);expect(storage.upload).toHaveBeenCalledWith(`${id}/${pid}/${sha}.jpg`,bytes,{contentType:'image/jpeg',upsert:false});expect(db.rpc).toHaveBeenLastCalledWith('psi_inspector_finish',{p_operation:`share-upload:${rid}:${rid}:${pid}`});
  storage.upload.mockClear();storage.list.mockResolvedValue({data:[{name:'different-hash.jpg'}],error:null});
  const conflict=res();await handler(req(b),conflict);expect(conflict.code).toBe(409);expect(storage.upload).not.toHaveBeenCalled();expect(db.rpc).toHaveBeenLastCalledWith('psi_inspector_finish',expect.anything());
 });
 it('hides capability hashes and action baselines and only restores unchanged live links to administrators',async()=>{
  const a={id:pid,title:'고정 조치',status:'open'},t=inspectorShareToken(rid);
  const rows=[{id:rid,token_hash:shareHash(t),action_snapshot:a,expires_at:'2099-10-24T00:00:00Z',revoked_at:null,adopted_at:null}];
  const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:rows,error:null})};db.from.mockReturnValue(q);
  const current:any={id,document:{actions:[a]}};
  const good=await inspectorShareAdmin(db,current,{op:'share-list',id});expect(good.shares[0].token).toBe(t);expect(good.shares[0]).not.toHaveProperty('token_hash');expect(good.shares[0]).not.toHaveProperty('action_snapshot');
  current.document.actions=[{...a,title:'변경 조치'}];expect((await inspectorShareAdmin(db,current,{op:'share-list',id})).shares[0]).not.toHaveProperty('token');
  await expect(inspectorShareAdmin(db,current,{op:'share-adopt',id,shareId:rid,expectedRevision:1,confirmed:false})).rejects.toThrow();expect(db.rpc).not.toHaveBeenCalled();
 });

});
