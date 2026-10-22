import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const externalBase=process.env.PSI_QUEUE_BASE,base=externalBase||'http://127.0.0.1:3032';
const server=externalBase?null:await preview({...(process.env.PSI_QUEUE_DIST?{build:{outDir:process.env.PSI_QUEUE_DIST}}:{}),preview:{port:3032,host:'127.0.0.1',headers}});
let proxy;
if(externalBase&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)){const u=new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);proxy={server:u.protocol+'//'+u.host,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch({headless:true,executablePath:process.env.PSI_CHROMIUM_PATH,...(proxy?{proxy}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const out='artifacts/audit/inspector-queue';await mkdir(out,{recursive:true});
const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write'],ignoreHTTPSErrors:!!externalBase}),page=await context.newPage();
const ops=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const id=randomUUID(),photoIds=Array.from({length:16},()=>randomUUID()),doc={title:'합성자료 · 점검 작업목록 QA',siteName:'',location:'',workType:'',eventAt:'2026-10-23T00:00:00Z',notes:'실제 현장 아님',urgent:false,photoIds,photoNotes:{},analyses:{},reviews:{},actions:[],ocrResults:{}};
await page.clock.install({time:new Date('2026-10-23T03:00:00Z')});
const pictures=await page.evaluate(()=>Array.from({length:16},(_,i)=>{const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle=`rgb(${80+i*6},110,130)`;g.fillRect(0,0,400,300);g.fillStyle='white';g.font='24px sans-serif';g.fillText('SYNTHETIC QA '+(i+1),35,150);return c.toDataURL('image/jpeg').split(',')[1];}));
const images=new Map(photoIds.map((id,i)=>[id,Buffer.from(pictures[i],'base64')]));
const evidence=photoIds.map((photoId,i)=>({id:photoId,inspection_id:id,sha256:createHash('sha256').update(images.get(photoId)).digest('hex'),mime_type:'image/jpeg',byte_size:images.get(photoId).length,created_at:'2026-10-23T00:00:00Z'}));
photoIds.forEach((photoId,i)=>{doc.photoNotes[photoId]=`합성 사진 ${i+1}`;if(i<10){doc.analyses[photoId]={schema_version:'1.1',inspection_id:id,photo_id:photoId,source_photo_sha256:evidence[i].sha256,processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'합성 도형',visual_basis:'중앙',confidence:'high'}],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[],law_candidate_keywords:[],limitations:['실제 현장 아님']};if(i>=2)doc.reviews[photoId]={decision:i===2?'rejected':'accepted',note:'합성자료 검토 기록'};}});
doc.actions=Array.from({length:8},(_,i)=>({id:randomUUID(),title:`합성 조치 ${i+1}`,owner:i%2?'비계반장':'형틀반장',dueDate:i===0||i===2||i===4||i===7?'2026-10-22':i===1?'2026-10-23':'2026-10-25',status:i===2||i===3?'review-requested':i===4||i===7?'verified':'open',completionPhotoId:i===2?photoIds[12]:i===3?photoIds[13]:i===4?photoIds[14]:i===7?photoIds[15]:'',sourcePhotoIds:[photoIds[3]],note:i===2||i===3?'합성 개선 기록':'',...(i===4||i===7?{verifiedAt:'2026-10-23T00:00:00Z'}:{})}));
const item={id,revision:10,document:doc,created_at:'2026-10-23T00:00:00Z',updated_at:'2026-10-23T00:00:00Z'},before=JSON.stringify(item);
await context.addInitScript(id=>sessionStorage.setItem('psi.inspector.quick.last.v1',id),id);
await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.pathname==='/__qa-font')return r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'});if(u.origin!==base)return r.fulfill({body:'',contentType:'text/css'});if(u.pathname.startsWith('/__photo/'))return r.fulfill({body:images.get(u.pathname.split('/').pop()),contentType:'image/jpeg'});if(u.pathname==='/api/admin/auth')return r.fulfill({json:{ok:true,authenticated:true}});if(u.pathname==='/api/admin/inspector'){const b=r.request().postDataJSON();ops.push(b.op);if(b.op==='ai-status')return r.fulfill({json:{ok:true,ready:false,provider:'',model:''}});if(b.op==='detail')return r.fulfill({json:{ok:true,item,evidence,reports:[],control:{state:'active'}}});if(b.op==='photo')return r.fulfill({json:{ok:true,url:base+'/__photo/'+b.photoId}});errors.push('Unexpected operation '+b.op);return r.fulfill({status:503,json:{ok:false,message:'Mutation blocked in queue QA'}});}return r.continue();});
try{
    await page.goto(base+'/?mode=photo-inspector');await page.getByRole('button',{name:'이전 점검 이어하기',exact:true}).click();
    if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-font')} body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
    await page.getByRole('button',{name:'검토 대기 사진 1부터 이어보기',exact:true}).waitFor();
    const collection=page.getByRole('region',{name:'모은 사진과 보고서'}),photos=page.getByRole('group',{name:'모은 사진 분류'});
    await collection.locator('details>summary').first().click();
    assert.equal(await collection.locator('ol li').count(),5);
    await collection.getByRole('button',{name:'다음 사진 목록',exact:true}).click();assert.equal(await collection.locator('ol li .si-collected-index').first().innerText(),'6');
    await photos.getByRole('button',{name:'개선 증빙 4',exact:true}).click();assert.equal(await collection.locator('ol li').count(),4);assert.ok((await collection.innerText()).includes('연결된 개선 증빙'));
    await photos.getByRole('button',{name:'AI 검토 대기 2',exact:true}).click();assert.equal(await collection.locator('ol li').count(),2);
    const planner=page.locator('.si-action-planner');await planner.locator(':scope > summary').click();await planner.getByRole('button',{name:'등록 조치 8',exact:true}).click();
    const filters=page.getByRole('group',{name:'등록 조치 분류'});
    await filters.getByRole('button',{name:'기한 지남 2',exact:true}).click();assert.equal(await planner.locator('.si-registered-actions>section').count(),2);
    await page.getByLabel('조치·담당 검색',{exact:true}).fill('형틀');assert.equal(await planner.locator('.si-registered-actions>section').count(),2);
    await planner.getByRole('button',{name:'분류한 미결 요청문 복사',exact:true}).click();const text=await page.evaluate(()=>navigator.clipboard.readText());assert.match(text,/합성 조치 1/);assert.match(text,/합성 조치 3/);assert.doesNotMatch(text,/합성 조치 5|비계반장/);
    await planner.getByRole('button',{name:'분류한 미결 보내기',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.match(await dialog.locator('textarea').inputValue(),/합성 조치 3/);await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    await page.getByLabel('조치·담당 검색',{exact:true}).fill('없는 담당');await planner.getByText('분류·검색에 맞는 조치가 없습니다.',{exact:false}).waitFor();await planner.getByRole('button',{name:'전체 조치로 돌아가기',exact:true}).click();
    assert.equal(await planner.locator('.si-registered-actions>section').count(),3);
    await page.getByLabel('목록 순서',{exact:true}).selectOption('due');assert.equal(await planner.locator('.si-registered-actions>section h3').first().innerText(),'합성 조치 1');
    const action=planner.locator('.si-registered-actions>section').first();await action.locator('.si-action-followup>summary').click();await action.getByLabel('실제 개선 내용 (5자 이상)',{exact:true}).fill('저장 전 입력 보존 시험');
    page.once('dialog',d=>d.dismiss());await filters.getByRole('button',{name:'재점검 확인 2',exact:true}).click();assert.equal(await action.getByLabel('실제 개선 내용 (5자 이상)',{exact:true}).inputValue(),'저장 전 입력 보존 시험');
    await page.clock.fastForward(24*60*60*1000);assert.match(await planner.innerText(),/기준일 2026-10-23/);
    page.once('dialog',d=>d.accept());await filters.getByRole('button',{name:'재점검 확인 2',exact:true}).click();assert.equal(await planner.locator('.si-registered-actions>section').count(),2);
    assert.equal(await planner.getByRole('button',{name:'분류한 미결 요청문 복사',exact:true}).count(),0);
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.si-work-summary').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/queue-${width}.png`,fullPage:true});await filters.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/actions-${width}.png`,fullPage:true});}
    await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.waitForTimeout(250);console.log('DARK',await page.locator('.si-queue-filters button').last().evaluate(e=>({root:document.documentElement.className,background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})));await page.screenshot({path:out+'/queue-dark.png',fullPage:true});
    await page.getByRole('button',{name:'검토 대기 사진 1부터 이어보기',exact:true}).click();await page.getByRole('heading',{name:'사진 분석과 관련 기준',exact:true}).waitFor();
    assert.equal(JSON.stringify(item),before);assert.ok(ops.every(op=>['ai-status','detail','photo'].includes(op)));assert.deepEqual(errors,[]);
    const proof={status:'PASS',fixtureBusinessApi:true,syntheticPhotos:16,actions:8,viewports:[320,390,768,1440],checks:['photo classification/pagination','next pending without analysis','overdue excludes today/verified','owner search','filtered copy/share preview','sort','empty/reset','dirty discard cancellation','midnight freezes editing list','verified not dispatched'],ops,paidAiCalls:0,businessMutations:0};await writeFile(out+'/verification.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}catch(cause){await page.screenshot({path:out+'/failure.png',fullPage:true});console.error(JSON.stringify({errors}));throw cause;
}finally{await context.close();await browser.close();if(server)await new Promise(r=>server.httpServer.close(r));}
