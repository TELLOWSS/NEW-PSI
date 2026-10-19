import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {createHash,randomUUID} from 'node:crypto';
await import('./prepare-inspector-ocr.mjs');
const output=resolve('artifacts/audit/inspector');await mkdir(output,{recursive:true});
const executablePath=process.env.PSI_CHROMIUM_PATH;
const server=await createServer({configFile:resolve('vite.config.ts'),server:{port:3020,host:'127.0.0.1',strictPort:true}});await server.listen();
const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[],requests=[];
// Optional local Korean font fixture for environments without a CJK system font.
if(process.env.PSI_QA_FONT_DIR){
 const fontRoot=process.env.PSI_QA_FONT_DIR;
 const css=(await readFile(resolve(fontRoot,'400.css'),'utf8')).replaceAll('./files/','http://127.0.0.1:3020/__qa-font/');
 await page.route('**/__qa-font/*',async route=>{const file=route.request().url().split('/').pop();await route.fulfill({body:await readFile(resolve(fontRoot,'files',file)),contentType:'font/woff2'});});
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:css}));
 await page.route('https://cdn.jsdelivr.net/gh/orioncactus/**',route=>route.fulfill({contentType:'text/css',body:css.replaceAll('Noto Sans KR','Pretendard')}));
}

page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
page.on('requestfailed',r=>console.log('FAILED REQUEST',r.url(),r.failure()?.errorText));
page.on('response',r=>{if(r.url().includes('inspector-ocr'))console.log('OCR ASSET',r.status(),r.url());});
let item=null,evidence=[],history=[],reports=[],listFixture=null;const photos=new Map();
const fixtureDoc=()=>({title:'새 현장점검',siteName:'',location:'',workType:'',eventAt:new Date().toISOString(),notes:'',urgent:false,ocrResults:{},photoIds:[],analyses:{},reviews:{},actions:[]});
const bump=doc=>{item={...item,revision:item.revision+1,document:structuredClone(doc),updated_at:new Date().toISOString()};history.push({revision:item.revision,occurred_at:item.updated_at});return item;};
await page.route('**/api/admin/auth',route=>route.fulfill({json:{ok:true,authenticated:true}}));
await page.route('**/api/admin/inspector',async route=>{
    const b=route.request().postDataJSON();requests.push(b.op);let result={ok:true};
    if(b.op==='list' && listFixture){if(b.before!==undefined){if(b.before!==listFixture.cursor.before || b.beforeId!==listFixture.cursor.beforeId)throw new Error('Pagination cursor changed after editing a list row');result={ok:true,items:[listFixture.extra],hasMore:false,nextCursor:null};}else result={ok:true,items:listFixture.rows,hasMore:true,nextCursor:listFixture.cursor};}
    else if(b.op==='list')result={ok:true,items:item?[{id:item.id,title:item.document.title,work_type:item.document.workType,location:item.document.location,urgent:item.document.urgent,open_actions:item.document.actions.filter(a=>a.status!=='verified').length,needs_review:Object.keys(item.document.analyses).some(k=>!item.document.reviews[k]),created_at:item.created_at}]:[],hasMore:false};
    else if(b.op==='create'){item={id:b.id,revision:1,document:fixtureDoc(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};history=[{revision:1,occurred_at:item.created_at}];result={ok:true,item};}
    else if(b.op==='save')result={ok:true,item:bump(b.document)};
    else if(b.op==='detail')result={ok:true,item,evidence,events:history,reports};
    else if(b.op==='upload'){const bytes=Buffer.from(b.base64,'base64');const p={id:b.photoId,inspection_id:item.id,sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'image/png',byte_size:bytes.length,created_at:new Date().toISOString()};evidence.push(p);photos.set(p.id,bytes);result={ok:true,photo:p};}
    else if(b.op==='photo')result={ok:true,url:`http://127.0.0.1:3020/__fixture-photo/${b.photoId}`};
    else if(b.op==='verify-action'){const d=structuredClone(item.document),a=d.actions.find(x=>x.id===b.actionId);a.status='verified';a.verifiedAt=new Date().toISOString();result={ok:true,item:bump(d)};}
    else if(b.op==='report'){const report={id:randomUUID(),inspection_id:item.id,inspection_revision:item.revision,snapshot:{inspection:structuredClone(item),evidence,legalStatus:'UNVERIFIED',reportStatus:'DRAFT',generatedAt:new Date().toISOString()},snapshot_sha256:'a'.repeat(64),created_at:new Date().toISOString()};reports.push(report);result={ok:true,report};}
    else if(b.op==='read-report')result={ok:true,report:reports.find(r=>r.id===b.reportId)};
    await route.fulfill({json:result});
});
await page.route('**/__fixture-photo/*',route=>route.fulfill({body:photos.get(route.request().url().split('/').pop()),contentType:'image/png'}));
try{
    await page.goto('http://127.0.0.1:3020/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.__setCurrentPage==='function');await page.evaluate(()=>window.__setCurrentPage('safety-inspector'));
    await page.getByRole('heading',{name:'현장을 읽고, 개선까지 연결하다.'}).waitFor();await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:resolve(output,'desktop-empty.png'),fullPage:true});
    if(requests.length)throw new Error('Entering Inspector must not request business data automatically');
    await page.getByRole('button',{name:'첫 점검 만들기'}).click();
    await page.getByLabel('점검명',{exact:true}).fill('개구부 주변 방호 점검');await page.getByLabel('현장명',{exact:true}).fill('검증용 가상 현장');await page.getByLabel('동·층·구역',{exact:true}).fill('2002동 18층');await page.getByLabel('공종',{exact:true}).fill('형틀');
    await page.getByLabel('점검자 설명 · 원문과 수정 이력이 함께 보관됩니다').fill('개구부 주변의 방호상태를 확인하고 작업 전 접근통제를 검토함. 사진 밖의 방호상태는 별도 확인 필요.');
    await page.getByRole('button',{name:'변경사항 저장'}).click();
    // Synthetic non-sensitive text image. Actual WebAssembly OCR runs against this image in-browser.
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=400;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1000,400);g.fillStyle='black';g.font='bold 60px Arial';g.fillText('SAFETY FIRST',50,140);g.fillText('CHECK GUARDRAIL',50,260);return c.toDataURL('image/png').split(',')[1];});
    await page.getByLabel('사진 보관이 허용되었고, 얼굴·명찰·도면 등 불필요한 민감정보를 처리했습니다.').check();
    await page.getByLabel('현장사진 선택').setInputFiles({name:'synthetic-safety.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByRole('status').filter({hasText:'사진 원본과 해시를 저장했습니다.'}).waitFor();
    await page.getByAltText('선택한 점검 원본사진').waitFor();await page.getByLabel('문자 언어',{exact:true}).selectOption('eng');
    await page.getByRole('button',{name:'기기 내 문자 인식',exact:true}).click();await page.getByLabel('대조·정정문',{exact:true}).waitFor({timeout:60000});
    const ocrText=await page.getByLabel('대조·정정문',{exact:true}).inputValue();if(!ocrText.includes('SAFETY'))throw new Error(`Local OCR failed: ${ocrText}`);
    await page.getByLabel('원본과 대조해 문자 인식 결과를 검수했습니다.').check();await page.getByRole('button',{name:'변경사항 저장'}).click();
    await page.getByRole('button',{name:/관찰·사실 검토/}).click();
    const p=evidence[0],a={schema_version:'1.1',inspection_id:item.id,photo_id:p.id,source_photo_sha256:p.sha256,processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'표지에 안전 우선 문구가 보임',visual_basis:'사진 중앙',confidence:'high'}],ai_hypotheses:[{text:'방호상태 현장 확인 필요',reason:'문구만으로 실제 방호를 알 수 없음'}],requires_confirmation:[{question:'개구부 방호가 실제 설치되어 있나요?',why:'사진 밖 상태 미확인'}],recommended_controls:[{action:'현장 방호상태를 재점검',priority:'soon'}],law_candidate_keywords:['개구부'],limitations:['가상 문자 사진이며 현장 위험을 확인할 수 없음']};
    await page.getByLabel('AI 분석결과 JSON',{exact:true}).fill(JSON.stringify(a));await page.getByRole('button',{name:'원본 대조 후 결과 가져오기'}).click();
    await page.getByLabel('질문 1 확인 상태',{exact:true}).selectOption('unknown');
    await page.getByLabel('질문 1 확인 근거',{exact:true}).fill('사진 밖 구간은 현장에서 추가 확인이 필요함');
    if(await page.getByRole('button',{name:'사실 검토 수용',exact:true}).isEnabled())throw new Error('Changed confirmation must be saved before review');
    await page.getByRole('button',{name:'변경사항 저장'}).click();
    await page.getByLabel('현장 확인 내용·보완사항').fill('사진만으로 판단하지 않고 방호상태를 현장에서 확인할 예정');await page.getByRole('button',{name:'사실 검토 수용',exact:true}).click();await page.getByRole('button',{name:'변경사항 저장'}).click();
    await page.screenshot({path:resolve(output,'desktop-analysis.png'),fullPage:true});
    await page.getByRole('button',{name:/개선·재점검/}).click();await page.getByLabel('개선할 사항').fill('개구부 방호상태 현장 재점검');await page.getByLabel('담당자·담당 공종').fill('검증용 형틀 담당');await page.getByLabel('완료기한').fill('2026-10-20');await page.getByRole('button',{name:'조치 추가',exact:true}).click();
    await page.getByLabel('개선사진',{exact:true}).selectOption(p.id);await page.getByLabel('조치 내용·현장 재점검 기록').fill('개선 방호상태와 잔여 위험을 현장에서 확인함');await page.getByRole('button',{name:'완료 검토 요청',exact:true}).click();await page.getByRole('button',{name:'변경사항 저장'}).click();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'현장 재점검 확인',exact:true}).click();await page.getByText('조치 확인 · 법령 검토 대기',{exact:true}).first().waitFor();
    await page.getByRole('button',{name:/^05.*보고서/}).click();await page.getByRole('button',{name:'검토용 보고서 생성',exact:true}).click();await page.getByRole('article',{name:'점검 검토용 보고서'}).waitFor();
    if(!(await page.getByRole('article').innerText()).includes('아직 확인하지 못함'))throw new Error('Unknown confirmation was omitted from report');
    await page.screenshot({path:resolve(output,'desktop-report.png'),fullPage:true});await page.pdf({path:resolve(output,'draft-report.pdf'),printBackground:true,preferCSSPageSize:true});
    for(const [name,width,height]of [['mobile',390,844],['tablet',768,1024],['desktop',1440,1080]]){
        await page.setViewportSize({width,height});await page.getByRole('button',{name:/사진·설명/}).click();
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw new Error(`Horizontal overflow: ${name}`);
        await page.screenshot({path:resolve(output,`${name}-evidence.png`),fullPage:true});
    }
    // Editing an old visible row reorders the list, but must not change the server cursor.
    const stamp='2026-10-19T12:00:00.123456+00:00';
    const summary={id:item.id,title:item.document.title,work_type:'검증',location:'가상',urgent:false,open_actions:0,needs_review:false,created_at:stamp};
    listFixture={rows:[...Array.from({length:49},(_,n)=>({...summary,id:`a0190000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,title:`목록 검증 ${n+1}`})),summary],cursor:{before:stamp,beforeId:item.id},extra:{...summary,id:'a0190000-0000-4000-8000-000000000099',title:'다음 페이지 확인'}};
    await page.getByRole('button',{name:'목록 불러오기',exact:true}).click();
    await page.getByLabel('점검명',{exact:true}).fill('목록 재정렬 후 커서 검증');await page.getByRole('button',{name:'변경사항 저장'}).click();
    await page.getByRole('button',{name:'이전 점검 더 보기',exact:true}).click();await page.getByRole('button').filter({hasText:'다음 페이지 확인'}).waitFor();
    if(errors.length)throw new Error(errors.join('\n'));
    await writeFile(resolve(output,'result.json'),JSON.stringify({fixture:'network mocked, actual client UI and self-hosted WASM OCR',viewports:[390,768,1440],ocrText,apiOperations:requests,errors},null,2));
    console.log(JSON.stringify({status:'PASS',viewports:3,ocrText,operations:requests.length,errors}));
}catch(error){await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});console.log('PAGE STATE',(await page.locator('.si-content').innerText()).slice(-2000));throw error;}finally{await browser.close();await server.close();}
