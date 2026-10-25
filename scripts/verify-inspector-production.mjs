import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const config=JSON.parse(await readFile('vercel.json','utf8'));
const headers=Object.fromEntries(config.headers.find(x=>x.source==='/(.*)').headers.map(x=>[x.key,x.value]));
const server=await preview({preview:{port:3021,host:'127.0.0.1',strictPort:true,headers}});
const browser=await chromium.launch({...(process.env.PSI_CHROMIUM_PATH?{executablePath:process.env.PSI_CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/EvalError|Uncaught error/.test(m.text()))errors.push(m.text());});
 await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto('http://127.0.0.1:3021/',{waitUntil:'domcontentloaded'});
 await page.getByText('사진점검 · 개선관리',{exact:true}).first().click();
 await page.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다',exact:true}).waitFor();
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS: production bundle, real menu navigation, unchanged production CSP');
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
