import {preview} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const base='http://127.0.0.1:3057';
const raw=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a8sAAAAASUVORK5CYII=','base64');
const digest=createHash('sha256').update(raw).digest('hex');
const server=await preview({preview:{host:'127.0.0.1',port:3057,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 page.on('pageerror',err=>errors.push(err.message));
 await page.route('**/api/admin/auth',route=>route.fulfill({json:{ok:true,authenticated:true}}));
 const open=async()=>{
  await page.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
  const panel=page.getByRole('region',{name:'기기 직접 점검'});
  await panel.getByLabel('기기 점검 사진 선택').waitFor();
  await panel.getByText('이 브라우저에 보관된 점검',{exact:false}).first().waitFor();
  return panel;
 };
 const read=async id=>page.evaluate(key=>new Promise((resolve,reject)=>{
  const dbRequest=indexedDB.open('psi-inspector-local-records',1);
  dbRequest.onerror=()=>reject(dbRequest.error);
  dbRequest.onsuccess=()=>{
   const db=dbRequest.result,tx=db.transaction('records','readonly'),req=tx.objectStore('records').get(key);
   req.onsuccess=()=>{const value=req.result;resolve(value?{...value,photo:{name:value.photo?.name,size:value.photo?.size,type:value.photo?.type}}:null);};
   tx.oncomplete=()=>db.close();tx.onabort=()=>reject(tx.error);
  };
 }),id);
 const singleId='psi-single-photo-draft-v1';
 const pick=async(name,data=raw)=>{
  await page.getByRole('region',{name:'기기 직접 점검'}).getByLabel('기기 점검 사진 선택').setInputFiles({name,mimeType:'image/png',buffer:data});
 };
 await page.goto(base+'/?mode=photo-inspector',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다'}).waitFor();
 let panel=await open();
 await panel.getByText('이 브라우저에 보관된 점검 0건').waitFor();
 await pick('first-single.png');
 await panel.getByText('선택 사진 임시저장 확인됨',{exact:false}).waitFor();
 const stored=await read(singleId);
 assert.equal(stored?.photo.name,'first-single.png');
 assert.equal(stored?.sha256,digest);
 assert.equal(stored?.source,'file-picker');
 await panel.getByText('이 브라우저에 보관된 점검 0건').waitFor();
 await page.reload({waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다'}).waitFor();
 panel=await open();
 await panel.getByText('선택 사진 임시저장 확인됨',{exact:false}).waitFor();
 await panel.getByAltText('기기 점검에 선택한 사진').waitFor();
 await panel.getByText('first-single.png',{exact:false}).first().waitFor();
 assert.equal(await panel.getByText('이 브라우저에 보관된 점검 0건').count(),1,'unfinished photo must never count as completed inspection');
 await panel.getByLabel('직접 확인한 내용').fill('합성 단건 사진 재실행 복구 확인');
 await panel.getByLabel('현장 조치·확인 계획').fill('접근 통제와 확인 필요');
 await panel.getByRole('button',{name:'사진과 내용 기기에 저장'}).click();
 await panel.getByText('이 브라우저에 보관된 점검 1건').waitFor();
 assert.equal(await read(singleId),null,'checkpoint must be removed atomically after successful final save');
 const records=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('psi-inspector-local-records',1);
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction('records','readonly'),q=tx.objectStore('records').getAll();
   q.onsuccess=()=>resolve(q.result.filter(x=>x.note==='합성 단건 사진 재실행 복구 확인').map(x=>({name:x.photo?.name,sha:x.sha256})));
   tx.oncomplete=()=>db.close();
  };
 }));
 assert.deepEqual(records,[{name:'first-single.png',sha:digest}]);

 await pick('second-single.png');
 await panel.getByText('선택 사진 임시저장 확인됨',{exact:false}).waitFor();
 const preserved=await read(singleId);
 await page.evaluate(key=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('psi-inspector-local-records',1);
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),g=store.get(key);
   g.onsuccess=()=>store.put({...g.result,revision:crypto.randomUUID()});
   tx.oncomplete=()=>{db.close();resolve(true);};tx.onabort=()=>reject(tx.error);
  };
 }),singleId);
 page.once('dialog',dialog=>dialog.accept());
 await pick('third-single.png');
 await panel.getByText('다른 탭에서 단건 임시사진을 변경하여 덮어쓰지 않았습니다.',{exact:false}).waitFor();
 assert.equal((await read(singleId)).photo.name,'second-single.png','cross-tab conflict must not overwrite');
 page.once('dialog',dialog=>dialog.accept());
 await panel.getByRole('button',{name:'기기 단건 임시사진 다시 확인'}).click();
 await panel.getByText('선택 사진 임시저장 확인됨',{exact:false}).waitFor();
 assert.equal((await read(singleId)).photo.name,'second-single.png');

 await page.evaluate(()=>{window.__singleOldPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){
  if(value?.kind==='single-photo-draft')throw new DOMException('synthetic quota','QuotaExceededError');
  return window.__singleOldPut.call(this,value,...args);
 };});
 page.once('dialog',dialog=>dialog.accept());
 await pick('quota-failure.png');
 await panel.getByText('사진을 임시저장하지 못했습니다.',{exact:false}).waitFor();
 await panel.getByAltText('기기 점검에 선택한 사진').waitFor();
 assert.equal((await read(singleId)).photo.name,'second-single.png','quota fail must preserve previous committed checkpoint');
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__singleOldPut;});
 page.once('dialog',dialog=>dialog.accept());
 await panel.getByRole('button',{name:'선택 사진 임시저장 다시 시도'}).click();
 await panel.getByText('선택 사진 임시저장 확인됨',{exact:false}).waitFor();
 assert.equal((await read(singleId)).photo.name,'quota-failure.png');
 assert.deepEqual(errors,[],'no uncaught browser exceptions');
 console.log('PASS single photo file selection, full reload, SHA-256, final save cleanup, cross-tab conflict and quota retry');
 await context.close();
}finally{await browser.close();await server.close();}
