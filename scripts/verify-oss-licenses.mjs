#!/usr/bin/env node
/**
 * Static, offline licensing gate. No network, new dependencies or production API.
 * This checks npm lockfile SPDX declarations only, NOT source-level artwork,
 * trademarks, datasets, font licenses, sublicenses, copyrights or patents.
 */
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const flag=(key,defaultPath)=>{const i=process.argv.indexOf(key);return i<0?path.join(root,defaultPath):path.resolve(process.argv[i+1]||'');};
const manifest=JSON.parse(fs.readFileSync(flag('--lock','package-lock.json'),'utf8'));
const policy=JSON.parse(fs.readFileSync(flag('--policy','config/psi-oss-license-policy.json'),'utf8'));
const regular=new Set(policy.regularAllowed),needsReview=new Set(policy.reviewRequired);
const baseline=new Map(policy.existingReviewInventory.map(({name,version,license})=>[name,{version,license}]));
const packages=Object.entries(manifest.packages||{}).filter(([name])=>name.startsWith('node_modules/'))
 .map(([p,v])=>({name:p.substring('node_modules/'.length),version:v.version,license:v.license}));
const errors=[],warnings=[],counts={};
const seen=new Set();
for(const item of packages){
 const lic=item.license;counts[String(lic||'MISSING')]=(counts[String(lic||'MISSING')]||0)+1;
 if(typeof lic!=='string'||!lic.trim()){errors.push(item.name+': package-lock license declaration missing');continue;}
 if(regular.has(lic))continue;
 if(needsReview.has(lic)){
  seen.add(item.name);
  const saved=baseline.get(item.name);
  if(!saved||saved.license!==lic||saved.version!==item.version){
   errors.push(item.name+'@'+item.version+': review-required license '+lic+' differs from frozen inventory; explicit commercial legal approval required');
  }else warnings.push(item.name+'@'+item.version+': '+lic+' exists in baseline, redistribution obligations NOT approved');
  continue;
 }
 errors.push(item.name+'@'+item.version+': unapproved SPDX declaration '+lic+' (no automatic license compatibility assumptions)');
}
for(const [name] of baseline)if(!seen.has(name))warnings.push(name+': removed from review inventory; clear the frozen baseline only after verifying change');
const out={ok:errors.length===0,packages:packages.length,licenseCounts:counts,unresolvedExistingReview:warnings.length,errors,warnings};
if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(out,null,2)+'\n');
else{
 console.log('[psi-oss] inspected '+packages.length+' pinned dependency entries · '+Object.keys(counts).length+' SPDX expression types');
 for(const [lic,n] of Object.entries(counts).sort((a,b)=>b[1]-a[1]))console.log('  '+lic+': '+n);
 console.log('[psi-oss] existing special-license files needing commercial NOTICE/legal review: '+warnings.length);
 for(const e of errors)console.error('[psi-oss] BLOCK '+e);
 console.log('[psi-oss] '+(out.ok?'PASS (declared-license gate only, NOT legal clearance)':'FAIL: license policy changed; review required'));
}
if(errors.length)process.exitCode=1;
