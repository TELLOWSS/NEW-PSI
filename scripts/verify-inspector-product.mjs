import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Local production bundle + production CSP; no business API fixtures or paid provider calls.
const externalBase=process.env.PSI_PRODUCT_BASE;
const config=JSON.parse(await readFile('vercel.json','utf8'));
const headers=Object.fromEntries(config.headers.find(h=>h.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=externalBase?null:await preview({...(process.env.PSI_PRODUCT_DIST?{build:{outDir:process.env.PSI_PRODUCT_DIST}}:{}),preview:{host:'127.0.0.1',port:3029,headers}});
const base=externalBase||'http://127.0.0.1:3029',origin=new URL(base).origin;
const out='artifacts/audit/inspector-product';await mkdir(out,{recursive:true});
let proxy;
if(externalBase&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)){const url=new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);proxy={server:url.protocol+'//'+url.host,...(url.username?{username:decodeURIComponent(url.username),password:decodeURIComponent(url.password)}:{})};}
const browser=await chromium.launch({headless:true,executablePath:process.env.PSI_CHROMIUM_PATH,...(proxy?{proxy}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:!!externalBase});
await context.grantPermissions(['clipboard-read','clipboard-write']);
const page=await context.newPage(),errors=[],apiRequests=[],initialAssets=[],jobs=[];
let collect=true;
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(collect&&new URL(r.url()).origin===origin&&/\/assets\/.*\.js$/.test(r.url()))jobs.push(r.body().then(b=>initialAssets.push({name:new URL(r.url()).pathname,bytes:b.length,gzipBytes:gzipSync(b).length})));});
await page.route('**/*',async r=>{const url=new URL(r.request().url());if(url.pathname==='/__qa-korean.otf')return r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'});
    if(url.origin!==origin)return r.abort();
    if(url.pathname.startsWith('/api/')){apiRequests.push({method:r.request().method(),path:url.pathname});if(!externalBase)return r.fulfill({status:401,json:{ok:false}});}
    return r.continue();});
