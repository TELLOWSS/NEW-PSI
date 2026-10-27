import {preview} from 'vite';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3047',baseline=process.env.PSI_UX_BASELINE==='1',out='artifacts/audit/inspector-mobile-ux';
await mkdir(out,{recursive:true});
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=await preview({preview:{host:'127.0.0.1',port:3047,strictPort:true,headers}});
const browser=await chromium.launch({headless:true,executablePath:process.env.PSI_CHROMIUM_PATH});
const results=[];
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'}),page=await context.newPage(),ops=[],errors=[];
  const id='a1000000-0000-4000-8000-000000000001';let item,photo,bytes,failSave=false;
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==base)return route.fulfill({body:'',contentType:'text/css'});
   if(u.pathname==='/api/admin/auth')return route.fulfill({json:{ok:true,authenticated:true}});
   if(u.pathname==='/__fixture-photo')return route.fulfill({body:bytes,contentType:'image/jpeg'});
   if(u.pathname==='/api/admin/inspector'){
    const b=route.request().postDataJSON();ops.push(b.op);const result={ok:true};
    if(b.op==='ai-status')Object.assign(result,{ready:true,cost:{allowed:true,policy:'free-only',state:'free-project',billingCheck:'verified'}});
    else if(b.op==='create'){item={id:b.id,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),document:{title:'사진 현장점검',siteName:'',location:'',workType:'',eventAt:new Date().toISOString(),notes:'',photoNotes:{},urgent:false,apiEnabled:true,photoIds:[],analyses:{},reviews:{},actions:[],ocrResults:{}}};result.item=item;}
    else if(b.op==='upload'){bytes=Buffer.from(b.base64,'base64');photo={id:b.photoId,inspection_id:item.id,sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString(),optimization_receipt:b.optimizationReceipt};result.photo=photo;}
    else if(b.op==='save'){if(failSave)return route.fulfill({status:503,json:{ok:false,message:'합성 저장 실패'}});assert.equal(b.expectedRevision,item.revision);item={...item,revision:item.revision+1,document:structuredClone(b.document)};result.item=item;}
    else if(b.op==='detail')Object.assign(result,{item,evidence:[photo],control:{state:'active'}});
    else if(b.op==='photo')result.url=base+'/__fixture-photo';
    else if(b.op==='report')result.report={id,inspection_id:item.id,inspection_revision:item.revision,created_at:new Date().toISOString(),snapshot_sha256:'fixture-only',snapshot:{inspection:structuredClone(item),evidence:[photo],generatedAt:new Date().toISOString(),legalStatus:'UNVERIFIED',reportStatus:'DRAFT'}};
    else if(['list','reports','events'].includes(b.op))result.items=[];
    else if(b.op==='usage')result.usage={projectBytes:100,uploadCeilingBytes:900000000};
    else throw Error('Unexpected API operation '+b.op);
    return route.fulfill({json:result});
   }
   if(u.pathname.startsWith('/api/'))throw Error('Unexpected API '+u.pathname);
   return route.continue();
  });
  await page.goto(base+'/inspector',{waitUntil:'domcontentloaded'});await page.locator('.si-quick').waitFor();
  const camera=page.getByRole('button',{name:'사진 찍고 점검하기',exact:true});
  const initialCamera=await camera.boundingBox(),records=await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).boundingBox();
  await page.screenshot({path:`${out}/${baseline?'before':'after'}-${width}.png`,fullPage:true});
  if(baseline){results.push({width,camera:initialCamera,records});await context.close();continue;}
  assert.ok(initialCamera.y+initialCamera.height<=844,'camera must be visible without scrolling at '+width);
  assert.ok(records.y+records.height<=844,'records must be visible at '+width);
  assert.equal(await camera.count(),1);assert.ok(initialCamera.height>=44&&records.height>=44);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  // The existing control is visible without opening cost/operator settings.
  const mode=page.getByRole('switch');await mode.scrollIntoViewIfNeeded();assert.equal(await mode.count(),1);await mode.click();await mode.getByText('AI 없는 점검', {exact:false}).waitFor();
  await page.locator('.si-photo-hint summary').click();const note=page.locator('#si-quick-note');await note.fill('직접 확인한 개구부 덮개 누락');
  const dismiss=async dialog=>dialog.dismiss();page.on('dialog',dismiss);
  await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();assert.equal(await note.inputValue(),'직접 확인한 개구부 덮개 누락');
  await page.locator('.inspector-standalone-navigation summary').click();
  await page.getByRole('button',{name:'사진점검에서 로그아웃',exact:true}).click();assert.equal(await note.inputValue(),'직접 확인한 개구부 덮개 누락');
  await page.locator('.inspector-standalone-navigation summary').click();page.off('dialog',dismiss);
  const source=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
  await page.getByLabel('현장사진 선택',{exact:true}).setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:source});await page.locator('.si-quick-consent input').check();
  failSave=true;await page.locator('.si-quick-start').click();await page.getByRole('alert').waitFor();assert.equal(await note.inputValue(),'직접 확인한 개구부 덮개 누락');
  failSave=false;await page.locator('.si-quick-start').click();await page.locator('.si-quick-result').waitFor();
  assert.equal(ops.filter(x=>x==='upload').length,1,'retry must not duplicate photo');assert.equal(ops.includes('analyze-photo'),false);assert.equal(item.document.apiEnabled,false);assert.equal(item.document.photoNotes[photo.id],'직접 확인한 개구부 덮개 누락');
  await page.getByRole('tab',{name:'법령·금액',exact:true}).click();const status=page.locator('.si-legal-focus .si-source-status summary');await status.waitFor();assert.match(await status.innerText(),/공개일:.*검토일:/);assert.equal(await page.locator('.si-legal-focus .si-source-status').getAttribute('open'),null);
  await page.locator('.si-topic-manual summary').click();await page.getByLabel('직접 대조할 기준',{exact:true}).selectOption('electric');assert.equal(await page.getByLabel('직접 대조할 기준',{exact:true}).inputValue(),'electric');assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);
  await page.locator('.si-legal-focus').screenshot({path:`${out}/source-${width}.png`});
  await page.getByRole('tab',{name:/^사례·동향/}).click();await page.locator('.si-case-trends').waitFor();
  await page.getByRole('region',{name:'점검 다음 단계'}).getByRole('button',{name:'직접 확인한 조치 작성',exact:true}).click();
  const draft=page.locator('.si-action-draft');await draft.waitFor();assert.match(await draft.locator('.si-action-timing').innerText(),/긴급 위험.*[\s\S]*기한부 시정조치/);
  const owner=draft.getByLabel('담당자·공종',{exact:true});await draft.getByLabel('현장에 요청할 조치',{exact:true}).fill('개구부 접근통제 후 덮개 보강');await owner.fill('합성 형틀반장');await draft.getByLabel('완료기한',{exact:true}).fill('2026-10-30');
  page.on('dialog',dismiss);await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();assert.equal(await owner.inputValue(),'합성 형틀반장');
  await page.locator('.inspector-standalone-navigation summary').click();await page.getByRole('button',{name:'사진점검에서 로그아웃',exact:true}).click();assert.equal(await owner.inputValue(),'합성 형틀반장');await page.locator('.inspector-standalone-navigation summary').click();page.off('dialog',dismiss);
  await draft.getByLabel('선택한 사진의 실제 위치·상태와 조치 적용 범위를 확인했습니다.',{exact:true}).check();
  await draft.locator('.si-action-timing').screenshot({path:`${out}/action-timing-${width}.png`});
  failSave=true;await draft.getByRole('button',{name:'확인한 조치 저장',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await owner.inputValue(),'합성 형틀반장');
  failSave=false;await draft.getByRole('button',{name:'확인한 조치 저장',exact:true}).click();await page.getByText('조치를 미조치 상태로 저장했습니다.',{exact:false}).waitFor();assert.equal(item.document.actions.length,1);assert.equal(item.document.actions[0].status,'open');assert.equal(item.document.photoRiskTopics[photo.id],'electric');
  await page.getByRole('button',{name:'모은 자료로 보고서 완성',exact:true}).last().click();await page.locator('.si-report').waitFor();assert.match(await page.locator('.si-report').innerText(),/직접 확인한 개구부 덮개 누락/);assert.match(await page.locator('.si-report').innerText(),/합성 형틀반장/);assert.match(await page.locator('.si-report').innerText(),/점검자 선택 위험:.*AI 판정 아님/);
  await page.reload({waitUntil:'domcontentloaded'});const resume=page.getByRole('button',{name:'이전 점검 이어하기',exact:true});await resume.waitFor();await page.evaluate(()=>scrollTo(0,0));const resumeBox=await resume.boundingBox();assert.ok(resumeBox.y+resumeBox.height<=844);await resume.click();await page.locator('.si-storage-manager').waitFor();assert.equal(item.document.photoIds[0],photo.id);assert.equal(ops.filter(x=>x==='create').length,1);assert.equal(ops.filter(x=>x==='report').length,1);
  await page.locator('.si-photo-collection').getByRole('button',{name:'열어 검토',exact:true}).first().click();await page.getByRole('tab',{name:'법령·금액',exact:true}).click();await page.locator('.si-topic-manual summary').click();assert.equal(await page.getByLabel('직접 대조할 기준',{exact:true}).inputValue(),'electric');
  assert.deepEqual(errors,[]);results.push({width,camera:initialCamera,records,ops,passed:true});await context.close();
 }
 await writeFile(out+`/${baseline?'before':'results'}.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
