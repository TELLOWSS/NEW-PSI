import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3046',out='artifacts/audit/inspector-sources';
await mkdir(out,{recursive:true});
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=await preview({preview:{host:'127.0.0.1',port:3046,strictPort:true,headers}});
const browser=await chromium.launch({headless:true,executablePath:process.env.PSI_CHROMIUM_PATH});
const errors=[],ops=[],external=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:900},acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base){external.push(url.href);return route.fulfill({body:'',contentType:'text/css'});}
  if(url.pathname==='/api/admin/auth')return route.fulfill({json:{ok:true,authenticated:true}});
  if(url.pathname==='/api/admin/inspector'){
   const body=route.request().postDataJSON();ops.push(body.op);
   if(body.op==='ai-status')return route.fulfill({json:{ok:true,ready:false,cost:{allowed:false}}});
   if(body.op==='list')return route.fulfill({json:{ok:true,items:[],hasMore:false,nextCursor:null}});
   throw Error('Unexpected API operation '+body.op);
  }
  if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);
  return route.continue();
 });
 await page.goto(base+'/inspector',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다',exact:true}).waitFor();
 await page.locator('.si-quick-topics summary').click();await page.getByRole('button',{name:'산업안전보건법령 요지 게시',exact:true}).click();
 await page.getByRole('tab',{name:'법령·금액',exact:true}).click();
 await page.locator('.si-legal-focus .si-source-status summary').click();
 await page.getByText('기존 자료 · 검토 이력 보완 필요',{exact:true}).waitFor();
 await page.getByText('법령 시행일·개정 이력이 등록되지 않았습니다. 사건 당시 시행본 확인 필요.').waitFor();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 await page.setViewportSize({width:390,height:900});await page.locator('.si-legal-focus').screenshot({path:out+'/source-state-mobile.png'});
 await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();
 await page.getByText('관리자 · 공식 안전정보 검토·갱신',{exact:true}).click();
 const before=ops.length,downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'현재 검토파일 내보내기',exact:true}).click();
 const download=await downloadPromise;await download.saveAs(out+'/exported.json');const catalog=JSON.parse(await readFile(out+'/exported.json','utf8'));
 catalog.version++;catalog.records[0].revisions.push({...catalog.records[0].revisions[0],revision:2,status:'pending',note:'합성 관리자 검토 후보'});
 await page.getByLabel('공식자료 갱신 후보 JSON').setInputFiles({name:'synthetic-candidate.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(catalog))});
 await page.getByRole('region',{name:'공식자료 갱신 차이'}).waitFor();assert.equal(ops.length,before);
 await page.getByRole('button',{name:'검증한 갱신 후보 내보내기',exact:true}).waitFor();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 const invalid=structuredClone(catalog);invalid.records[0].revisions[0].note='과거 이력 변조';
 await page.getByLabel('공식자료 갱신 후보 JSON').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
 await page.getByRole('alert').filter({hasText:'과거 검토 이력'}).waitFor();assert.equal(await page.getByRole('button',{name:'검증한 갱신 후보 내보내기',exact:true}).count(),0);assert.equal(ops.length,before);
 await page.setViewportSize({width:390,height:900});await page.locator('.si-source-manager').screenshot({path:out+'/admin-candidate-mobile.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(ops.filter(op=>!['list','ai-status'].includes(op)),[]);
 await writeFile(out+'/result.json',JSON.stringify({status:'PASS',viewports:[320,390,768,1440],ops,paidAiCalls:0,catalogWrites:0,sourceFetches:0,errors},null,2)+'\n');
 console.log('PASS: source states, admin export/import preview, history protection, no source API/DB writes, mobile/desktop.');
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
