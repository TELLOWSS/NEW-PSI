import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const externalBase=process.env.PSI_HISTORY_BASE,base=externalBase||'http://127.0.0.1:3033',out=process.env.PSI_HISTORY_OUT||'artifacts/audit/inspector-history';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=externalBase?null:await preview({preview:{port:3033,host:'127.0.0.1',strictPort:true,headers}});
let proxy;if(externalBase&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)){const u=new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);proxy={server:u.protocol+'//'+u.host,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,...(proxy?{proxy}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results=[];await mkdir(out,{recursive:true});
try{
 for(const scenario of ['browse','cancel','all-busy','resume','files-all','conflict','status-failed','response-lost','dirty','active-all','active-files','active-other','bulk-pick','bulk-all','bulk-conflict']){
  console.log('START '+scenario);
  const context=await browser.newContext({viewport:{width:390,height:900},ignoreHTTPSErrors:!!externalBase,reducedMotion:'reduce'}),page=await context.newPage();
  await page.clock.install({time:new Date('2026-10-23T05:00:00Z')});
  const errors=[],ops=[],requests=[];page.on('pageerror',e=>errors.push(e.message));let cancel=false;page.on('dialog',d=>cancel?d.dismiss():d.accept());
  const ids=Array.from({length:4},()=>randomUUID()),key='psi.inspector.record-deletions.v1';
  const row=(i)=>({id:ids[i],revision:3,title:`합성 점검 ${i+1}`,work_type:i===1?'철근':'형틀',location:`합성 구역 ${i+1}`,urgent:i===1,open_actions:i===2?2:0,needs_review:i===0,created_at:`2026-10-${23-i}T00:00:00Z`,updated_at:`2026-10-${20+i}T00:00:00Z`});
  let rows=ids.map((_,i)=>row(i)),state='active',mode=null,verified=false,verifyAfter=null,failStatus=scenario==='status-failed',lost=false,deleteCalls=0,release;
  const bulkMode=scenario.startsWith('bulk-'),bulkDeleted=new Set();
  const status=()=>({state,mode,verified,verifyAfter,remainingFiles:state==='active'?1:0,remainingBytes:state==='active'?120000:0,remainingRecords:{inspections:state==='purged'?0:1,evidence:state==='purged'?0:1,reports:state==='purged'?0:1,events:state==='purged'?0:3,operations:0},pendingOperations:0,checkedAt:new Date().toISOString(),receipt:verified?{mode,managedResidualFiles:0}:null});
  const doc={title:rows[0].title,siteName:'',location:'',workType:'',eventAt:'2026-10-23T00:00:00Z',notes:'合成 QA',urgent:false,photoIds:[],analyses:{},reviews:{},actions:[],ocrResults:{}};
  const item={id:ids[0],revision:3,document:doc,created_at:rows[0].created_at,updated_at:rows[0].updated_at};
  await page.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.pathname==='/__qa-korean.otf')return r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'});
   if(u.origin!==base)return r.fulfill({body:'',contentType:'text/css'});
   if(u.pathname==='/api/admin/auth')return r.fulfill({json:{ok:true,authenticated:true}});
   if(u.pathname!=='/api/admin/inspector')return r.continue();
   const b=r.request().postDataJSON();ops.push(b.op);requests.push(b);
   if(b.op==='list')return r.fulfill({json:{ok:true,items:rows.filter(x=>b.before?x.id===ids[3]:x.id!==ids[3]),hasMore:!b.before,nextCursor:b.before?null:{before:row(2).created_at,beforeId:ids[2]}}});
   if(b.op==='detail')return r.fulfill({json:{ok:true,item:{...item,id:b.id,document:{...doc,title:row(ids.indexOf(b.id)).title}},evidence:[],reports:[{id:randomUUID(),inspection_revision:3,created_at:item.created_at}],events:[],control:{state:'active'}}});
   if(b.op==='ai-status')return r.fulfill({json:{ok:true,ready:false,provider:'',model:''}});
   if(b.op==='usage')return r.fulfill({json:{ok:true,usage:{projectBytes:500000,databaseBytes:100000}}});
   if(!bulkMode)assert.equal(b.id,ids[0]);
   if(b.op==='deletion-status'){
     if(bulkMode){const ok=bulkDeleted.has(b.id);return r.fulfill({json:{ok:true,status:{...status(),state:ok?'purged':'active',mode:ok?'all':null,verified:ok,remainingFiles:ok?0:1,remainingRecords:{inspections:ok?0:1,evidence:ok?0:1,reports:ok?0:1,events:ok?0:3,operations:0}}}});}
    if(failStatus||lost)return r.fulfill({status:503,json:{ok:false,message:'삭제 상태 연결 실패 · 완료 아님'}});
    return r.fulfill({json:{ok:true,status:status()}});
   }
   if(b.op==='delete-inspection'){
    deleteCalls++;assert.equal(b.confirmation,bulkMode?b.id:ids[0]);assert.equal(b.expectedRevision,3);
     if(bulkMode){if(scenario==='bulk-conflict'&&b.id===ids[1])return r.fulfill({status:409,json:{ok:false,message:'기록 버전 변경'}});bulkDeleted.add(b.id);rows=rows.filter(x=>x.id!==b.id);return r.fulfill({json:{ok:true,status:{...status(),state:'purged',mode:'all',verified:true,remainingFiles:0,remainingRecords:{inspections:0,evidence:0,reports:0,events:0,operations:0}}}});}
    if(scenario==='conflict')return r.fulfill({status:409,json:{ok:false,message:'다른 변경사항이 있습니다. 목록을 새로고침하세요.'}});
    if(scenario==='all-busy')await new Promise(resolve=>{release=resolve;});
    mode=b.mode;
    if(scenario==='resume'&&deleteCalls===1){state='deleting';verifyAfter='2026-10-23T05:02:00Z';return r.fulfill({status:409,json:{ok:false,message:'기존 링크 만료 대기 · 아직 미완료'}});}
    state=mode==='all'?'purged':'files-deleted';verified=true;verifyAfter=null;if(mode==='all')rows=rows.filter(x=>x.id!==ids[0]);
    if(scenario==='response-lost'){lost=true;return r.fulfill({status:503,json:{ok:false,message:'삭제 응답 유실'}});}
    return r.fulfill({json:{ok:true,receipt:status().receipt,status:status()}});
   }
   errors.push('Unexpected business operation '+b.op);return r.fulfill({status:503,json:{ok:false,message:'QA mutation blocked'}});
  });
  const enter=async()=>{await page.goto(base+'/?mode=photo-inspector');await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();await page.getByLabel('점검 기록 목록',{exact:true}).getByRole('button',{name:'합성 점검 2 기록 삭제',exact:true}).waitFor();};
  const list=page.getByLabel('점검 기록 목록',{exact:true});
  const openDelete=async()=>{await list.getByRole('button',{name:'합성 점검 1 기록 삭제',exact:true}).click();await page.getByRole('dialog',{name:'선택한 기록 삭제'}).waitFor();};
  const dialog=page.getByRole('dialog',{name:'선택한 기록 삭제'});
  const start=async()=>{await dialog.getByLabel('이 점검에 포함된 자료가 삭제되고 되돌릴 수 없음을 확인했습니다.').check();await dialog.getByRole('button',{name:'선택 범위 삭제 시작',exact:true}).click();};
  await enter();
  const recordTitleSize=await list.locator('.si-record strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  const recordStateSize=await list.locator('.si-record-state').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(recordTitleSize>=15&&recordStateSize>=12,'record titles and status stay readable');
  if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
  if(bulkMode){
    await list.getByRole('button',{name:'여러 건 선택'}).click();
    if(scenario==='bulk-all'){
      await list.getByRole('button',{name:'전체 보관기록 불러와 선택'}).click();
      await list.getByRole('button',{name:'선택 4건 삭제'}).waitFor();
      assert.equal(await list.locator('.si-record-row').count(),4);
    }else{
      await list.getByLabel('합성 점검 1 선택').check();
      await list.getByLabel('합성 점검 2 선택').check();
    }
    const count=scenario==='bulk-all'?4:2;
    await list.getByRole('button',{name:'선택 '+count+'건 삭제'}).click();
    const modal=page.getByRole('dialog',{name:'선택 기록 일괄 정리'});
    await modal.waitFor();
    assert.equal(deleteCalls,0,'selection is harmless');
    assert.equal(await modal.getByRole('button',{name:'선택한 '+count+'건 전체 삭제 시작'}).isDisabled(),true);
    await modal.locator('input[type=checkbox]').check();
    await modal.getByRole('button',{name:'선택한 '+count+'건 전체 삭제 시작'}).click();
    await page.waitForFunction(({count,conflict})=>document.querySelectorAll('.si-bulk-record.is-done').length>=(conflict?count-1:count),{count,conflict:scenario==='bulk-conflict'});
    assert.equal(deleteCalls,count);
    assert.equal(await list.locator('.si-record-row').count(),scenario==='bulk-all'?0:scenario==='bulk-conflict'?2:1);
    if(scenario==='bulk-conflict'){
      // Each record is processed sequentially; the successful record can render
      // before the conflicting record's status request and failed badge complete.
      await modal.locator('.si-bulk-record.is-failed').waitFor({state:'visible'});
      assert.equal(await modal.locator('.si-bulk-record.is-failed').count(),1);
      assert.notEqual(await page.evaluate(()=>sessionStorage.getItem('psi.inspector.record-deletions.v1')),null);
    }else assert.equal(await page.evaluate(()=>sessionStorage.getItem('psi.inspector.record-deletions.v1')),null);
    await modal.getByRole('button',{name:'닫기',exact:true}).click();
   }else if(scenario==='browse'){
   assert.equal(await list.locator('.si-record-row').count(),3);assert.equal(ops.filter(x=>x==='list').length,1);
   await page.getByLabel('점검 기록 정렬').selectOption('attention');assert.match(await list.locator('.si-record strong').first().innerText(),/점검 2/);
   await page.getByLabel('불러온 점검 검색').fill('철근');assert.equal(await list.locator('.si-record-row').count(),1);
   await page.getByLabel('불러온 점검 검색').fill('없음');assert.equal(await list.locator('.si-record-row').count(),0);
   await list.getByRole('button',{name:'필터 초기화'}).click();await list.getByRole('button',{name:'이전 점검 더 보기'}).click();await page.waitForFunction(()=>document.querySelectorAll('.si-record-row').length===4);
   assert.equal(requests.find(x=>x.before)?.beforeId,ids[2]);await page.getByLabel('점검 기록 정렬').selectOption('updated');assert.match(await list.locator('.si-record strong').first().innerText(),/점검 4/);
   assert.ok((scenario.startsWith('active-')||!ops.includes('detail'))&&!ops.includes('photo'));
  }else if(scenario==='dirty'){
   await list.locator('.si-record').first().click();await page.getByText('현장 공통정보 · 선택 입력',{exact:true}).click();await page.getByLabel('점검명',{exact:true}).fill('저장 전 수정');assert.equal(await list.getByRole('button',{name:'합성 점검 1 기록 삭제'}).isDisabled(),true);assert.equal(deleteCalls,0);await page.getByLabel('점검명',{exact:true}).fill(doc.title);
  }else{
   if(scenario.startsWith('active-')){await list.locator('.si-record').nth(scenario==='active-other'?1:0).click();await page.getByRole('heading',{name:'사진과 점검자 설명',exact:true}).waitFor();}
   await openDelete();
   if(scenario==='status-failed'){
    await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('button',{name:'선택 범위 삭제 시작'}).count(),0);failStatus=false;await dialog.getByRole('button',{name:'보관·삭제 상태 다시 확인'}).click();await dialog.getByRole('heading',{name:'현재 보관 상태'}).waitFor();
   }else await dialog.getByRole('heading',{name:'현재 보관 상태'}).waitFor();
   assert.equal(await dialog.getByRole('button',{name:'선택 범위 삭제 시작'}).isDisabled(),true);
   if(scenario==='status-failed'){await page.screenshot({path:out+'/history-delete-mobile.png',fullPage:true});assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);}
   if(scenario==='cancel'){
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();await openDelete();await dialog.getByRole('heading',{name:'현재 보관 상태'}).waitFor();cancel=true;await start();assert.equal(deleteCalls,0);cancel=false;await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('psi.inspector.record-deletions.v1')),null);
   }else{
    if(scenario==='files-all'||scenario==='active-files')await dialog.locator('select').selectOption('files');
    await start();
    if(scenario==='all-busy'){
     await page.waitForFunction(()=>document.querySelector('.si-record-delete-dialog header button')?.disabled);assert.equal(await dialog.getByRole('button',{name:'닫기',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await dialog.count(),1);release();
    }
    if(scenario==='conflict'){
     await dialog.getByRole('alert').waitFor();assert.equal(await list.locator('.si-record-row').count(),3);assert.equal(await dialog.getByRole('heading',{name:'선택 범위 삭제 검증 완료'}).count(),0);await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    }else if(scenario==='resume'){
     await dialog.getByRole('heading',{name:'삭제 진행 · 아직 완료 아님'}).waitFor();assert.equal(await list.locator('.si-record-row').count(),3);await dialog.getByRole('button',{name:'닫기',exact:true}).click();await page.clock.fastForward(121000);assert.equal(deleteCalls,1);
     await enter();await list.getByRole('button',{name:'삭제 상태 확인 · '+ids[0].slice(0,8).toUpperCase(),exact:true}).click();await dialog.getByRole('heading',{name:'삭제 진행 · 아직 완료 아님'}).waitFor();assert.equal(deleteCalls,1);await dialog.getByRole('button',{name:'남은 삭제 마무리',exact:true}).click();await dialog.getByRole('heading',{name:'선택 범위 삭제 검증 완료'}).waitFor();
    }else if(scenario==='response-lost'){
     await dialog.getByRole('alert').waitFor();assert.equal(await list.locator('.si-record-row').count(),3);assert.equal(await dialog.getByRole('heading',{name:'선택 범위 삭제 검증 완료'}).count(),0);await dialog.getByRole('button',{name:'닫기',exact:true}).click();lost=false;await enter();await list.getByRole('button',{name:'삭제 상태 확인 · '+ids[0].slice(0,8).toUpperCase(),exact:true}).click();await dialog.getByRole('heading',{name:'선택 범위 삭제 검증 완료'}).waitFor();assert.equal(deleteCalls,1);
    }else await dialog.getByRole('heading',{name:'선택 범위 삭제 검증 완료'}).waitFor();
    if(scenario==='active-other')assert.equal(await page.locator('.si-document-identity h2').innerText(),'합성 점검 2');
    if(scenario==='active-all')assert.equal(await page.locator('.si-document-identity').count(),0);
    if(scenario==='active-files'){assert.equal(await list.locator('.si-record-row').count(),3);assert.equal(await page.locator('.si-document-identity h2').innerText(),'합성 점검 1');await page.getByText('고정 보관한 보고서 · 최근 1개',{exact:true}).waitFor({state:'attached'});}
    if(scenario==='files-all'){
     assert.equal(await list.locator('.si-record-row').count(),3);assert.equal(await dialog.locator('select').inputValue(),'all');assert.equal(await dialog.getByRole('button',{name:'선택 범위 삭제 시작'}).isDisabled(),true);await start();await page.waitForFunction(()=>document.querySelectorAll('.si-record-row').length===2);assert.equal(deleteCalls,2);
    }
    if(scenario!=='conflict'){
     assert.equal(await list.locator('.si-record-row').count(),scenario==='active-files'?3:2);assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key),null);
     const downloadEvent=page.waitForEvent('download');await dialog.getByRole('button',{name:'삭제 검증서 저장'}).click();const download=await downloadEvent;const receipt=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(receipt.inspectionId,ids[0]);assert.equal(receipt.status.verified,true);assert.equal(receipt.status.remainingRecords.inspections,scenario==='active-files'?1:0);
     await dialog.getByRole('button',{name:'닫기',exact:true}).click();if(scenario!=='active-files')assert.equal(await page.getByLabel('불러온 점검 검색').evaluate(el=>document.activeElement===el),true);
    }
   }
   assert.ok((scenario.startsWith('active-')||!ops.includes('detail'))&&!ops.includes('photo'));
  }
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  if(scenario==='browse')await page.screenshot({path:out+'/history-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.ok(!ops.some(x=>['analyze-photo','save','upload','report','create'].includes(x)));results.push({scenario,status:'PASS',deleteCalls,pageErrors:errors.length});console.log('PASS '+scenario);await context.close();
 }
 await writeFile(out+'/simulation.json',JSON.stringify({status:'PASS',externalFrontend:!!externalBase,results},null,2));console.log(JSON.stringify({status:'PASS',scenarios:results.length}));
}catch(e){for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
