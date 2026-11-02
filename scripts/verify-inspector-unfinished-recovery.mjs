import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base='http://127.0.0.1:3057';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a8sAAAAASUVORK5CYII=','base64');
const server=await preview({preview:{host:'127.0.0.1',port:3057,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const pageErrors=[];
try{
 const open=async(context)=>{
  const page=await context.newPage();
  page.on('pageerror',err=>pageErrors.push(err.message));
  await page.goto(base+'/?mode=photo-inspector',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다'}).waitFor({timeout:15000}).catch(async error=>{
   console.error('UNFINISHED_QA_ENTRY_DIAGNOSTIC',JSON.stringify({
    url:page.url(),title:await page.title(),body:(await page.locator('body').innerText()).slice(0,1000),
    errors:pageErrors.slice(-4),
   }));
   throw error;
  });
  await page.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
  const panel=page.getByRole('region',{name:'기기 직접 점검'});
  await panel.getByLabel('기기 점검 사진 선택').waitFor();
  await panel.getByText('이 브라우저에 보관된 점검 0건').waitFor();
  return {page,panel};
 };
 const readSaved=async(page,id)=>page.evaluate(key=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('psi-inspector-local-records',1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('records','readonly'),req=tx.objectStore('records').get(key);
   req.onsuccess=()=>{const v=req.result;resolve(v?{
    id:v.id,revision:v.revision,note:v.note,action:v.action,
    siteContext:v.siteContext,photoName:v.photo?.name,photos:v.photos?.map(p=>p.name),
   }:null);};tx.oncomplete=()=>db.close();tx.onabort=()=>reject(tx.error);
  };
 }),id);
 const downloadJson=async(panel,page)=>{
  const [dl]=await Promise.all([
   page.waitForEvent('download'),panel.getByRole('button',{name:'작성 중 자료 한 번에 백업'}).click(),
  ]);
  const bytes=await readFile(await dl.path());
  const parsed=JSON.parse(bytes.toString('utf8'));
  assert.equal(parsed.format,'psi-local-unfinished-checkpoint');
  return {bytes,parsed};
 };
 const importJson=async(panel,bytes,name='unfinished.json')=>{
  await panel.getByLabel('작성 중 백업 파일 검사').setInputFiles({
   name,mimeType:'application/json',buffer:bytes,
  });
 };
 // User case A: the browser rejects new photo writes (quota), but the visible
 // photo and current text are still downloadable as one self-contained backup.
 const firstContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const {page:one,panel:a}=await open(firstContext);
 await one.evaluate(()=>{
  window.__unfinishedOldPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(v,...args){
   if(v?.kind==='single-photo-draft')throw new DOMException('synthetic disk full','QuotaExceededError');
   return window.__unfinishedOldPut.call(this,v,...args);
  };
 });
 await a.getByLabel('기기 점검 사진 선택').setInputFiles({
  name:'quota-photo.png',mimeType:'image/png',buffer:png,
 });
 await a.getByText('사진을 임시저장하지 못했습니다.',{exact:false}).waitFor();
 await a.getByLabel('직접 확인한 내용').fill('합성 임시 점검 · 저장 공간 부족');
 await a.getByLabel('현장 조치·확인 계획').fill('접근통제 및 담당 지정 예정');
 await a.getByLabel('현장명').fill('합성 41차 현장');
 await a.getByLabel('층').fill('16F');
 const emergency=await downloadJson(a,one);
 assert.equal(emergency.parsed.input.note,'합성 임시 점검 · 저장 공간 부족');
 assert.equal(emergency.parsed.input.siteContext.level,'16F');
 assert.equal(emergency.parsed.single.photo.name,'quota-photo.png');
 assert.ok(emergency.parsed.single.photo.data.length>10);
 assert.equal(emergency.parsed.sequence,null);
 assert.equal(await readSaved(one,'psi-single-photo-draft-v1'),null,'file was NOT in IndexedDB: backup must use live File');
 await one.evaluate(()=>{IDBObjectStore.prototype.put=window.__unfinishedOldPut;});
 await firstContext.close();

 // User case B: corrupt export must not change the destination; a complete
 // backup restores only to an empty destination, with no implicit overwrite.
 const secondContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const {page:two,panel:b}=await open(secondContext);
 const corrupt=structuredClone(emergency.parsed);
 corrupt.single.photo.data='AAAA';
 await importJson(b,Buffer.from(JSON.stringify(corrupt)),'tampered.json');
 await b.getByText('백업 사진의 SHA-256 비교값이 일치하지 않습니다.',{exact:false}).waitFor();
 assert.equal(await readSaved(two,'psi-single-photo-draft-v1'),null,'corruption must not write to IndexedDB');
 await importJson(b,emergency.bytes);
 await b.getByText('백업 검증 완료:',{exact:false}).waitFor();
 await b.getByRole('button',{name:'검사된 작성 중 자료 복원'}).waitFor();
 // Another tab inserts a checkpoint after preview. Atomic restore must fail.
 await two.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('psi-inspector-local-records',1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('records','readwrite');
   tx.objectStore('records').put({
    id:'psi-local-inspection-input-draft-v1',kind:'inspection-input-draft',
    revision:crypto.randomUUID(),savedAt:new Date().toISOString(),
    note:'other-tab-protected',action:'',photoRole:'unspecified',
    siteContext:{site:'',building:'',level:'',trade:''},
   });
   tx.oncomplete=()=>{db.close();resolve(true);};tx.onabort=()=>reject(tx.error);
  };
 }));
 two.once('dialog',dialog=>dialog.accept());
 await b.getByRole('button',{name:'검사된 작성 중 자료 복원'}).click();
 await b.getByText('기기에 이미 다른 임시기록이 있어 복원하지 않았습니다.',{exact:false}).waitFor();
 assert.equal((await readSaved(two,'psi-local-inspection-input-draft-v1')).note,'other-tab-protected');
 assert.equal(await readSaved(two,'psi-single-photo-draft-v1'),null);
 // Clear synthetic conflict through direct test harness (never app auto-delete).
 await two.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('psi-inspector-local-records',1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('records','readwrite');
   tx.objectStore('records').delete('psi-local-inspection-input-draft-v1');
   tx.oncomplete=()=>{db.close();resolve(true);};tx.onabort=()=>reject(tx.error);
  };
 }));
 two.once('dialog',dialog=>dialog.accept());
 await b.getByRole('button',{name:'검사된 작성 중 자료 복원'}).click();
 await b.getByText('작성 중 사진과 입력을 기기에 함께 복원하고 저장된 기록을 다시 확인했습니다.',{exact:false}).waitFor();
 assert.equal(await b.getByLabel('직접 확인한 내용').inputValue(),'합성 임시 점검 · 저장 공간 부족');
 assert.equal(await b.getByLabel('층').inputValue(),'16F');
 assert.equal((await readSaved(two,'psi-single-photo-draft-v1')).photoName,'quota-photo.png');
 await b.getByAltText('기기 점검에 선택한 사진').waitFor();
 await b.getByText('이 브라우저에 보관된 점검 0건').waitFor();
 // Import the same file again. The screen is not blank; previous state survives.
 await importJson(b,emergency.bytes);
 await b.getByText('백업 검증 완료:',{exact:false}).waitFor();
 await b.getByRole('button',{name:'검사된 작성 중 자료 복원'}).click();
 await b.getByText('현재 화면에 작성 중인 자료가 있어 복원을 중단했습니다.',{exact:false}).waitFor();
 assert.equal((await readSaved(two,'psi-single-photo-draft-v1')).photoName,'quota-photo.png');

 // User case C: complete saved inspection is created exactly once; temporary
 // rows are cleaned, but original backup remains downloadable.
 await b.getByRole('button',{name:'사진과 내용 기기에 저장'}).click();
 await b.getByText('이 브라우저에 보관된 점검 1건').waitFor();
 assert.equal(await readSaved(two,'psi-single-photo-draft-v1'),null);
 assert.equal(await readSaved(two,'psi-local-inspection-input-draft-v1'),null);
 assert.equal(pageErrors.length,0,'no uncaught browser exceptions');
 console.log('PASS F08 unified backup: quota failure, emergency export, tamper, atomic no-overwrite, reload, final commit');
 await secondContext.close();
}finally{
 await browser.close();await server.close();
}
