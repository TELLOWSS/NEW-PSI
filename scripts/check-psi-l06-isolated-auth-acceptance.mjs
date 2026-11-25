/**
 * L06 real Supabase evidence ledger: STRICT read-only validation.
 * Does not contact any database, load auth tokens, run SQL or grant release approval.
 * A paper PASS must not be interpreted as proof until an independent human
 * verifies each cited private evidence item and approves the isolated project.
 */
import {readFileSync} from 'node:fs';

const ledgerPath=process.argv[2]||'config/psi-l06-isolated-auth-acceptance-ledger.json';
const acceptancePath='docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md';
const forbiddenProjects=new Set(['dpnmslogvwuzmighsgnt','reyevthxmksdmcomtrhs']);
const expected=Array.from({length:25},(_,i)=>'A'+String(i+1).padStart(2,'0'));
const statuses=new Set(['not-run','blocked','fail','pass']);
const shaPattern=/^[0-9a-f]{40}$/;
const errors=[];

// Evidence is recorded in a Git-tracked manifest. Never permit signed URLs,
// userinfo credentials, local-only URLs or bearer/JWT-like secrets in fields.
// Offline structural checks cannot prove the external document exists.
function isSafeEvidenceLink(value){
  if(typeof value!=='string'||value.length>1024||!/^https:\/\//i.test(value))
    return false;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||
       url.search||url.hash||url.port||
       !url.hostname.includes('.')||
       /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1)/i.test(url.hostname)||
       /(?:^|\.)localhost$/i.test(url.hostname)||
       /(?:^|\.)internal$/i.test(url.hostname))return false;
    // Do not commit a JWT or service key in a URL path either.
    if(hasSensitiveValue(decodeURIComponent(url.pathname)))return false;
    return true;
  }catch{return false;}
}
function hasSensitiveValue(value){
  if(typeof value!=='string')return false;
  return /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(value)||
    /\bBearer\s+[A-Za-z0-9._~-]{12,}/i.test(value)||
    /sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/.test(value)||
    /(?:postgres(?:ql)?:\/\/)[^\s]{6,}/i.test(value)||
    /(?:password|refresh_token|access_token|service_role_key)\s*[:=]\s*["']?[^\s"']{6,}/i.test(value);
}
let ledger;
try{
  ledger=JSON.parse(readFileSync(ledgerPath,'utf8'));
}catch{
  console.error('[PSI L06 AUTH] SOURCE_CONTRACT_FAIL: unreadable JSON ledger');
  process.exit(1);
}
let md='';
try{md=readFileSync(acceptancePath,'utf8');}
catch{errors.push('acceptance source document is unavailable');}
const documented=[...md.matchAll(/^\|\s*(A\d{2})\s*\|/gm)].map(m=>m[1]);
if(documented.length!==25||new Set(documented).size!==25||
   expected.some((id,i)=>documented[i]!==id))
  errors.push('A01-A25 acceptance source does not match the ledger');
if(ledger.schema!=='psi-l06-isolated-auth-evidence-ledger-v1'||
   ledger.repository!=='TELLOWSS/NEW-PSI'||ledger.candidatePr!==237)
  errors.push('ledger repository, PR or schema mismatch');
const env=ledger.environment;
if(!env || typeof env!=='object'||typeof env.approved!=='boolean')
  errors.push('environment approval state missing');
else{
  const ref=env.projectRef;
  if(ref!==null && (typeof ref!=='string'||!/^[a-z0-9]{20}$/.test(ref)))
    errors.push('invalid isolated project reference');
  if(typeof ref==='string' && forbiddenProjects.has(ref))
    errors.push('production or unapproved existing Supabase project is FORBIDDEN');
  if(env.approved){
    if(typeof ref!=='string'||!ref.trim()||
       typeof env.approvedBy!=='string'||env.approvedBy.trim().length<3||
       !isSafeEvidenceLink(env.approvalEvidence)||
       hasSensitiveValue(env.approvedBy))
      errors.push('an approved test environment needs identifiable owner and HTTPS approval evidence');
  }else if(ref!==null||env.approvedBy!==null||env.approvalEvidence!==null){
    errors.push('an unapproved environment cannot have an assigned project or approval evidence');
  }
}
if(!Array.isArray(ledger.cases)||ledger.cases.length!==25)
  errors.push('expected 25 explicit acceptance cases');
const found=new Set();
const counts={'not-run':0,blocked:0,fail:0,pass:0};
for(const c of Array.isArray(ledger.cases)?ledger.cases:[]){
  if(!c||typeof c!=='object'||typeof c.id!=='string'||!expected.includes(c.id)||found.has(c.id)){
    errors.push('duplicate, missing or invalid acceptance case id');
    continue;
  }
  found.add(c.id);
  if(!statuses.has(c.status)){errors.push('invalid state for '+c.id);continue;}
  counts[c.status]++;
  if(c.status==='not-run'){
    if(c.evidence!==null||c.reviewedBy!==null||c.reviewedAt!==null||
       c.sourceSha!==null||c.reason!==null)
      errors.push(c.id+' NOT RUN must not contain fabricated evidence');
  }else{
    if(typeof c.reason!=='string'||c.reason.trim().length<8)
      errors.push(c.id+' needs a meaningful decision reason');
    if(typeof c.reviewedBy!=='string'||c.reviewedBy.trim().length<3)
      errors.push(c.id+' needs an independent named reviewer');
    if(typeof c.reviewedAt!=='string'||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(c.reviewedAt)||
       !Number.isFinite(Date.parse(c.reviewedAt)))
      errors.push(c.id+' needs a UTC review time');
    if(!isSafeEvidenceLink(c.evidence))
      errors.push(c.id+' needs a stable, non-secret HTTPS evidence reference without query/fragment/userinfo');
    if(hasSensitiveValue(c.reason)||hasSensitiveValue(c.reviewedBy))
      errors.push(c.id+' contains sensitive token-like content in a review field');
    if(!shaPattern.test(String(c.sourceSha||'')))
      errors.push(c.id+' needs a source commit SHA');
    if(c.status==='pass'&&env?.approved!==true)
      errors.push(c.id+' cannot PASS before independent sandbox approval');
  }
}
if(found.size!==25)errors.push('all A01-A25 must be present exactly once');
if(errors.length){
  console.error('[PSI L06 AUTH] SOURCE_CONTRACT_FAIL: '+errors.join('; '));
  process.exit(1);
}
const pending=counts['not-run']+counts.blocked+counts.fail;
console.log('[PSI L06 AUTH] LEDGER_SOURCE_CONTRACT_PASS; A01-A25='+found.size+
  '; PASS='+counts.pass+'; NOT_RUN='+counts['not-run']+
  '; BLOCKED='+counts.blocked+'; FAIL='+counts.fail+
  '; REAL_AUTH_ACCEPTANCE='+(pending?'BLOCKED':'EVIDENCE_REVIEW_REQUIRED')+
  '; RELEASE=BLOCKED');
console.log('[PSI L06 AUTH] No external calls or SQL executed. This is a ledger integrity check, not real Auth/RLS verification.');
