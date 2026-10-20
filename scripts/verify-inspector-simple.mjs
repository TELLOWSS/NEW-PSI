import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const server=await createServer({server:{port:3022,host:'127.0.0.1',strictPort:true}});await server.listen();
const {validateOptimization}=await server.ssrLoadModule('/lib/server/admin/inspectorAssets.ts');
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();
const errors=[],ops=[],images=new Map();let item,evidence=[],reports=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const qaFont=process.env.PSI_QA_KOREAN_FONT;
if(qaFont)await page.route('**/__qa-korean.otf',async r=>r.fulfill({body:await readFile(qaFont),contentType:'font/otf'}));
await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
const bump=document=>(item={...item,revision:item.revision+1,document:structuredClone(document),updated_at:new Date().toISOString()});
await page.route('**/api/admin/inspector',async r=>{const b=r.request().postDataJSON();ops.push(b.op);let result={ok:true};
 if(b.op==='create')item={id:b.id,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),document:{title:'새 현장점검',siteName:'',location:'',workType:'',eventAt:new Date().toISOString(),notes:'',urgent:false,photoIds:[],analyses:{},reviews:{},actions:[],ocrResults:{}}},result.item=item;
 else if(b.op==='save')result.item=bump(b.document);
 else if(b.op==='upload'){const bytes=Buffer.from(b.base64,'base64'),hash=createHash('sha256').update(bytes).digest('hex');validateOptimization(b.optimizationReceipt,bytes,hash);const photo={id:b.photoId,inspection_id:item.id,sha256:hash,mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString(),optimization_receipt:b.optimizationReceipt};images.set(photo.id,bytes);evidence.push(photo);result.photo=photo;}
 else if(b.op==='photo')result.url=`http://127.0.0.1:3022/__photo/${b.photoId}`;
 else if(b.op==='confirm-photo'){const d=structuredClone(item.document);d.reviews[b.photoId]={decision:'accepted',note:'검토 완료',confirmedAt:new Date().toISOString(),actor:'dedicated-admin'};result.item=bump(d);}
 else if(b.op==='complete-materials'){const d=structuredClone(item.document);d.materialCompletion={revision:item.revision+1,completedAt:new Date().toISOString(),photoIds:d.photoIds.filter(id=>d.reviews[id]?.decision==='accepted')};result.item=bump(d);}
 else if(b.op==='report'){const report={id:randomUUID(),inspection_id:item.id,inspection_revision:item.revision,snapshot_sha256:'a'.repeat(64),created_at:new Date().toISOString(),snapshot:{inspection:structuredClone(item),evidence:evidence.filter(p=>item.document.materialCompletion.photoIds.includes(p.id)),legalStatus:'UNVERIFIED',reportStatus:'DRAFT',generatedAt:new Date().toISOString()}};reports.push(report);result.report=report;}
 else if(b.op==='usage')result.usage={projectBytes:2000000,uploadCeilingBytes:900000000};
 else if(b.op==='ai-status')Object.assign(result,{ready:false,provider:'',model:'',maxCalls:20});
 else throw new Error('Unexpected operation '+b.op);
 await r.fulfill({json:result});
});
await page.route('**/__photo/*',r=>r.fulfill({body:images.get(r.request().url().split('/').pop()),contentType:'image/jpeg'}));
const waitIdle=()=>page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='처리 중…'));
try{
 await page.goto('http://127.0.0.1:3022/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof window.__setCurrentPage==='function');await page.evaluate(()=>window.__setCurrentPage('safety-inspector'));if(qaFont){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}await page.getByRole('button',{name:'첫 점검 만들기',exact:true}).click();
 await page.getByLabel('사진 보관이 허용되었고, 얼굴·명찰·도면 등 불필요한 민감정보를 처리했습니다.').check();
 const source=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4032;c.height=3024;const g=c.getContext('2d'),data=g.createImageData(c.width,c.height);let seed=7;for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data.data[i]=seed&255;data.data[i+1]=(seed>>>8)&255;data.data[i+2]=(seed>>>16)&255;data.data[i+3]=255;}g.putImageData(data,0,0);g.fillStyle='white';g.fillRect(40,40,1200,200);g.fillStyle='black';g.font='100px sans-serif';g.fillText('SAFETY TEST',60,180);return c.toDataURL('image/jpeg',.98).split(',')[1];});
 const sourceBytes=Buffer.from(source,'base64');if(sourceBytes.length<=3*1024*1024)throw new Error('Fixture must exceed old upload limit');const sourceHash=createHash('sha256').update(sourceBytes).digest('hex');
 await page.getByLabel('현장사진 선택').setInputFiles({name:'synthetic-large.jpg',mimeType:'image/jpeg',buffer:sourceBytes});await page.getByText('기기 원본은 변경하지 않고 최적화 사본과 증빙을 저장했습니다.',{exact:false}).waitFor();
 if(evidence[0].byte_size>3*1024*1024||evidence[0].optimization_receipt.uploaded_width!==2048)throw new Error('Optimization failed');if(createHash('sha256').update(sourceBytes).digest('hex')!==sourceHash)throw new Error('Source mutated');
 await page.getByLabel('이 사진의 부연설명').fill('사진 밖 통로가 있으며 작업 전 상태임');await page.getByRole('button',{name:'설명 저장 후 분석하기',exact:true}).click();await page.getByLabel('외부 AI 분석이 허용된 사진이며 불필요한 식별정보를 처리했습니다.').check();
 await page.getByRole('button',{name:'① 사진 이미지 복사',exact:true}).click();await page.getByText('사진을 복사했습니다.',{exact:false}).waitFor();const types=await page.evaluate(async()=>{return(await navigator.clipboard.read()).flatMap(i=>i.types);});if(!types.includes('image/png'))throw new Error('Clipboard did not contain real PNG');
 await page.getByRole('button',{name:'② 표준 프롬프트 복사',exact:true}).click();const prompt=await page.evaluate(()=>navigator.clipboard.readText());if(!prompt.includes('사진 밖 통로'))throw new Error('Photo-specific notes missing from prompt');
 const photo=evidence[0];const analysis={schema_version:'1.1',inspection_id:item.id,photo_id:photo.id,source_photo_sha256:photo.sha256,processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'방호 상태 확인 필요',visual_basis:'사진 왼쪽 경계',confidence:'medium'}],ai_hypotheses:[],requires_confirmation:[{question:'사진 밖 통로 상태는?',why:'사진 범위의 한계'}],recommended_controls:[],law_candidate_keywords:[],limitations:['사진 밖 미확인']};await page.getByLabel('AI 분석결과 JSON').fill(JSON.stringify(analysis));await page.getByRole('button',{name:'원본 대조 후 결과 가져오기',exact:true}).click();await page.getByRole('button',{name:'분석 확인 · 사진 검토 완료',exact:true}).waitFor();
 if(await page.getByLabel('질문 1 확인 상태').isVisible())throw new Error('Optional questions must start collapsed');await page.getByRole('button',{name:'분석 확인 · 사진 검토 완료',exact:true}).click();await page.getByText('사진·설명과 분석을 대조한 확인을 기록했습니다.',{exact:false}).waitFor();if(!item.document.reviews[photo.id]?.confirmedAt)throw new Error('Review was not recorded');
 await page.getByRole('button',{name:'다음 사진 · 사진 추가',exact:true}).click();
 await page.getByRole('region',{name:'사진 붙여넣기 영역'}).evaluate((el,base64)=>{const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'pasted.jpg',{type:'image/jpeg'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},source);
 await page.waitForFunction(()=>document.querySelectorAll('.si-photo-rail button').length===2);await waitIdle();
 await page.getByRole('button',{name:'보고서 작성자료 완료하기',exact:true}).click();await page.getByRole('button',{name:'보고서 작성',exact:true}).click();await page.locator('.si-report-photo').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-report-photo-state="loading"]'));
 if(await page.locator('.si-report-photo').count()!==1)throw new Error('Unreviewed photo was included');if(ops.includes('analyze-photo'))throw new Error('API ran without explicit request');
 await mkdir('artifacts/audit/inspector-simple',{recursive:true});await writeFile('artifacts/audit/inspector-simple/optimization-receipt.json',JSON.stringify({sourceSha256:sourceHash,sourceUnchanged:true,...evidence[0].optimization_receipt},null,2));
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`artifacts/audit/inspector-simple/report-${width}.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Horizontal overflow at '+width);}
 await page.emulateMedia({media:'print'});await page.pdf({path:'artifacts/audit/inspector-simple/report.pdf',format:'A4',printBackground:true});
 if(errors.length)throw new Error(errors.join('\n'));console.log('PASS simple flow / >3MB original optimization + unchanged hash / real PNG clipboard / incoming paste / optional questions / versioned materials / report image / responsive print');
}finally{await browser.close();await server.close();}
