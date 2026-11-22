// Synthetic Chromium QA for three-page, browser-local PDF rasterization.
// This fixture contains only three colored pages, never real worker information.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const host='http://127.0.0.1:5189';
const buildPdf=()=>{
 const colors=['0.9 0.1 0.1','0.1 0.9 0.1','0.1 0.1 0.9'];
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
  ...colors.map((_,i)=>'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents '+(i+6)+' 0 R >>'),
  ...colors.map(rgb=>{
   const content='q\n'+rgb+' rg\n0 0 595 842 re f\nQ\n';
   return '<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'endstream';
  }),
 ];
 let data='%PDF-1.4\n';const offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(data));data+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const offset=Buffer.byteLength(data);
 data+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(const n of offsets.slice(1))data+=String(n).padStart(10,'0')+' 00000 n \n';
 data+='trailer\n<< /Root 1 0 R /Size '+(objects.length+1)+' >>\nstartxref\n'+offset+'\n%%EOF\n';
 return [...Buffer.from(data)];
};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=spawn(process.execPath,[resolve(process.cwd(),'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5189','--strictPort'],{stdio:'ignore'});
let browser;
try {
 let online=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error('Vite exited before readiness');
  try{const response=await fetch(host+'/');if(response.ok){online=true;break;}}catch{}
  await pause(250);
 }
 assert.ok(online,'Local Vite did not start');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 // Keep the browser origin for importing Vite modules, but do NOT mount the app,
 // request the backend, or load personal workspace state during synthetic QA.
 await page.route(host+'/',route=>route.fulfill({
  status:200, contentType:'text/html',
  body:'<!doctype html><html><body><p>Local PDF synthetic QA</p></body></html>',
 }));
 await page.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(host+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
  return route.abort();
 });
 await page.goto(host+'/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async bytes=>{
  const mod=await import('/utils/ocrLocalPdfSplit.ts');
  const file=new File([new Uint8Array(bytes)],'synthetic-three-pages.pdf',{type:'application/pdf'});
  const info=await mod.inspectLocalPdfForOcr(file);
  const progress=[];
  const images=await mod.splitOcrPdfLocally(file,(n,t)=>progress.push([n,t]));
  const duplicates=await mod.splitOcrPdfLocally(file);
  const dedup=await import('/utils/ocrUploadQuality.ts');
  const merged=dedup.mergeUniqueOcrFiles(images,duplicates);
  const pixels=[];
  for(const image of images){
   const bitmap=await createImageBitmap(image);
   const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
   const context=canvas.getContext('2d');
   context.drawImage(bitmap,Math.round(bitmap.width/2),Math.round(bitmap.height/2),1,1,0,0,1,1);
   pixels.push([...context.getImageData(0,0,1,1).data].slice(0,3));
   bitmap.close();
  }
  return{info,progress,pixels,duplicateCount:merged.duplicateCount,addedCount:merged.addedCount,files:images.map(f=>({name:f.name,size:f.size,type:f.type,lastModified:f.lastModified}))};
 },buildPdf());
 assert.equal(result.info.pages,3);assert.equal(result.info.sizeOk,true);
 assert.deepEqual(result.progress,[[1,3],[2,3],[3,3]]);
 assert.equal(result.duplicateCount,3,'Repeat split must not add duplicate pages');
 assert.equal(result.addedCount,0,'Repeat split must not add new records');
 assert.deepEqual(result.files.map(f=>f.name),[
  'synthetic-three-pages__p01_of_03.jpg','synthetic-three-pages__p02_of_03.jpg','synthetic-three-pages__p03_of_03.jpg'
 ]);
 assert.ok(result.files.every(f=>f.type==='image/jpeg'&&f.size>0&&f.size<=2.85*1024*1024));
 for(let i=0;i<3;i++)assert.ok(result.pixels[i][i]>result.pixels[i][(i+1)%3]&&result.pixels[i][i]>result.pixels[i][(i+2)%3],'Page '+(i+1)+' color');
 await mkdir('artifacts/audit/psi-legacy-pdf-split',{recursive:true});
 await writeFile('artifacts/audit/psi-legacy-pdf-split/result.json',JSON.stringify({result:'SYNTHETIC_PASS',pages:3,names:result.files.map(f=>f.name),sizes:result.files.map(f=>f.size),note:'Synthetic browser pages only; not real handwriting accuracy.'},null,2)+'\n');
 console.log('[PSI LEGACY PDF] SYNTHETIC_PASS: three independent page JPGs');
}finally{
 await browser?.close();
 server.kill('SIGTERM');
}