try{
    const entryResponse=await page.goto(base+'/product',{waitUntil:'networkidle'});
    const entryHtml=await entryResponse.text();
    assert.match(entryHtml,/<meta property="og:title" content="NEW-PSI 사진점검/);
    assert.match(entryHtml,/<meta property="og:image" content="https:\/\/new-psi-eta.vercel.app\/inspector-product-preview.png"/);
    assert.match(entryHtml,/<link rel="canonical" href="https:\/\/new-psi-eta.vercel.app\/product"/);
    await page.getByRole('heading',{name:/발견한 위험을,.*개선의 증거로/}).waitFor();await Promise.all(jobs);collect=false;
    assert.equal(apiRequests.length,0,'public entry must not request authentication, database, storage or AI');
    assert.equal(await page.locator('link[href*="fonts.googleapis"],link[href*="cdn.jsdelivr"]').count(),0,'public product must not load operational fonts');
    assert.ok(initialAssets.every(a=>!/OperationalApp|chart-vendor|data-vendor|\/services-|InspectorAdvanced|InspectorReport|InspectorProductReference/.test(a.name)),JSON.stringify(initialAssets));
    const rawBytes=initialAssets.reduce((n,a)=>n+a.bytes,0),gzipBytes=initialAssets.reduce((n,a)=>n+a.gzipBytes,0);
    assert.ok(rawBytes<350000,`public startup JS budget: ${rawBytes}`);assert.ok(gzipBytes<125000,`public startup gzip estimate budget: ${gzipBytes}`);
    const imageBytes=Buffer.from(await page.evaluate(async()=>{const r=await fetch('/inspector-product-preview.png');if(!r.ok)throw new Error('Missing product preview');return Array.from(new Uint8Array(await r.arrayBuffer()));}));
    assert.equal(imageBytes.readUInt32BE(16),1200);assert.equal(imageBytes.readUInt32BE(20),630);
    const localImage=await readFile('public/inspector-product-preview.png');assert.equal(createHash('sha256').update(imageBytes).digest('hex'),createHash('sha256').update(localImage).digest('hex'));
    if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')} .ip-product{font-family:PSIQA,system-ui!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
    for(const width of [1440,768,390,320]){
        await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
        await page.screenshot({path:`${out}/product-${width}.png`,fullPage:true});
    }
    await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.screenshot({path:out+'/product-dark-320.png',fullPage:true});
    await page.getByRole('button',{name:'비계·작업발판',exact:true}).click();await page.getByRole('heading',{name:'발판의 고정·틈·가장자리 방호 확인',exact:true}).waitFor();
    await page.getByRole('button',{name:'개선 전후',exact:true}).click();assert.equal(await page.getByRole('img',{name:/개선 (전|후) 비계·작업발판 체험용 도해/}).count(),3);
    await page.getByRole('button',{name:'보고서',exact:true}).click();await page.getByText('작성 당시 상태로 보존됩니다.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'임시 전선',exact:true}).click();await page.getByRole('button',{name:'위험·조치',exact:true}).click();await page.getByRole('heading',{name:'전선 손상·접촉 위험 확인'}).waitFor();
    await page.getByRole('button',{name:/관련 법령·금액·감독사례 펼치기/}).click();await page.getByRole('region',{name:'체험 장면의 관련 기준'}).waitFor();await page.getByRole('tab',{name:'법령·금액',exact:true}).click();await page.getByText('조문 요지·예외와 공식 원문 (1개)',{exact:true}).click();await page.getByRole('link',{name:'산업안전보건기준에 관한 규칙 제301조 ↗',exact:true}).waitFor();
    await page.getByRole('tab',{name:/^사례·동향/}).click();await page.locator('.si-case-trends').waitFor();
    await page.getByRole('button',{name:/관련 법령·금액·감독사례 접기/}).click();assert.equal(await page.getByRole('region',{name:'체험 장면의 관련 기준'}).count(),0);
    await page.getByRole('radio',{name:/여러 현장 확장/}).check();await page.getByRole('heading',{name:'여러 현장 확장',exact:true}).waitFor();
    await page.getByText('예상 사진 용량 가늠하기',{exact:true}).click();
    await page.getByLabel('하루 사진',{exact:true}).selectOption('50');await page.getByLabel('사용 일수',{exact:true}).selectOption('30');await page.getByLabel('장당 사본 가정',{exact:true}).selectOption('1000');
    assert.match(await page.locator('output').innerText(),/1,500장 · 약 1,464\.8MB/);
    await page.getByRole('button',{name:'검토안 복사',exact:true}).click();const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.match(copied,/1500장/);assert.match(copied,/1464\.8MB/);assert.match(copied,/추가 구축 필요/);assert.match(copied,/견적·주문·상담 접수·계약이 아닙니다/);
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'도입 검토안 파일 저장',exact:true}).click()]);assert.equal(download.suggestedFilename(),'NEW-PSI-도입검토안.md');const stream=await download.createReadStream(),parts=[];for await(const part of stream)parts.push(part);assert.equal(Buffer.concat(parts).toString('utf8'),copied);
    await page.evaluate(()=>{window.__productShares=[];Object.defineProperty(navigator,'share',{configurable:true,value:async data=>window.__productShares.push({data,active:navigator.userActivation.isActive})});});
    await page.getByRole('button',{name:'기기 공유창 열기',exact:true}).click();const shares=await page.evaluate(()=>window.__productShares);assert.equal(shares.length,1);assert.equal(shares[0].active,true);assert.equal(shares[0].data.text,copied);assert.equal(shares[0].data.url,origin+'/product');
    await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));await page.getByRole('button',{name:'기기 공유창 열기',exact:true}).click();await page.getByRole('status').getByText(/지원하지 않습니다/).waitFor();
    assert.equal(apiRequests.length,0,'all product demo/configuration/share actions must remain local');
    await page.setViewportSize({width:390,height:1000});await page.screenshot({path:out+'/adoption-configured-mobile.png',fullPage:true});
    await page.goto(base+'/product/',{waitUntil:'networkidle'});await page.getByRole('heading',{name:/발견한 위험을,.*개선의 증거로/}).waitFor();assert.equal(apiRequests.length,0);
    await page.getByRole('link',{name:'내 사진으로 점검',exact:true}).click();await page.getByRole('button',{name:'관리자 모드 진입',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'사진 한 장, 필요한 답을 한눈에'}).count(),0);await page.getByRole('link',{name:'처음이라면 · 사진점검 제품 체험'}).waitFor();
    for(const [path,heading] of [['/saas/access','기업 계정 확인'],['/saas/education','NEW-PSI 개인 교육']]){
        await page.goto(base+path,{waitUntil:'networkidle'});await page.getByRole('heading',{name:heading,exact:true}).waitFor();
        assert.ok(await page.locator('link[rel="stylesheet"][href*="/assets/styles-"]').count()>0,'separate account routes retain operational CSS');
        assert.ok(await page.getByRole('heading',{name:heading,exact:true}).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=24,'account route typography');
    }
    assert.deepEqual(errors,[]);
    const proof={status:'PASS',environment:externalBase?'production-readonly':'local-production-csp',initialAssets,rawBytes,gzipBytes,publicApiCalls:0,paidAiCalls:0,businessMutations:0,viewports:[320,390,768,1440],checked:['scene selection','before/after','report preview','dated legal/cases','scope','budget','copy','download bytes','trusted native share fixture','unsupported share','trailing slash','admin boundary'],actualRecipientSend:false};
    await writeFile(out+'/verification.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}catch(cause){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});console.error(JSON.stringify({errors,body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,2200)}));throw cause;
}finally{await context.close();await browser.close();if(server)await new Promise(r=>server.httpServer.close(r));}
