import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {legalForInspection} from '../lib/inspector/legal.ts';
const built=process.env.PSI_QA_BUILT==='1',port=3024,base=`http://127.0.0.1:${port}`,out='artifacts/audit/inspector-quick';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=built?await preview({preview:{port,host:'127.0.0.1',strictPort:true,headers}}):await createServer({server:{port,host:'127.0.0.1',strictPort:true,headers}});if(!built)await server.listen();
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const results=[];await mkdir(out,{recursive:true});
try{
 for(const scenario of ['camera-ai','paste-ai','ai-off','api-unavailable','api-retry','report-retry','text-only']){
    const context=await browser.newContext({viewport:{width:390,height:900},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();const ops=[],errors=[],images=new Map();let item,evidence=[],reports=[],analyzeCalls=0,reportCalls=0;
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    if(process.env.PSI_QA_KOREAN_FONT)await page.route('**/__qa-korean.otf',async r=>r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'}));
    await page.route('**/__photo/*',r=>r.fulfill({body:images.get(r.request().url().split('/').pop()),contentType:'image/jpeg'}));
    const bump=d=>(item={...item,revision:item.revision+1,document:structuredClone(d),updated_at:new Date().toISOString()});
    await page.route('**/api/admin/inspector',async r=>{try{const b=r.request().postDataJSON();ops.push(b.op);const result={ok:true};
        if(b.op==='ai-status')Object.assign(result,{ready:scenario!=='api-unavailable',provider:'gemini',model:'fixture'});
        else if(b.op==='create'){assert.equal(item,undefined);item={id:b.id,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),document:{title:'새 현장점검',siteName:'',location:'',workType:'',eventAt:'2026-10-20T00:00:00Z',notes:'',urgent:false,photoIds:[],analyses:{},reviews:{},actions:[],ocrResults:{}}};result.item=item;}
        else if(b.op==='upload'){assert.equal(b.uploadConfirmed,true);const bytes=Buffer.from(b.base64,'base64'),sha=createHash('sha256').update(bytes).digest('hex');assert.equal(sha,b.optimizationReceipt.uploaded_asset_sha256);assert.ok(bytes.length<=3*1024*1024);const photo={id:b.photoId,inspection_id:item.id,sha256:sha,mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString(),optimization_receipt:b.optimizationReceipt};images.set(photo.id,bytes);evidence.push(photo);result.photo=photo;}
        else if(b.op==='save'){assert.equal(b.expectedRevision,item.revision);result.item=bump(b.document);}
        else if(b.op==='analyze-photo'){analyzeCalls++;assert.equal(b.expectedRevision,item.revision);assert.equal(b.externalConfirmed,true);assert.equal(item.document.apiEnabled,true);assert.equal(item.document.photoNotes[b.photoId],'3층 개구부 덮개 없음');if(scenario==='api-retry'&&analyzeCalls===1){await r.fulfill({status:503,json:{ok:false,message:'분석 연결 실패. 직접 다시 시도해 주세요.'}});return;}const p=evidence.find(p=>p.id===b.photoId),d=structuredClone(item.document);d.analyses[p.id]={schema_version:'1.1',inspection_id:item.id,photo_id:p.id,source_photo_sha256:p.sha256,processing_mode:'PAID_API_APPROVED',observed_facts:[{text:'바닥 개구부와 주변 통로가 보입니다.',visual_basis:'사진 중앙',confidence:'medium'}],ai_hypotheses:[{text:'아래층 추락 가능성',reason:'깊이를 판독할 수 없음'}],requires_confirmation:[{question:'실제 단차 높이는?',why:'사진으로 측정 불가'}],recommended_controls:[{action:'개구부 주변 접근을 통제하세요.',priority:'immediate'}],law_candidate_keywords:['개구부'],limitations:['높이·고정 강도는 현장 확인 필요']};result.item=bump(d);}
        else if(b.op==='confirm-photo'){assert.equal(b.expectedRevision,item.revision);const d=structuredClone(item.document);assert.ok(d.analyses[b.photoId]);d.reviews[b.photoId]={decision:'accepted',note:'사진·설명·결과 대조',confirmedAt:new Date().toISOString(),actor:'dedicated-admin'};result.item=bump(d);}
        else if(b.op==='complete-materials'){assert.equal(b.expectedRevision,item.revision);const d=structuredClone(item.document);assert.ok(d.photoIds.every(id=>d.reviews[id]?.decision==='accepted'));d.materialCompletion={revision:item.revision+1,photoIds:d.photoIds,completedAt:new Date().toISOString()};result.item=bump(d);}
        else if(b.op==='report'){assert.equal(b.expectedRevision,item.revision);reportCalls++;if(scenario==='report-retry'&&reportCalls===1){await r.fulfill({status:503,json:{ok:false,message:'보고서 저장 실패. 다시 저장해 주세요.'}});return;}const snapshot={inspection:structuredClone(item),evidence:structuredClone(evidence),legalReference:legalForInspection(item.document),legalStatus:'UNVERIFIED',reportStatus:'DRAFT',generatedAt:new Date().toISOString()};const report={id:randomUUID(),inspection_id:item.id,inspection_revision:item.revision,snapshot_sha256:'b'.repeat(64),created_at:new Date().toISOString(),snapshot};reports.push(report);result.report=report;}
        else if(b.op==='photo')result.url=base+'/__photo/'+b.photoId;
        else throw new Error('Unexpected operation '+b.op);
        await r.fulfill({json:result});
    }catch(e){errors.push(e.message);await r.fulfill({status:503,json:{ok:false,message:'Fixture assertion failed'}});}});
    await page.goto(base+'/?mode=photo-inspector',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'사진 한 장, 필요한 답을 한눈에'}).waitFor();
    if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
    const idle=()=>page.waitForFunction(()=>!document.querySelector('.si-quick-start')?.disabled||!!document.querySelector('.si-quick-result'));
    if(scenario==='text-only'){
        await page.getByRole('button',{name:'산업안전보건법령 요지 게시',exact:true}).click();const result=page.getByRole('region',{name:'관련 법령 요지와 금액'}).first();await result.getByText('500만원 이하 과태료 (법정상한)',{exact:true}).waitFor();assert.ok((await result.innerText()).includes('제34조'));assert.equal(ops.filter(op=>op!=='ai-status').length,0);
        await page.screenshot({path:out+'/posting-immediate.png',fullPage:true});
    }else{
        const source=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const g=c.getContext('2d');g.fillStyle='#789';g.fillRect(0,0,c.width,c.height);return c.toDataURL('image/jpeg',.95).split(',')[1];}),'base64');
        if(scenario==='camera-ai'){await page.getByRole('button',{name:'카메라로 바로 촬영',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.si-camera-dialog .si-primary').disabled);await page.getByRole('button',{name:'지금 촬영',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.si-camera-dialog img')?.naturalWidth>0);assert.equal(ops.filter(op=>op==='upload').length,0);await page.getByRole('button',{name:'이 사진 사용',exact:true}).click();}
        else if(scenario==='paste-ai')await page.evaluate(b64=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'clipboard.jpg',{type:'image/jpeg'}));document.querySelector('.si-quick').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:dt}));},source.toString('base64'));
        else await page.getByLabel('현장사진 선택').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:source});
        await page.getByAltText('분석할 현장사진').waitFor();await page.getByLabel('어떤 상황인가요?',{exact:false}).fill('3층 개구부 덮개 없음');assert.equal(ops.filter(op=>['create','upload','analyze-photo'].includes(op)).length,0);
        if(scenario==='ai-off')await page.getByRole('switch').click();
        await page.getByRole('checkbox').check();await page.locator('.si-quick-start').click();
        if(scenario==='api-retry'){await page.getByRole('alert').waitFor();assert.equal(analyzeCalls,1);await page.locator('.si-quick-start').click();}
        await page.getByRole('region',{name:'사진점검 결과'}).waitFor();await page.getByText('5년 이하 징역 또는 5,000만원 이하 벌금',{exact:true}).first().waitFor();await page.waitForFunction(()=>!document.querySelector('.si-quick-start').disabled);
        assert.equal(analyzeCalls,scenario==='ai-off'||scenario==='api-unavailable'?0:scenario==='api-retry'?2:1);
        if(!analyzeCalls)assert.ok((await page.getByRole('region',{name:'사진점검 결과'}).innerText()).includes('사진을 AI로 판독한 결과가 아닙니다'));
        assert.equal(await page.getByText('실제 단차 높이는?',{exact:false}).isVisible(),false);
        await page.getByRole('button',{name:'결과 복사',exact:true}).click();await page.getByRole('button',{name:'결과 복사 완료',exact:true}).waitFor();assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes('법정상한'));
        if(scenario==='camera-ai'){await page.getByLabel('핵심 답변').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/result-mobile.png',fullPage:true});await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:out+'/result-dark.png',fullPage:true});await page.evaluate(()=>document.documentElement.classList.remove('dark'));}
        await page.getByRole('button',{name:'확인 · 보고서 저장',exact:true}).click();
        if(scenario==='report-retry'){await page.getByRole('alert').waitFor();assert.equal(reportCalls,1);await page.waitForFunction(()=>!document.querySelector('.si-quick-start').disabled);await page.getByRole('button',{name:'확인 · 보고서 저장',exact:true}).click();assert.equal(ops.filter(op=>op==='complete-materials').length,1);}
        await page.getByRole('article',{name:'점검 검토용 보고서'}).waitFor();await page.waitForFunction(()=>document.querySelector('.si-report-photo')?.naturalWidth>0);
        const reportText=await page.locator('.si-report').innerText();assert.ok(reportText.includes('제43조'));assert.ok(reportText.includes('5,000만원'));assert.equal(reports[0].snapshot.legalReference.cards[0].id,'opening');
        await page.getByRole('button',{name:'보고 요약 복사',exact:true}).click();await page.getByText('보고 요약을 복사했습니다.',{exact:true}).waitFor();const brief=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(brief.includes('제43조'));assert.ok(brief.includes('5,000만원'));assert.ok(brief.includes('https://www.law.go.kr/'));
        if(scenario==='camera-ai'){for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`${out}/report-${width}.png`,fullPage:true});}await page.emulateMedia({media:'print'});assert.equal(await page.getByRole('button',{name:'보고 요약 복사',exact:true}).isVisible(),false);assert.equal(await page.locator('.si-report .si-legal-card').first().isVisible(),true);await page.pdf({path:out+'/report.pdf',format:'A4',printBackground:true});}
        if(scenario==='ai-off'){await page.getByRole('button',{name:'새 점검 시작',exact:true}).click();await page.getByRole('button',{name:'카메라로 바로 촬영',exact:true}).waitFor();assert.equal(ops.filter(op=>op==='create').length,1);assert.equal(await page.locator('.si-report').count(),0);}
    }
    assert.deepEqual(errors,[]);results.push({scenario,status:'PASS',provider:'fixture, no paid calls',ops});await context.close();
 }
 await writeFile(out+'/simulation.json',JSON.stringify({built,results},null,2));console.log(JSON.stringify({status:'PASS',built,scenarios:results.length,results}));
}finally{await browser.close();if(built)await new Promise(resolve=>server.httpServer.close(resolve));else await server.close();}
