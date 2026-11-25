/** NEW-PSI L17 source-only security & OSS boundary gate.
 * No remote requests, worker records, credentials, or database access.
 * This checks source invariants; it does not certify running server RLS or license law.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd();
const read=async path=>readFile(resolve(root,path),'utf8');
const json=async path=>JSON.parse(await read(path));
const [config,manifest,oss,packageInfo,localSource,vite,share,admin,auth]=await Promise.all([
 json('vercel.json'),json('public/field-local-l14.webmanifest'),
 json('config/psi-oss-candidate-manifest.json'),json('package.json'),
 read('field-local/main.tsx'),read('vite.config.ts'),
 read('api/inspection-share.ts'),read('api/admin.ts'),
 read('lib/server/admin/auth.ts'),
]);
const findings=[];
const check=(id,ok,detail)=>findings.push({id,status:ok?'PASS':'FAIL',detail});
const header=(source,key)=>{
 const rule=config.headers?.find(rule=>rule.source===source);
 return (rule?.headers||[]).find(h=>h.key.toLowerCase()===key.toLowerCase())?.value?.toLowerCase()||'';
};
for(const route of ['/field-local','/field-local/','/field-local/index.html']){
 check('local-noindex-'+route,header(route,'X-Robots-Tag').includes('noindex')&&header(route,'X-Robots-Tag').includes('nofollow'),'Device-local page must not be indexed; source-only Vercel header check');
 check('local-referrer-'+route,header(route,'Referrer-Policy')==='no-referrer','Local device page must not forward its URL as referrer to other sites');
}
check('share-api-no-store',share.includes("res.setHeader('Cache-Control','private, no-store, max-age=0')")&&share.includes("res.setHeader('Referrer-Policy','no-referrer')")&&share.includes("res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive')"),'Share reply should not be cached or indexed');
check('share-token-and-rate',share.includes("hash=shareHash(b.token)")&&share.includes('shareTokenFromHash(b.token)')&&share.includes('consumeApiQuota(db,q)')&&share.includes('psi_inspector_share_active'),'Hashed share tokens, durable active-state RPC and rate gate remain in source');
check('no-service-secret-share',share.includes('includeAdminSecret:false'),'Public share handler should not request admin service secret');
check('admin-no-store',header('/api/(.*)','Cache-Control').includes('no-store')&&admin.includes("res.setHeader('Cache-Control', 'no-store')"),'Admin API responses should not be cached');
check('admin-auth-guard',auth.includes('isValidAdminAuthRequest(req)')&&auth.includes('consumeApiQuota(supabase')&&auth.includes('buildAdminSessionCookie'),'Auth handler keeps session check and login attempt quota');
const globalCsp=header('/(.*)','Content-Security-Policy');
check('baseline-csp-and-privacy',globalCsp.includes("object-src 'none'")&&globalCsp.includes("frame-ancestors 'none'")&&globalCsp.includes("default-src 'self'")&&header('/(.*)','Permissions-Policy').includes('microphone=()')&&header('/(.*)','Permissions-Policy').includes('geolocation=()'),'Global policy baseline, not a penetration test');
check('local-isolated-scope',manifest.id==='/field-local/'&&manifest.start_url==='/field-local/'&&manifest.scope==='/field-local/'&&vite.includes("scope:'/field-local/'")===false&&localSource.includes("scope:'/field-local/'"),'PWA scope stays isolated, never product-wide');
check('local-offline-no-network',!/(?:\bfetch\s*\(|sendBeacon\s*\(|postAdminJson\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\()/i.test(localSource)&&localSource.includes('브라우저 신호일 뿐 현장 인터넷 속도·서버 접속 성공을 확인하지 않습니다.')&&localSource.includes('클라우드로 자동 전송되지 않습니다.'),'Local entry adds no API probe, telemetry or automatic upload');
check('local-cache-not-private',vite.includes("const urls=['/field-local/index.html'")&&!vite.includes("const urls=['/api/")&&vite.includes('VERIFY_LOCAL_ASSETS'),'Service worker static asset allowlist must exclude API responses');
check('local-data-disclosure',localSource.includes('같은 브라우저 프로필을 공유하는 사람도 기록을 볼 수 있습니다.')&&localSource.includes('영구 보존을 뜻하지 않습니다'),'Local profile visibility and retention boundaries disclosed');
const candidates=oss.reviewedSources||[];
const permitted=new Set(['debpalash/VoiceStudio','heygen-com/hyperframes','mattpocock/skills','NandhaKishorM/laya','shader-effects-inc/shaders','morluto/rea','cathrynlavery/diagram-design']);
check('reviewed-candidate-inventory',candidates.length===7&&new Set(candidates.map(c=>c.repository)).size===7&&candidates.every(c=>permitted.has(c.repository)),'Unknown open-source candidate requires separate documented review');
check('no-candidate-production',candidates.every(c=>c.productionDependency===false)&&oss.permittedVendoredSource?.scope==='development-only'&&oss.permittedVendoredSource?.repository==='mattpocock/skills','Reviewed candidate source is not authorized as runtime dependency');
const runtime=Object.keys(packageInfo.dependencies||{});
const forbidden=['voicestudio','hyperframes','laya','shader-effects','@morluto/rea','diagram-design','@mattpocock/skills','rea'];
check('no-unapproved-runtime-package',runtime.every(dep=>!forbidden.some(name=>dep.toLowerCase()===name||dep.toLowerCase().includes('/'+name))), 'No known held/review-only source may enter package.json runtime without review');
const warnings=[];
if(globalCsp.includes('connect-src')&&(/connect-src[^;]*https:/.test(globalCsp)||/connect-src[^;]*wss:/.test(globalCsp)))
 warnings.push('REVIEW: global CSP connect-src permits broad https:/wss:; inventory real API domains and test a narrower allowlist before changing production policy.');
if(globalCsp.includes("'unsafe-inline'"))warnings.push('REVIEW: global CSP permits inline scripts/styles; assess nonces/hashes against existing integrations before removing.');
warnings.push('UNVERIFIED: source checks do not exercise live Supabase RLS/tenant isolation, revocation races, real browser headers, secure deletion or third-party license updates.');
const result={schema:'psi-l17-static-boundary-v1',date:new Date().toISOString(),sourceOnly:true,product:'NEW-PSI',passed:findings.every(x=>x.status==='PASS'),checks:findings,warnings};
await mkdir('artifacts/audit/psi-l17-security',{recursive:true});
await writeFile('artifacts/audit/psi-l17-security/result.json',JSON.stringify(result,null,2)+'\n');
console.log('[PSI L17] '+(result.passed?'PASS':'FAIL')+' '+findings.filter(x=>x.status==='PASS').length+'/'+findings.length+' source-only checks');
for(const f of findings.filter(x=>x.status==='FAIL'))console.error('[PSI L17] '+f.id+': '+f.detail);
for(const warning of warnings)console.log('[PSI L17] '+warning);
if(!result.passed)process.exitCode=1;
