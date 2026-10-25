/* PSI company governance: deterministic, read-only ownership audit. No credentials or worker records. */
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const config=JSON.parse(fs.readFileSync('config/psi-company-ownership.json','utf8'));
const ids=new Set(config.departments.map(dept=>dept.id));
const named=JSON.parse(fs.readFileSync('config/psi-company-agent-roster.json','utf8'));
const products=JSON.parse(fs.readFileSync('config/psi-company-product-registry.json','utf8'));

const errors=[];
function validateRule(rule,name){
 if(!ids.has(rule.owner))errors.push(name+': owner is unknown');
 if(!Array.isArray(rule.review)||!rule.review.length||new Set(rule.review).size!==rule.review.length)errors.push(name+': reviewers missing or repeated');
 else for(const id of rule.review){if(!ids.has(id)||id===rule.owner)errors.push(name+': invalid or self reviewer '+id);}
 if(!['standard','high','critical'].includes(rule.risk))errors.push(name+': invalid risk');
 if(rule.risk!=='standard'&&rule.owner!=='qa'&&!rule.review.includes('qa'))errors.push(name+': independent QA reviewer required');
}
if(config.departments.length!==6||ids.size!==6)errors.push('Six distinct departments are required');
if(named.chief?.id!=='cto'||named.chief?.name!=='아틀라스')errors.push('Chief operating role must be ATLAS');
const roleIds=new Set(),roleNames=new Set();
for(const agent of named.departments||[]){
 if(roleIds.has(agent.id)||roleNames.has(agent.name))errors.push('Repeated agent identity '+agent.id);
 roleIds.add(agent.id);roleNames.add(agent.name);
 if(!ids.has(agent.id)||!(agent.authority||[]).length||!(agent.reviewWith||[]).length)errors.push('Missing agent responsibility '+agent.id);
}
for(const id of ids)if(!roleIds.has(id))errors.push('Missing named team owner '+id);
if((products.products||[]).length!==7)errors.push('Seven Vercel products must be mapped');
const githubIds=new Set(),vercelIds=new Set();
for(const product of products.products||[]){
 if(!String(product.github||'').startsWith('TELLOWSS/')||!String(product.vercelProjectId||'').startsWith('prj_'))errors.push('Unverified product identity '+product.id);
 if(githubIds.has(product.github)||vercelIds.has(product.vercelProjectId))errors.push('Duplicate product routing '+product.id);
 githubIds.add(product.github);vercelIds.add(product.vercelProjectId);
}
for(const file of ['AGENTS.md','.agents/skills/psi-ai-company/SKILL.md','skills/psi-ai-company/SKILL.md','skills/psi-ai-company/templates/PRODUCT_PROFILE.md','docs/psi-ai-company/NEW_CHAT_HANDOFF.md'])if(!fs.existsSync(file))errors.push('Missing persistent new chat skill: '+file);
if(fs.existsSync('.agents/skills/psi-ai-company/SKILL.md')&&fs.readFileSync('.agents/skills/psi-ai-company/SKILL.md','utf8')!==fs.readFileSync('skills/psi-ai-company/SKILL.md','utf8'))errors.push('Skill alias diverged from discoverable skill');

const prefixes=new Set();
for(const rule of config.responsibility){validateRule(rule,rule.prefix);if(prefixes.has(rule.prefix))errors.push('duplicate '+rule.prefix);prefixes.add(rule.prefix);}
validateRule(config.fallback,'fallback');
const reviewed=JSON.parse(fs.readFileSync('config/psi-company-progress.json','utf8'));
const snapshotIds=new Set();
for(const item of reviewed.departments||[]){
 if(!ids.has(item.id)||snapshotIds.has(item.id))errors.push('Invalid or repeated progress department: '+item.id);
 snapshotIds.add(item.id);
 if(!['pass','blocked','review','unverified'].includes(item.status))errors.push('Invalid progress state: '+item.id);
 if(!Number.isInteger(item.passed)||!Number.isInteger(item.total)||item.passed<0||item.total<item.passed)errors.push('Invalid progress check count: '+item.id);
 if(item.status==='pass'&&(item.total===0||item.passed!==item.total))errors.push('Cannot claim unverified progress as passed: '+item.id);
 if(!String(item.finding||'').trim()||!String(item.improvement||'').trim())errors.push('Missing finding or improvement: '+item.id);
 if(!String(item.evidence||'').startsWith('https://github.com/TELLOWSS/NEW-PSI/'))errors.push('Progress evidence must refer to PSI GitHub: '+item.id);
}
for(const id of ids)if(!snapshotIds.has(id))errors.push('Missing department progress: '+id);
if(!String(reviewed.sourceRun||'').startsWith('https://github.com/TELLOWSS/NEW-PSI/actions/runs/'))errors.push('Missing independent CI run evidence');
if(!Array.isArray(reviewed.activity)||reviewed.activity.length===0)errors.push('Missing progress history');
for(const item of reviewed.activity||[])if(!ids.has(item.department))errors.push('History has unknown department: '+item.department);

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
const requiredScripts=['scripts/verify-psi-company-visibility-ui.mjs','scripts/verify-psi-company-browser.mjs','scripts/verify-inspector-production.mjs','scripts/verify-psi-current-metrics-ui.mjs','scripts/verify-survey-baseline-ui.mjs','scripts/verify-plain-language-ui.mjs','scripts/verify-worker-report-ui.mjs','scripts/verify-safety-case-closed-loop-ui.mjs'];
for(const file of requiredScripts)if(!fs.existsSync(file))errors.push('Missing required coverage: '+file);
const output={date:new Date().toISOString(),pass:!errors.length,totalTrackedFiles:files.length,coverageByDepartment:accountable,criticalPaths:critical.length,errors};
fs.mkdirSync(path.join('artifacts','audit','psi-company'),{recursive:true});
fs.writeFileSync('artifacts/audit/psi-company/ownership.json',JSON.stringify(output,null,2)+'\n');
console.log('[PSI Company Ownership] '+(output.pass?'PASS':'FAIL')+' '+files.length+' tracked files / '+ids.size+' departments');
for(const [id,info]of Object.entries(accountable))console.log('  '+id+': '+info.fileCount+' files, '+info.critical+' critical');
for(const error of errors)console.error('  ERROR '+error);
if(errors.length)process.exitCode=1;
