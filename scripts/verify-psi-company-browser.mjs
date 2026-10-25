import {preview} from 'vite';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Synthetic-only browser journeys spanning PSI modules. Never calls real data or paid AI. */
const url='http://127.0.0.1:4182/';
const scenarios=[
 {owner:'platform',name:'inspector-production-navigation',script:'scripts/verify-inspector-production.mjs'},
 {owner:'safety-ai',name:'six-metrics-dashboard',script:'scripts/verify-psi-current-metrics-ui.mjs'},
 {owner:'safety-ai',name:'survey-risk-baselines',script:'scripts/verify-survey-baseline-ui.mjs'},
 {owner:'product-ux',name:'plain-language-journeys',script:'scripts/verify-plain-language-ui.mjs'},
 {owner:'product-ux',name:'multilingual-worker-report',script:'scripts/verify-worker-report-ui.mjs'},
 {owner:'safety-ai',name:'safety-case-closed-loop',script:'scripts/verify-safety-case-closed-loop-ui.mjs'}
];
const output='artifacts/audit/psi-company';
await mkdir(output,{recursive:true});
const vercel=JSON.parse(await readFile('vercel.json','utf8'));
const headers=Object.fromEntries((vercel.headers.find(row=>row.source==='/(.*)')?.headers||[]).map(row=>[row.key,row.value]));
const server=await preview({preview:{host:'127.0.0.1',port:4182,strictPort:true,headers}});
const results=[];
const run=task=>new Promise(done=>{
 const started=Date.now(),logs=[];
 const child=spawn(process.execPath,[task.script],{env:{...process.env,PSI_UI_URL:url},stdio:['ignore','pipe','pipe']});
 for(const channel of [child.stdout,child.stderr])channel.on('data',chunk=>{const line=String(chunk);logs.push(line);process.stdout.write(line);});
 let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},180000);
 child.on('error',error=>{clearTimeout(timeout);done({name:task.name,owner:task.owner,status:'FAIL',error:error.message,durationMs:Date.now()-started});});
 child.on('close',code=>{clearTimeout(timeout);done({name:task.name,owner:task.owner,status:!timedOut&&code===0?'PASS':'FAIL',exitCode:code,timedOut,durationMs:Date.now()-started,logTail:logs.join('').slice(-2200)});});
});
try{
 for(const task of scenarios){
  console.log('[PSI company browser] Starting '+task.owner+' / '+task.name);
  const result=await run(task);
  results.push(result);
  console.log('[PSI company browser] '+result.name+' '+result.status);
  if(result.status!=='PASS')break;
 }
}finally{
 await new Promise(r=>server.httpServer.close(r));
 const summary={status:results.length===scenarios.length&&results.every(result=>result.status==='PASS')?'PASS':'FAIL',syntheticOnly:true,paidAiCalls:0,realWorkerRecords:false,plannedScenarios:scenarios.length,completedScenarios:results.length,results};
 await writeFile(resolve(output,'cross-module-browser.json'),JSON.stringify(summary,null,2)+'\n');
 console.log('[PSI company browser] '+summary.status+' '+results.filter(x=>x.status==='PASS').length+'/'+scenarios.length);
 if(summary.status!=='PASS')process.exitCode=1;
}
