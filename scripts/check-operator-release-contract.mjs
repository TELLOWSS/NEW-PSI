import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
const p=JSON.parse(read('package.json')),v=JSON.parse(read('vercel.json')),rules=JSON.parse(read('config/psi-product-boundaries.json'));
const errors=[];const check=(b,m)=>{if(!b)errors.push(m);};
check(v.buildCommand==='npm run build:verified','Do not remove validated deployment build until required CI gates are independently enforced.');
check(p.scripts['build:verified']?.includes('verify:ci'),'Verified build must include release CI.');
check(p.scripts['verify:fast']?.includes('check:operator-release'),'Operator release policy check must run in fast CI.');
check(read('vite.config.ts').includes('__PSI_RELEASE_COMMIT__'),'Build must embed a nonsecret code fingerprint.');
check(read('pages/Settings.tsx').includes('<OperatorReleaseProof />'),'Admin Settings must expose provenance/backup caveat.');
check(read('pages/InspectorStandalone.tsx').includes('currentReleaseLabel()'),'Standalone Inspector must expose code identity after login.');
check(rules.rules['psi-core'].programSharedWithWorkers===false,'PSI main operator application must not be distributed to workers.');
check(rules.rules['psi-inspector'].programSharedWithWorkers===false,'Inspector operator workspace must not be distributed to workers.');
check(rules.rules['psi-inspector'].authRequired===true,'Standalone Inspector auth must remain enabled.');
check(rules.rules['partner-safety-expense'].autoMergeAllowed===false,'Independent partner expense ledger must not be merged.');
check(read('utils/encryptedLocalBackupArchive.ts').includes('verifyLocalArchiveRestore'),'Existing encrypted local archive must still offer full verification.');
check(read('pages/Settings.tsx').includes('FreeTierCapacityPlanner'),'Existing manual capacity planner must remain available.');
if(errors.length){console.error('[operator-release] FAIL\n'+errors.map(x=>'- '+x).join('\n'));process.exitCode=1;}
else console.log('[operator-release] PASS: admin-only audience, code provenance, backup caveat, verified-build, partner-expense isolation. NOT a substitute for live deployment/restore QA.');
