import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const built=process.env.PSI_QA_BUILT==='1',port=3023,base=`http://127.0.0.1:${port}`,output='artifacts/audit/inspector-novice';
const config=JSON.parse(await readFile('vercel.json','utf8'));
const allHeaders=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const headers=built?allHeaders:{'Permissions-Policy':allHeaders['Permissions-Policy']};
const server=built?await preview({preview:{port,host:'127.0.0.1',strictPort:true,headers}}):await createServer({server:{port,host:'127.0.0.1',strictPort:true,headers}});if(!built)await server.listen();
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const results=[];await mkdir(output,{recursive:true});
const photoConsent='사진 보관이 허용되었고, 얼굴·명찰·도면 등 불필요한 민감정보를 처리했습니다.';
const aiConsent='외부 AI 분석이 허용된 사진이며 불필요한 식별정보를 처리했습니다.';
const syntheticAnalysis=(item,photo)=>({schema_version:'1.1',inspection_id:item.id,photo_id:photo.id,source_photo_sha256:photo.sha256,processing_mode:'PAID_API_APPROVED',observed_facts:[{text:'사진 중앙에 발판 틈새가 보입니다.',visual_basis:'사진 중앙 경계',confidence:'medium'}],ai_hypotheses:[{text:'자재 낙하 가능성 검토',reason:'틈새 주변 물체'}],requires_confirmation:[{question:'하부 출입통제 상태는?',why:'사진 밖은 확인 불가'}],recommended_controls:[{action:'하부 출입통제와 틈새 보강 필요성을 검토하세요.',priority:'immediate'}],law_candidate_keywords:[],limitations:['사진 밖 현장은 확인할 수 없습니다.']});
try{
 for(const scenario of ['api-success','api-unavailable','api-retry','report-retry','partial-cancel','api-reconnect']){
    const context=await browser.newContext({viewport:{width:390,height:900},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();
    const ops=[],errors=[],fixtureErrors=[],images=new Map();let item,evidence=[],reports=[],analyzeCalls=0,reportCalls=0,statusCalls=0,cancelNext=false;
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(cancelNext){cancelNext=false;await d.dismiss();}else await d.accept();});
    const bump=document=>(item={...item,revision:item.revision+1,document:structuredClone(document),updated_at:new Date().toISOString()});
    await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    if(process.env.PSI_QA_KOREAN_FONT)await page.route('**/__qa-korean.otf',async r=>r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'}));
    await page.route('**/__photo/*',r=>r.fulfill({body:images.get(r.request().url().split('/').pop()),contentType:'image/jpeg'}));
    await page.route('**/api/admin/inspector',async r=>{
      const b=r.request().postDataJSON();ops.push(b.op);let result={ok:true};
      try{
        if(b.op==='create'){item={id:b.id,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),document:{title:'처음 쓰는 현장점검',siteName:'',location:'',workType:'',eventAt:new Date().toISOString(),notes:'',urgent:false,photoIds:[],analyses:{},reviews:{},actions:[],ocrResults:{}}};result.item=item;}
        else if(b.op==='ai-status'){if(item)statusCalls++;Object.assign(result,{ready:scenario!=='api-unavailable'&&(scenario!=='api-reconnect'||statusCalls>1),provider:'gemini',model:'fixture',maxCalls:20});}
        else if(b.op==='usage'&&scenario==='api-reconnect'){await r.fulfill({status:503,json:{ok:false,message:'Usage unavailable'}});return;}
        else if(b.op==='usage')result.usage={projectBytes:100000,uploadCeilingBytes:900000000};
        else if(b.op==='upload'){const bytes=Buffer.from(b.base64,'base64');assert.ok(bytes.length<=3*1024*1024);const photo={id:b.photoId,inspection_id:item.id,sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString(),optimization_receipt:b.optimizationReceipt};images.set(photo.id,bytes);evidence.push(photo);result.photo=photo;}
        else if(b.op==='photo')result.url=base+'/__photo/'+b.photoId;
        else if(b.op==='save'){assert.equal(b.expectedRevision,item.revision);result.item=bump(b.document);}
        else if(b.op==='analyze-photo'){
            analyzeCalls++;assert.equal(b.expectedRevision,item.revision);assert.equal(item.document.apiEnabled,true);assert.equal(b.externalConfirmed,true);assert.ok(item.document.photoNotes[b.photoId]);
            if(scenario==='api-retry'&&analyzeCalls===1){await r.fulfill({status:503,json:{ok:false,message:'연결 상태를 확인한 뒤 직접 다시 요청해 주세요.'}});return;}
            const d=structuredClone(item.document);d.analyses[b.photoId]=syntheticAnalysis(item,evidence.find(p=>p.id===b.photoId));delete d.materialCompletion;result.item=bump(d);
        }
        else if(b.op==='confirm-photo'){assert.equal(b.expectedRevision,item.revision);const d=structuredClone(item.document);assert.ok(d.analyses[b.photoId]);d.reviews[b.photoId]={decision:'accepted',note:'사진과 현장 상황을 대조했습니다.',confirmedAt:new Date().toISOString(),actor:'dedicated-admin'};result.item=bump(d);}
        else if(b.op==='complete-materials'){assert.equal(b.expectedRevision,item.revision);const d=structuredClone(item.document);const ids=d.photoIds.filter(id=>d.reviews[id]?.decision==='accepted');assert.ok(ids.length);d.materialCompletion={revision:item.revision+1,photoIds:ids,completedAt:new Date().toISOString()};result.item=bump(d);}
        else if(b.op==='report'){
            reportCalls++;assert.equal(b.expectedRevision,item.revision);assert.ok(item.document.materialCompletion);
            if(scenario==='report-retry'&&reportCalls===1){await r.fulfill({status:503,json:{ok:false,message:'보고서를 만들지 못했습니다. 다시 작성해 주세요.'}});return;}
            const report={id:randomUUID(),inspection_id:item.id,inspection_revision:item.revision,snapshot_sha256:'b'.repeat(64),created_at:new Date().toISOString(),snapshot:{inspection:structuredClone(item),evidence:evidence.filter(p=>item.document.materialCompletion.photoIds.includes(p.id)),legalStatus:'UNVERIFIED',reportStatus:'DRAFT',generatedAt:new Date().toISOString()}};reports.push(report);result.report=report;
        }else throw new Error('Unexpected operation '+b.op);
        await r.fulfill({json:result});
      }catch(e){fixtureErrors.push(e.message);await r.fulfill({status:503,json:{ok:false,message:'Fixture assertion failed'}});}
    });
    const idle=()=>page.waitForFunction(()=>!document.querySelector('.si-bottom-bar button')?.disabled);
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'모바일 하단 탐색'}).locator('button[aria-haspopup=dialog]').click();await page.getByText('사진점검 · 개선관리',{exact:true}).filter({visible:true}).first().click();
    if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
    await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();await page.getByRole('button',{name:'첫 점검 만들기',exact:true}).click();await page.getByRole('heading',{name:'사진과 점검자 설명',exact:true}).waitFor();await idle();
    assert.equal(await page.getByRole('button',{name:/^카메라로 바로 촬영/}).isDisabled(),true);
    await page.getByLabel(photoConsent).check();
    const source=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1280;c.height=960;const g=c.getContext('2d');g.fillStyle='#789';g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='80px sans-serif';g.fillText('SYNTHETIC SAFETY',50,400);return c.toDataURL('image/jpeg',.95).split(',')[1];}),'base64');
    if(scenario==='api-success'){
        await page.getByRole('button',{name:/^카메라로 바로 촬영/}).click();await page.waitForFunction(()=>!document.querySelector('.si-camera-dialog .si-primary').disabled);await page.getByRole('button',{name:'지금 촬영',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.si-camera-dialog img')?.naturalWidth>0);assert.equal(ops.filter(op=>op==='upload').length,0);await page.getByRole('button',{name:'이 사진 사용',exact:true}).click();
    }else await page.getByLabel('현장사진 선택').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:source});
    await page.getByLabel('이 사진의 부연설명').waitFor();await idle();
    await page.waitForFunction(()=>document.querySelector('[aria-label="이 사진의 부연설명"]')===document.activeElement);
    await page.getByLabel('이 사진의 부연설명').fill('작업 전 상태이며 사진 밖 통로가 있습니다.');
    // Direct tab navigation intentionally leaves notes dirty; explicit API action must save them.
    await page.locator('.si-tabs button').filter({hasText:'관찰·사실 검토'}).click();await page.getByRole('heading',{name:'분석 방법을 선택하세요',exact:true}).waitFor();assert.equal(analyzeCalls,0);
    assert.equal(await page.getByLabel('AI 분석결과 JSON').count(),0);
    if(scenario==='api-reconnect'){await page.getByRole('button',{name:'API 연결 다시 확인',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(analyzeCalls,0);}
    if(scenario==='api-unavailable'){
        await page.getByRole('button',{name:'ChatGPT로 진행하기',exact:true}).click();await page.getByLabel(aiConsent).check();await page.getByRole('button',{name:'설명 저장',exact:true}).click();await idle();
        await page.getByLabel('AI 분석결과 JSON').fill('잘못된 답변');await page.getByRole('button',{name:'원본 대조 후 결과 가져오기',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('AI 분석결과 JSON').inputValue(),'잘못된 답변');assert.equal(analyzeCalls,0);
        const manual={...syntheticAnalysis(item,evidence[0]),processing_mode:'CHATGPT_MANUAL'};await page.getByLabel('AI 분석결과 JSON').fill('```json\n'+JSON.stringify(manual)+'\n```');await page.getByRole('button',{name:'원본 대조 후 결과 가져오기',exact:true}).click();
    }else{
        const start=page.getByRole('button',{name:'API 켜고 이 사진 분석',exact:true});await start.waitFor();if(scenario==='api-success')await page.locator('.si-analysis-input').screenshot({path:output+'/after-analysis-options.png'});assert.equal(await start.isDisabled(),true);await page.getByLabel(aiConsent).check();await start.click();
        if(scenario==='api-retry'){await page.getByRole('alert').waitFor();assert.equal(analyzeCalls,1);await page.waitForFunction(()=>document.querySelector('[role=alert]')===document.activeElement);await page.getByRole('button',{name:'이 사진 분석 · API',exact:true}).click();}
    }
    await page.getByRole('heading',{name:'분석을 확인해 주세요',exact:true}).waitFor();await idle();
    assert.equal(await page.getByLabel('AI 분석결과 JSON').isVisible(),false);assert.equal(await page.getByLabel('질문 1 확인 상태').isVisible(),false);
    await page.getByRole('button',{name:'분석 확인 · 사진 검토 완료',exact:true}).click();await page.getByRole('button',{name:'사진 확인 완료',exact:true}).waitFor();await idle();
    if(scenario==='partial-cancel'){
        await page.getByRole('button',{name:'다음 사진 · 사진 추가',exact:true}).click();await page.getByLabel('현장사진 선택').setInputFiles({name:'unreviewed.jpg',mimeType:'image/jpeg',buffer:source});await page.waitForFunction(()=>document.querySelectorAll('.si-photo-rail button').length===2);await idle();
        const before=ops.length;cancelNext=true;await page.getByRole('button',{name:'확인한 사진으로 보고서 만들기',exact:true}).click();await idle();assert.equal(ops.slice(before).filter(op=>['complete-materials','report'].includes(op)).length,0);
    }
    await page.getByRole('button',{name:'확인한 사진으로 보고서 만들기',exact:true}).click();
    if(scenario==='report-retry'){await page.getByRole('alert').waitFor();assert.equal(ops.filter(op=>op==='complete-materials').length,1);await page.getByRole('button',{name:'보고서 작성',exact:true}).click();}
    await page.getByRole('article',{name:'점검 검토용 보고서'}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.si-report-photo').length===1&&!document.querySelector('[data-report-photo-state="loading"]'));
    assert.equal(ops.filter(op=>op==='complete-materials').length,1);assert.equal(reports[0].snapshot.evidence.length,1);
    assert.ok((await page.locator('.si-report').innerText()).includes('하부 출입통제와 틈새 보강'));
    await page.getByRole('button',{name:'보고 요약 복사',exact:true}).click();await page.getByText('보고 요약을 복사했습니다.',{exact:true}).waitFor();const brief=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(brief.includes('개선 권고(즉시 검토)'));assert.ok(brief.includes('아직 확인하지 못함'));assert.ok(brief.includes('보고서 사진: 1장'));
    if(scenario==='api-success'){
        for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`${output}/after-report-${width}.png`,fullPage:true});}
        await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:`${output}/after-dark.png`,fullPage:true});await page.emulateMedia({media:'print'});assert.equal(await page.locator('.si-report-brief').evaluate(el=>getComputedStyle(el).display),'none');assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');await page.pdf({path:`${output}/first-report.pdf`,format:'A4',printBackground:true});
    }
    assert.deepEqual(errors,[]);assert.deepEqual(fixtureErrors,[]);console.log('PASS '+scenario);results.push({scenario,status:'PASS',analysisCalls:analyzeCalls,reportCalls,materialCompletions:ops.filter(op=>op==='complete-materials').length,photos:evidence.length,reportPhotos:reports[0].snapshot.evidence.length,errors});await context.close();
 }
 await writeFile(output+'/simulation.json',JSON.stringify({status:'PASS',builtProductionBundle:built,results},null,2));console.log(JSON.stringify({status:'PASS',builtProductionBundle:built,results}));
}catch(error){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();if(built)await new Promise(resolve=>server.httpServer.close(resolve));else await server.close();}
