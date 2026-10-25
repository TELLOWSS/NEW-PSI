import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const vercel=JSON.parse(read('vercel.json'));
const boundaries=JSON.parse(read('config/psi-product-boundaries.json'));
const pkg=JSON.parse(read('package.json'));
const errors=[];
const expect=(condition,message)=>{if(!condition)errors.push(message);};
expect(vercel.buildCommand==='npm run build:verified','Vercel should retain full verified build until GitHub required checks and deployment gates are independently verified.');
expect(pkg.scripts?.['build:verified']?.includes('verify:ci'),'Verified deployment build must include CI before production release.');
expect(pkg.scripts?.['verify:fast']?.includes('check:free-tier-capacity'),'Free-tier capacity preflight must run in CI.');
const funcs=vercel.functions||{};
for(const [name,opts] of Object.entries(funcs)){
    const duration=opts?.maxDuration;
    expect(Number.isInteger(duration)&&duration>0&&duration<=300,`${name}: maxDuration must be integer <=300 seconds, current Hobby Fluid upper reference. Check actual project Fluid setting for >60s.`);
}
expect(boundaries.rules['partner-safety-expense'].autoMergeAllowed===false,'Partner safety expense records must remain separate.');
expect(boundaries.rules['partner-safety-expense'].includeInInspector===false,'No partner ledger in Inspector.');
expect(boundaries.rules['psi-inspector'].standaloneEntry==='/inspector','Inspector must preserve standalone entry.');
expect(boundaries.rules['psi-inspector'].authRequired===true,'Standalone Inspector must require authenticated admin.');
expect(vercel.rewrites?.some(rule=>rule.source.includes('(?!api/)')&&rule.destination==='/index.html'),'Standalone /inspector must have the SPA fallback without exposing APIs.');
if(errors.length){console.error('[hobby-capacity] FAIL\n'+errors.map(e=>'- '+e).join('\n'));process.exitCode=1;}
else console.log('[hobby-capacity] PASS: verified build, function-duration ceiling, standalone authorization/expense isolation. WARNING: actual plan, Fluid runtime, CPU, usage and legal/commercial eligibility require provider dashboard checks.');
