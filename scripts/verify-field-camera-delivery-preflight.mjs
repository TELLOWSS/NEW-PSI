import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';

const server=await createServer({server:{port:0,host:'127.0.0.1'}});
await server.listen();
const url='http://127.0.0.1:'+server.httpServer.address().port+'/camera';
let browser;
const results=[];
const fileBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOz6Xl0AAAAASUVORK5CYII=','base64');

try{
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});
  try{
   await page.addInitScript(()=>{
    window.__deliveries=[];
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
     if(window.__failOnceShare){
      window.__failOnceShare=false;
      const error=new Error('Synthetic mobile user activation expired');
      error.name='NotAllowedError';throw error;
     }
     window.__deliveries.push({size:data.files[0].size,name:data.files[0].name});
    }});
   });
   await page.goto(url);
   await page.getByRole('heading',{name:'현장 사진을 간편하게'}).waitFor();
   await page.getByLabel('사진첩에서 선택').setInputFiles({
    name:'synthetic-no-people.png',mimeType:'image/png',buffer:fileBytes,
   });
   await page.getByRole('heading',{name:'이 브라우저의 사진 1장'}).waitFor();
   await page.getByRole('button',{name:'사진 공유',exact:true}).click();
   await page.getByText('공유 앱에 전달했습니다.',{exact:false}).waitFor();
   assert.equal(await page.evaluate(()=>window.__deliveries.length),1);
   results.push({view:viewport.width,case:'verified-single-share',status:'PASS'});
   // Synthetic OS sharing refusal after async hashing. The second tap must
   // invoke navigator.share directly without another hash/IDB wait.
   await page.evaluate(()=>{window.__failOnceShare=true;});
   await page.getByRole('button',{name:'사진 공유',exact:true}).click();
   const reopen=page.getByRole('button',{name:'검증 완료 · 공유창 다시 열기'});
   await reopen.waitFor();
   await reopen.click();
   await page.waitForFunction(()=>window.__deliveries.length===2);
   assert.equal(await reopen.count(),0);
   results.push({view:viewport.width,case:'mobile-share-activation-recovery',status:'PASS'});
   await page.getByLabel('사진 1 선택').check();
   await page.getByRole('button',{name:'선택 사진 ZIP 준비 (1)'}).click();
   const link=page.getByRole('link',{name:'ZIP 기기에 저장'});
   await link.waitFor();
   const downloadPromise=page.waitForEvent('download');
   await link.click();
   const download=await downloadPromise;
   const zip=await JSZip.loadAsync(await readFile(await download.path()),{checkCRC32:true});
   const content=await zip.file('photo-001.png').async('nodebuffer');
   assert.equal(createHash('sha256').update(content).digest('hex'),
    createHash('sha256').update(fileBytes).digest('hex'));
   results.push({view:viewport.width,case:'verified-zip-export',status:'PASS'});

   // Modify IndexedDB without clicking the manual "verify hash" button.
   // The UI is deliberately still showing the earlier image.
   await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
     const r=indexedDB.open('psi-field-camera',1);
     r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    await new Promise((resolve,reject)=>{
     const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');
     const request=store.getAll();
     request.onsuccess=()=>{
      const row=request.result[0];
      row.blob=new Blob([new Uint8Array(row.blob.size).fill(0x42)],{type:row.type});
      store.put(row);
     };
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
   });
   await page.getByRole('button',{name:'선택 사진 공유 (1)'}).click();
   await page.getByText('기기 사진함의 실제 파일 해시가 달라 공유를 중단했습니다.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.__deliveries.length),2,
    'changed photo must not be sent through OS share');
   assert.equal(await page.getByRole('link',{name:'ZIP 기기에 저장'}).count(),0,
    'archive generated before detecting tampering must be invalidated');
   assert.equal(await page.getByRole('button',{name:'사진 공유',exact:true}).isDisabled(),true);
   assert.equal(await page.getByRole('button',{name:'선택 사진 ZIP 준비 (1)'}).isDisabled(),true);
   results.push({view:viewport.width,case:'silent-IDB-tampering-blocked',status:'PASS'});

   assert.deepEqual(api,[],'No camera server requests');
   assert.deepEqual(errors,[],'No JS runtime exceptions');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }catch(error){
   results.push({view:viewport.width,status:'FAIL',message:String(error)});
   throw error;
  }finally{await context.close();}
 }
 console.log('PASS field camera F06 preflight: verified share/ZIP and silent IndexedDB tampering prevented on mobile/desktop');
}finally{
 if(browser)await browser.close();
 server.httpServer?.closeAllConnections();
 await server.close();
}
