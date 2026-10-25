import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const run=(packages:Record<string,{version:string;license?:string}>)=>{
 const dir=mkdtempSync(join(tmpdir(),'psi-oss-guard-')),lock=join(dir,'lock.json'),policy=join(dir,'policy.json');
 writeFileSync(lock,JSON.stringify({packages:{'':{name:'new-psi'},...Object.fromEntries(Object.entries(packages).map(([name,v])=>['node_modules/'+name,v]))}}));
 writeFileSync(policy,JSON.stringify({regularAllowed:['MIT','Apache-2.0','(MIT OR GPL-3.0-or-later)'],reviewRequired:['MPL-2.0','CC-BY-4.0'],existingReviewInventory:[{name:'lightningcss',version:'1.33.0',license:'MPL-2.0'}]}));
 try{return {ok:true,out:execFileSync('node',['scripts/verify-oss-licenses.mjs','--lock',lock,'--policy',policy,'--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})};}
 catch(e){return {ok:false,out:String((e as {stdout?:string}).stdout||'')};}
 finally{rmSync(dir,{recursive:true,force:true});}
};
describe('offline OSS commercial gate',()=>{
 it('allows exact permissive identifiers and dual MIT choice',()=>{
  const r=run({react:{version:'1',license:'MIT'},engine:{version:'1',license:'Apache-2.0'},zip:{version:'1',license:'(MIT OR GPL-3.0-or-later)'}});
  expect(r.ok).toBe(true);expect(JSON.parse(r.out).packages).toBe(3);
 });
 it('blocks new copyleft-only, proprietary and missing SPDX declarations',()=>{
  for(const lic of ['AGPL-3.0-only','GPL-3.0-only','BUSL-1.1',undefined]){
   const r=run({future:{version:'1',...(lic?{license:lic}:{})}});
   expect(r.ok).toBe(false);expect(JSON.parse(r.out).errors).toHaveLength(1);
  }
 });
 it('requires review for new MPL files or any version change',()=>{
  expect(run({other:{version:'2.0.0',license:'MPL-2.0'}}).ok).toBe(false);
  expect(run({lightningcss:{version:'1.34.0',license:'MPL-2.0'}}).ok).toBe(false);
  const existing=run({lightningcss:{version:'1.33.0',license:'MPL-2.0'}});
  expect(existing.ok).toBe(true);expect(JSON.parse(existing.out).warnings).toHaveLength(1);
 });
});
