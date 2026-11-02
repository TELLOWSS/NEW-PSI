import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
  // Same local-only synthetic admin entitlement as the existing Inspector
  // browser QA; no production login credentials or real user account.
  await page.route('**/api/admin/auth',route=>route.fulfill({json:{ok:true,authenticated:true}}));
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
 const downloadJson=async(panel,page,buttonLabel='작성 중 자료 한 번에 백업')=>{
  const [dl]=await Promise.all([
   page.waitForEvent('download'),panel.getByRole('button',{name:buttonLabel}).click(),
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
 const emergency=await downloadJson(a,one,'오류 난 사진·내용 긴급 백업');
 assert.equal(emergency.parsed.input.note,'합성 임시 점검 · 저장 공간 부족');
 assert.equal(emergency.parsed.input.siteContext.level,'16F');
 assert.equal(emergency.parsed.single.photo.name,'quota-photo.png');
 assert.ok(emergency.parsed.single.photo.data.length>10);
 assert.equal(emergency.parsed.sequence,null);
 // F08-51: reselect the actual downloaded JSON, verify it matches the
 // exported bytes and detect any changes after export.
 const savedFile=a.getByLabel('저장한 JSON 백업 파일 다시 선택');
 await a.getByRole('region',{name:'백업 확인 진행 상태'}).getByText('2단계 · 백업 파일 재선택 필요').waitFor();
 await savedFile.setInputFiles({name:'PSI-unfinished-recovery.json',mimeType:'application/json',buffer:emergency.bytes});
 await a.getByText('이번 화면 백업 파일 재선택 검사 통과.',{exact:false}).waitFor();
 await savedFile.setInputFiles({name:'corrupted.json',mimeType:'application/json',buffer:Buffer.from('{"bad":"bytes"}')});
 await a.getByText('지원하지 않거나 손상된 작성 중 백업입니다.',{exact:false}).waitFor();
 await a.getByRole('region',{name:'백업 확인 진행 상태'}).getByText('확인 실패 · 파일 손상 또는 읽기 오류').waitFor();
 assert.equal(await a.getByRole('button',{name:'다른 JSON 파일 다시 선택'}).isVisible(),true);
 // A structurally valid but different export must still be rejected.
 const otherExport=structuredClone(emergency.parsed);
 otherExport.exportedAt='2026-11-02T07:00:00.000Z';
 const {payloadSha256:unusedSha,...differentPayload}=otherExport;
 otherExport.payloadSha256=createHash('sha256').update(JSON.stringify(differentPayload)).digest('hex');
 await savedFile.setInputFiles({name:'other-valid-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(otherExport))});
 await a.getByText('선택한 파일이 이번 화면에서 요청한 백업과 다릅니다.',{exact:false}).waitFor();
 await a.getByRole('region',{name:'백업 확인 진행 상태'}).getByText('확인 실패 · 다른 백업 파일').waitFor();
 await savedFile.setInputFiles({name:'recovered.json',mimeType:'application/json',buffer:emergency.bytes});
 await a.getByText('이번 화면 백업 파일 재선택 검사 통과.',{exact:false}).waitFor();
 await a.getByLabel('현장 조치·확인 계획').fill('변경된 현장 계획 · 새 백업 필요');
 await a.getByText('백업 이후 점검 내용이나 사진이 변경됐습니다.',{exact:false}).waitFor();
 await a.getByRole('region',{name:'백업 확인 진행 상태'}).getByText('변경 감지 · 새 백업 필요').waitFor();
 await a.getByText('이번 화면 백업 파일 재선택 검사 통과.',{exact:false}).waitFor({state:'hidden'});
 const updatedBackup=await downloadJson(a,one,'변경 내용 새 백업');
 assert.equal(updatedBackup.parsed.input.action,'변경된 현장 계획 · 새 백업 필요');
 await a.getByRole('region',{name:'백업 확인 진행 상태'}).getByText('2단계 · 백업 파일 재선택 필요').waitFor();
 await savedFile.setInputFiles({name:'current.json',mimeType:'application/json',buffer:updatedBackup.bytes});
 await a.getByRole('region',{name:'백업 확인 진행 상태'}).getByText('3단계 · 백업 파일 내용 일치').waitFor();
 assert.equal(await a.getByRole('button',{name:'변경 내용 새 백업'}).count(),0);
 assert.equal(await readSaved(one,'psi-single-photo-draft-v1'),null,'file was NOT in IndexedDB: backup must use live File');
 await one.evaluate(()=>{IDBObjectStore.prototype.put=window.__unfinishedOldPut;});
 await firstContext.close();

 // User case B: corrupt export must not change the destination; a complete
 // backup restores only to an empty destination, with no implicit overwrite.
 const secondContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const {page:two,panel:b}=await open(secondContext);
 // F08-54: the normal first-use screen leads with photo → note → save.
 // The long backup/recovery tools are collapsed until a worker opens them.
 await b.getByText('현장 점검 · 이 순서로 진행하세요').waitFor();
 const firstSteps=b.getByLabel('점검 진행 3단계');
 await firstSteps.getByText('사진을 촬영하거나 선택하세요.').waitFor();
 await firstSteps.getByText('눈으로 확인한 위험을 직접 적으세요.').waitFor();
 for(const [name,href] of [
  ['사진 단계로 이동','#si-local-photo-step'],
  ['내용 입력으로 이동','#si-local-inspection-note'],
  ['저장 단계로 이동','#si-local-inspection-save'],
 ])assert.equal(await firstSteps.getByRole('link',{name}).getAttribute('href'),href);
 assert.equal(await b.locator('#si-unfinished-recovery details').first().evaluate(el=>el.open),false,
  'long recovery tools should not obscure ordinary field entry');
 await b.getByText('작성 중 기록 백업·복구 (필요할 때 열기)',{exact:true}).click();
 assert.equal(await b.locator('#si-unfinished-recovery details').first().evaluate(el=>el.open),true);
 const recoveryPanel=b.getByRole('region',{name:'작성 중 자료 긴급 백업과 복구'});
 await recoveryPanel.getByText('1. 현재 화면 먼저 백업').waitFor();
 await recoveryPanel.getByText('2. 기기에 남은 기록 확인').waitFor();
 await recoveryPanel.getByText('3. 백업 파일 검사 후 복원').waitFor();
 await b.getByRole('button',{name:'기기 임시기록 상태 확인'}).click();
 await b.getByRole('region',{name:'기기 임시기록 진단 결과'})
  .getByText('기기에 임시기록이 보이지 않음').waitFor();
 assert.equal(await b.getByRole('button',{name:'검사된 작성 중 자료 복원'}).count(),0,
  'before file selection do not offer an active restore button');
 // Version 2 checks the entire manifest plus the form before touching IndexedDB.
 assert.equal(emergency.parsed.version,2);
 assert.match(emergency.parsed.inputSha256,/^[a-f0-9]{64}$/);
 assert.match(emergency.parsed.payloadSha256,/^[a-f0-9]{64}$/);
 const hashText=text=>createHash('sha256').update(text).digest('hex');
 const withManifest=data=>{
  const {payloadSha256,...payload}=data;
  return {...payload,payloadSha256:hashText(JSON.stringify(payload))};
 };
 const corrupt=structuredClone(emergency.parsed);
 corrupt.single.photo.data='AAAA';
 await importJson(b,Buffer.from(JSON.stringify(corrupt)),'tampered.json');
 await b.getByText('백업 파일 내용이 변경되거나 손상됐습니다.',{exact:false}).waitFor();
 assert.equal(await readSaved(two,'psi-single-photo-draft-v1'),null,'manifest corruption must not write to IndexedDB');
 // Damage to the note is rejected independently of the total file checksum.
 const noteTampered=withManifest({...emergency.parsed,input:{...emergency.parsed.input,note:'tampered inspection note'}});
 await importJson(b,Buffer.from(JSON.stringify(noteTampered)),'tampered-note.json');
 await b.getByText('백업의 점검 내용·조치 계획·현장정보가 변경되어 복원을 중단했습니다.',{exact:false}).waitFor();
 assert.equal(await readSaved(two,'psi-local-inspection-input-draft-v1'),null,'tampered note must not restore');
 // Even if the outer checksum is recomputed, each photo's own SHA is required.
 const damagedPhoto=structuredClone(emergency.parsed);
 damagedPhoto.single.photo.data='AAAA';
 await importJson(b,Buffer.from(JSON.stringify(withManifest(damagedPhoto))),'tampered-photo.json');
 await b.getByText('백업 사진의 SHA-256 비교값이 일치하지 않습니다.',{exact:false}).waitFor();
 assert.equal(await readSaved(two,'psi-single-photo-draft-v1'),null,'photo corruption must not restore');
 await importJson(b,emergency.bytes);
 await b.getByText('백업 검증 완료:',{exact:false}).waitFor();
 const reviewedRestore=b.getByRole('button',{name:'검사된 작성 중 자료 복원'});
 assert.equal(await reviewedRestore.isDisabled(),true,'unacknowledged backup cannot be restored');
 await b.getByText('검사된 백업의 기록·사진 직접 확인').click();
 await b.getByText('합성 임시 점검 · 저장 공간 부족',{exact:false}).waitFor();
 await b.getByText('합성 41차 현장',{exact:false}).waitFor();
 await b.getByAltText('단건 사진 백업 사진 미리보기').waitFor();
 await b.getByLabel('검사된 백업 내용을 확인했습니다.').check();
 assert.equal(await reviewedRestore.isDisabled(),false,'explicit review enables the guarded restore');

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
 await b.getByText('작성 중 사진과 입력을 기기에 함께 복원하고, 점검 내용과 실제 사진 파일을 다시 읽어 비교했습니다.',{exact:false}).waitFor();
 assert.equal(await b.getByLabel('직접 확인한 내용').inputValue(),'합성 임시 점검 · 저장 공간 부족');
 assert.equal(await b.getByLabel('층').inputValue(),'16F');
 assert.equal((await readSaved(two,'psi-single-photo-draft-v1')).photoName,'quota-photo.png');
 // One tap: inspect all three durable slots, without treating unverified text as
 // a confirmed historical original. Download a separate verified snapshot.
 await b.getByRole('button',{name:'기기 임시기록 상태 확인'}).click();
 await b.getByRole('region',{name:'기기 임시기록 진단 결과'}).getByText('단건 사진: 저장 파일과 비교값 일치',{exact:false}).waitFor();
 const [storedBackup]=await Promise.all([
  two.waitForEvent('download'),
  b.getByRole('button',{name:'기기에 남은 임시자료 별도 백업'}).click(),
 ]);
 const storedData=JSON.parse((await readFile(await storedBackup.path())).toString('utf8'));
 assert.equal(storedData.version,2);
 assert.equal(storedData.input.note,'합성 임시 점검 · 저장 공간 부족');
 assert.equal(storedData.single.photo.name,'quota-photo.png');
 // F08-46: existing stored records are continued in place, not reimported.
 const continueButton=b.getByRole('button',{name:'기존 점검 안전하게 이어쓰기'});
 await continueButton.waitFor();
 assert.equal(await continueButton.isDisabled(),false);
 await continueButton.click();
 await b.getByText('현재 기기 임시기록과 화면에 불러온 자료를 다시 확인했습니다.',{exact:false}).waitFor();
 assert.equal(await b.getByLabel('직접 확인한 내용').evaluate(el=>el===document.activeElement),true,
  'safe continuation should focus existing unsaved inspection without modifying storage');
 assert.equal((await readSaved(two,'psi-local-inspection-input-draft-v1')).note,'합성 임시 점검 · 저장 공간 부족');
 // A concurrent tab changes the stored note while the current form remains
 // unchanged. Continuation must refuse to affirm an out-of-date screen.
 await two.evaluate(()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('psi-inspector-local-records',1);
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction('records','readwrite'),st=tx.objectStore('records');
   const g=st.get('psi-local-inspection-input-draft-v1');
   g.onsuccess=()=>{
    window.__resumePriorInput=g.result;
    st.put({...g.result,revision:crypto.randomUUID(),note:'other-tab-updated-original'});
   };
   tx.oncomplete=()=>{db.close();resolve(true);};tx.onabort=()=>reject(tx.error);
  };
 }));
 await continueButton.click();
 await b.getByText('현재 화면과 기기에 보관된 점검 입력이 다릅니다.',{exact:false}).waitFor();
 assert.equal((await readSaved(two,'psi-local-inspection-input-draft-v1')).note,'other-tab-updated-original');
 assert.equal(await b.getByLabel('직접 확인한 내용').inputValue(),'합성 임시 점검 · 저장 공간 부족');
 // Test harness restores its synthetic other-tab edit only. Application
 // never deletes or overwrites anything during continuation.
 await two.evaluate(()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('psi-inspector-local-records',1);
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction('records','readwrite');
   tx.objectStore('records').put(window.__resumePriorInput);
   tx.oncomplete=()=>{db.close();resolve(true);};tx.onabort=()=>reject(tx.error);
  };
 }));
 await b.getByAltText('기기 점검에 선택한 사진').waitFor();
 await b.getByText('이 브라우저에 보관된 점검 0건').waitFor();
 // Import the same file again. The screen is not blank; previous state survives.
 await importJson(b,emergency.bytes);
 await b.getByText('백업 검증 완료:',{exact:false}).waitFor();
 assert.equal(await b.getByLabel('검사된 백업 내용을 확인했습니다.').isChecked(),false,'reselecting file clears old acknowledgement');
 const protectedRestore=b.getByRole('button',{name:'검사된 작성 중 자료 복원'});
 assert.equal(await protectedRestore.isDisabled(),true,'active single photo and text must disable restore');
 await b.getByText('복원 버튼 비활성화:',{exact:false}).waitFor();
 assert.equal((await readSaved(two,'psi-single-photo-draft-v1')).photoName,'quota-photo.png');
 const mobileState=await recoveryPanel.evaluate(el=>{
  const buttons=Array.from(el.querySelectorAll('button'));
  return {width:window.innerWidth,outside:buttons.filter(x=>x.getBoundingClientRect().right>window.innerWidth+2).map(x=>x.textContent),
    short:buttons.filter(x=>x.getBoundingClientRect().height<44).map(x=>x.textContent)};
 });
 assert.deepEqual(mobileState.outside,[],'recovery actions must not escape mobile viewport');
 assert.deepEqual(mobileState.short,[],'recovery action touch targets must be at least 44 pixels');

 // User case C: complete saved inspection is created exactly once; temporary
 // rows are cleaned, but original backup remains downloadable.
 await b.getByRole('button',{name:'사진과 내용 기기에 저장'}).click();
 await b.getByText('이 브라우저에 보관된 점검 1건').waitFor();
 assert.equal(await readSaved(two,'psi-single-photo-draft-v1'),null);
 assert.equal(await readSaved(two,'psi-local-inspection-input-draft-v1'),null);
 assert.equal(pageErrors.length,0,'no uncaught browser exceptions');
 await secondContext.close();

 // User case D: same record revision and photo metadata BUT different persisted
 // bytes must NOT produce a success message after the transaction commits.
 const thirdContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const {page:three,panel:c}=await open(thirdContext);
 await c.getByText('작성 중 기록 백업·복구 (필요할 때 열기)',{exact:true}).click();
 await importJson(c,emergency.bytes);
 await c.getByText('백업 검증 완료:',{exact:false}).waitFor();
 assert.equal(await c.getByRole('button',{name:'검사된 작성 중 자료 복원'}).isDisabled(),true,'fresh device needs acknowledgement');
 await c.getByText('검사된 백업의 기록·사진 직접 확인').click();
 await c.getByAltText('단건 사진 백업 사진 미리보기').waitFor();
 await c.getByLabel('검사된 백업 내용을 확인했습니다.').check();
 await three.evaluate(()=>{
  window.__originalAdd=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(value,...args){
   if(value?.kind==='single-photo-draft'){
    const damaged=new File([new Uint8Array(value.photo.size).fill(42)],value.photo.name,
     {type:value.photo.type,lastModified:value.photo.lastModified});
    return window.__originalAdd.call(this,{...value,photo:damaged},...args);
   }
   return window.__originalAdd.call(this,value,...args);
  };
 });
 three.once('dialog',dialog=>dialog.accept());
 await c.getByRole('button',{name:'검사된 작성 중 자료 복원'}).click();
 await c.getByText('복원 저장 또는 저장 후 재검증에 실패했습니다.',{exact:false}).waitFor();
 // Auto-triage reads all slots after a failed postflight without deleting any.
 await c.getByRole('region',{name:'기기 임시기록 진단 결과'})
  .getByText('단건 사진: 저장 기록에 오류 또는 비교값 불일치',{exact:false}).waitFor();
 assert.equal(await c.getByRole('button',{name:'기기에 남은 임시자료 별도 백업'}).count(),0,
  'never offer a complete backup for corrupted stored photos');
 assert.equal((await readSaved(three,'psi-single-photo-draft-v1')).photoName,'quota-photo.png');
 // Deliberately do not auto-delete a committed-but-unverified checkpoint.
 await three.evaluate(()=>{IDBObjectStore.prototype.add=window.__originalAdd;});
 three.once('dialog',dialog=>dialog.accept());
 await three.reload({waitUntil:'networkidle'});
 await three.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다'}).waitFor();
 await three.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
 await three.getByRole('region',{name:'기기 직접 점검'})
  .getByText('기기에 임시 보관된 단건 사진의 파일 비교값이 일치하지 않습니다.',{exact:false}).waitFor();
 await thirdContext.close();

 // F08-48: mobile OS may suspend a page before the 650ms autosave timer.
 // Synthetic pagehide must start an IndexedDB write of the latest form.
 const fourthContext=await browser.newContext({viewport:{width:360,height:740},acceptDownloads:true});
 const {page:four,panel:d}=await open(fourthContext);
 await d.getByLabel('현장명').fill('합성 48차 현장');
 await d.getByLabel('층').fill('지상 18층');
 await d.getByLabel('직접 확인한 내용').fill('화면 전환 직전 입력한 위험 관찰');
 await d.getByLabel('현장 조치·확인 계획').fill('현장 접근 제한 후 후속 점검 계획');
 await four.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await four.waitForFunction(async()=>new Promise(resolve=>{
  const req=indexedDB.open('psi-inspector-local-records',1);
  req.onerror=()=>resolve(false);
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction('records','readonly');
   const get=tx.objectStore('records').get('psi-local-inspection-input-draft-v1');
   get.onsuccess=()=>resolve(get.result?.note==='화면 전환 직전 입력한 위험 관찰'&&
    get.result?.siteContext?.site==='합성 48차 현장'&&
    get.result?.siteContext?.level==='지상 18층'&&
    get.result?.action==='현장 접근 제한 후 후속 점검 계획');
   get.onerror=()=>resolve(false);tx.oncomplete=()=>db.close();
  };
 }),null,{timeout:6000});
 const backgroundSaved=await readSaved(four,'psi-local-inspection-input-draft-v1');
 assert.equal(backgroundSaved.siteContext.site,'합성 48차 현장');
 assert.equal(backgroundSaved.note,'화면 전환 직전 입력한 위험 관찰');
 await four.reload({waitUntil:'networkidle'});
 await four.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
 const resumed=four.getByRole('region',{name:'기기 직접 점검'});
 await resumed.getByLabel('직접 확인한 내용').waitFor();
 assert.equal(await resumed.getByLabel('직접 확인한 내용').inputValue(),'화면 전환 직전 입력한 위험 관찰');
 assert.equal(await resumed.getByLabel('현장명').inputValue(),'합성 48차 현장');
 assert.equal(await resumed.getByLabel('층').inputValue(),'지상 18층');
 await fourthContext.close();

 // F08-49: a completed IndexedDB write could contain changed text while its
 // revision and saved timestamp still match. Do not mark it as safely saved.
 // Keep the original UI content available for a manual emergency export.
 const fifthContext=await browser.newContext({viewport:{width:360,height:740},acceptDownloads:true});
 const {page:five,panel:e}=await open(fifthContext);
 await five.evaluate(()=>{
  window.__originalInputPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,...args){
   if(value?.kind==='inspection-input-draft')
    return window.__originalInputPut.call(this,{...value,note:'합성 검사: 저장본은 다른 문구'},...args);
   return window.__originalInputPut.call(this,value,...args);
  };
 });
 await e.getByLabel('직접 확인한 내용').fill('손상 전 실제 점검자의 입력');
 await e.getByLabel('현장명').fill('합성 원본 현장');
 await e.getByText('임시 입력을 저장하거나 저장 후 내용 확인에 실패했습니다.',{exact:false}).waitFor();
 const wronglySaved=await readSaved(five,'psi-local-inspection-input-draft-v1');
 assert.equal(wronglySaved.note,'합성 검사: 저장본은 다른 문구');
 assert.equal(await e.getByText('최근 임시저장:',{exact:false}).count(),0,
  'a mismatched stored note must never be displayed as a successful save');
 const localBackup=await downloadJson(e,five,'입력·사진 긴급 백업');
 assert.equal(localBackup.parsed.input.note,'손상 전 실제 점검자의 입력');
 assert.equal(localBackup.parsed.input.siteContext.site,'합성 원본 현장');
 assert.equal((await readSaved(five,'psi-local-inspection-input-draft-v1')).note,'합성 검사: 저장본은 다른 문구',
  'the app must not overwrite or auto-delete a corrupt durable draft');
 await five.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalInputPut;});
 await fifthContext.close();

 // F08-50: another tab modifies a stored record without changing its revision.
 // The next autosave must not overwrite that record based on revision alone.
 const sixthContext=await browser.newContext({viewport:{width:360,height:740},acceptDownloads:true});
 const {page:six,panel:g}=await open(sixthContext);
 await g.getByLabel('직접 확인한 내용').fill('원래 임시 메모');
 await g.getByText('최근 임시저장:',{exact:false}).waitFor();
 const original=await readSaved(six,'psi-local-inspection-input-draft-v1');
 assert.equal(original.note,'원래 임시 메모');
 await six.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('psi-inspector-local-records',1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
   const req=store.get('psi-local-inspection-input-draft-v1');
   req.onsuccess=()=>{
    store.put({...req.result,note:'다른 탭에서 변경된 문구',siteContext:{...req.result.siteContext,level:'21F'}});
   };
   tx.oncomplete=()=>{db.close();resolve(true);};
   tx.onerror=()=>reject(tx.error);
  };
 }));
 const changed=await readSaved(six,'psi-local-inspection-input-draft-v1');
 assert.equal(changed.revision,original.revision,'test keeps identical revision');
 assert.equal(changed.note,'다른 탭에서 변경된 문구');
 await g.getByLabel('직접 확인한 내용').fill('내가 계속 작성한 새 메모');
 await g.getByText('다른 탭의 변경 또는 저장 내용 불일치 감지').waitFor();
 assert.equal((await readSaved(six,'psi-local-inspection-input-draft-v1')).note,'다른 탭에서 변경된 문구',
  'content mismatch must block an automatic overwrite despite equal revision');
 const [conflictDownload]=await Promise.all([
  six.waitForEvent('download'),g.getByRole('button',{name:'현재 화면 충돌 자료 백업'}).click(),
 ]);
 const conflictData=JSON.parse((await readFile(await conflictDownload.path())).toString('utf8'));
 assert.equal(conflictData.input.note,'내가 계속 작성한 새 메모');
 await g.getByRole('button',{name:'기기 저장본 읽기 전용 확인'}).click();
 await g.getByText('진단 결과:',{exact:false}).waitFor();
 assert.equal((await readSaved(six,'psi-local-inspection-input-draft-v1')).note,'다른 탭에서 변경된 문구',
  'read-only diagnosis must not mutate or clear existing data');
 await sixthContext.close();

 // F08-53: if photos or JSON cannot be saved and clipboard access is denied,
 // live inspection text must remain selectable in a 320px mobile layout.
 const seventhContext=await browser.newContext({viewport:{width:320,height:700},acceptDownloads:false});
 const {page:seven,panel:h}=await open(seventhContext);
 await h.getByText('현장 점검 · 이 순서로 진행하세요').waitFor();
 await h.getByText('작성 중 기록 백업·복구 (필요할 때 열기)',{exact:true}).click();
 await h.getByLabel('현장명').fill('합성 다운로드 불가 현장');
 await h.getByLabel('동').fill('2003동');
 await h.getByLabel('층').fill('21F');
 await h.getByLabel('점검 현장 공종').fill('형틀');
 await h.getByLabel('직접 확인한 내용').fill('비상복사 전 추락 위험 관찰');
 await h.getByLabel('현장 조치·확인 계획').fill('안전난간 확인 후 현장 접근통제');
 await h.getByText('최근 임시저장:',{exact:false}).waitFor();
 await seven.evaluate(()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,
   value:{writeText:async()=>{throw new DOMException('synthetic clipboard denied','NotAllowedError');}}});
 });
 await h.getByText('JSON 다운로드가 안 될 때 · 문구만 따로 보관',{exact:true}).click();
 const rescue=h.getByLabel('점검 문구 비상 복사 원문');
 const content=await rescue.inputValue();
 for(const required of ['합성 다운로드 불가 현장','2003동','21F','형틀',
  '비상복사 전 추락 위험 관찰','안전난간 확인 후 현장 접근통제',
  '사진은 포함되지 않습니다','점검 완료나 원본 보존을 증명할 수 없습니다'])
  assert.ok(content.includes(required),'missing emergency copy section '+required);
 const beforeCopy=await readSaved(seven,'psi-local-inspection-input-draft-v1');
 await h.getByRole('button',{name:'점검 문구 복사 시도'}).click();
 await h.getByText('이 브라우저에서 자동 복사를 허용하지 않았습니다.',{exact:false}).waitFor();
 const selected=await rescue.evaluate(el=>({start:el.selectionStart,end:el.selectionEnd,length:el.value.length}));
 assert.equal(selected.start,0);
 assert.equal(selected.end,selected.length,'fallback must select all live text for manual copy');
 const afterCopy=await readSaved(seven,'psi-local-inspection-input-draft-v1');
 assert.deepEqual(afterCopy,beforeCopy,'text-only rescue must never mutate stored draft');
 await h.getByLabel('직접 확인한 내용').fill('비상복사 이후 새 관찰 내용');
 assert.ok((await rescue.inputValue()).includes('비상복사 이후 새 관찰 내용'),
  'copy textarea must track unsaved current-screen edits');
 await seventhContext.close();

 assert.equal(pageErrors.length,0,'no uncaught browser exceptions');
 console.log('PASS F08 unified backup: quota failure, tamper, atomic no-overwrite, real persisted-byte readback, mobile pagehide checkpoint, same-revision persisted-input mismatch, content-aware no-overwrite CAS, downloaded-file recheck, text-only clipboard-denied mobile rescue, novice three-step flow and collapsed recovery, final commit');
}finally{
 await browser.close();await server.close();
}
