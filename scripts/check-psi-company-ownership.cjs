/* PSI company governance: deterministic, read-only ownership audit. No credentials or worker records. */
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const config=JSON.parse(fs.readFileSync('config/psi-company-ownership.json','utf8'));
const ids=new Set(config.departments.map(dept=>dept.id));
const errors=[];
function validateRule(rule,name){
 if(!ids.has(rule.owner))errors.push(name+': owner is unknown');
 if(!Array.isArray(rule.review)||!rule.review.length||new Set(rule.review).size!==rule.review.length)errors.push(name+': reviewers missing or repeated');
 else for(const id of rule.review){if(!ids.has(id)||id===rule.owner)errors.push(name+': invalid or self reviewer '+id);}
 if(!['standard','high','critical'].includes(rule.risk))errors.push(name+': invalid risk');
 if(rule.risk!=='standard'&&rule.owner!=='qa'&&!rule.review.includes('qa'))errors.push(name+': independent QA reviewer required');
}
if(config.departments.length!==6||ids.size!==6)errors.push('Six distinct departments are required');
const prefixes=new Set();
for(const rule of config.responsibility){validateRule(rule,rule.prefix);if(prefixes.has(rule.prefix))errors.push('duplicate '+rule.prefix);prefixes.add(rule.prefix);}
validateRule(config.fallback,'fallback');
const files=cp.execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const accountable={},critical=[];
const sensitive=/^(api\/|supabase\/|supabase_|lib\/server\/|lib\/inspector\/|components\/inspector\/|\.github\/workflows\/)/;
const ruleFor=file=>config.responsibility.find(rule=>file.startsWith(rule.prefix))||config.fallback;
for(const file of files){
 const rule=ruleFor(file);const entry=accountable[rule.owner]||(accountable[rule.owner]={fileCount:0,critical:0,high:0,samples:[]});
 entry.fileCount++;if(entry.samples.length<5)entry.samples.push(file);
 if(rule.risk==='critical'){entry.critical++;critical.push(file);}else if(rule.risk==='high')entry.high++;
 if(sensitive.test(file)&&rule===config.fallback)errors.push('Critical path unowned: '+file);
}
for(const prefix of config.criticalPaths)if(!files.some(file=>file.startsWith(prefix)))errors.push('Required product boundary missing: '+prefix);
const requiredScripts=['scripts/verify-psi-company-browser.mjs','scripts/verify-inspector-production.mjs','scripts/verify-psi-current-metrics-ui.mjs','scripts/verify-survey-baseline-ui.mjs','scripts/verify-plain-language-ui.mjs','scripts/verify-worker-report-ui.mjs','scripts/verify-safety-case-closed-loop-ui.mjs'];
for(const file of requiredScripts)if(!fs.existsSync(file))errors.push('Missing required coverage: '+file);
const output={date:new Date().toISOString(),pass:!errors.length,totalTrackedFiles:files.length,coverageByDepartment:accountable,criticalPaths:critical.length,errors};
fs.mkdirSync(path.join('artifacts','audit','psi-company'),{recursive:true});
fs.writeFileSync('artifacts/audit/psi-company/ownership.json',JSON.stringify(output,null,2)+'\n');
console.log('[PSI Company Ownership] '+(output.pass?'PASS':'FAIL')+' '+files.length+' tracked files / '+ids.size+' departments');
for(const [id,info]of Object.entries(accountable))console.log('  '+id+': '+info.fileCount+' files, '+info.critical+' critical');
for(const error of errors)console.error('  ERROR '+error);
if(errors.length)process.exitCode=1;
