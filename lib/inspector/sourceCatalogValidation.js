/** Shared browser/CLI validation. No network, database, dynamic code or paid calls. */
export const MAX_CATALOG_BYTES=196608;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const nullableDate=x=>x===null||date(x);
const text=(x,max=2000)=>typeof x==='string'&&x.length<=max;
export const officialSourceUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(?:[a-z0-9-]+\.)*(?:law\.go\.kr|moel\.go\.kr|kosha\.or\.kr)$/.test(u.hostname);}catch{return false;}};
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
export const sourceContentJson=value=>{const {sourceReview,...content}=value;return stable(content);};
const exact=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k));
/** @param {any} value @param {{baseline?:any,expectedDigests?:Record<string,string>,expectedUrls?:Record<string,string[]>,day?:string}} options */
export function validateSourceCatalog(value,{baseline,expectedDigests,expectedUrls,day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}={}){
    const errors=[],fail=message=>errors.push(message);
    if(new TextEncoder().encode(JSON.stringify(value)||'').length>MAX_CATALOG_BYTES)return ['자료 검토파일은 192KiB 이하여야 합니다.'];
    if(!exact(value,['schemaVersion','version','records'])||value.schemaVersion!==1||!Number.isInteger(value.version)||value.version<1||!Array.isArray(value.records)||value.records.length>100)return ['지원하지 않는 자료 검토파일 형식입니다.'];
    const keys=new Set();
    for(const record of value.records){
        if(!exact(record,['key','revisions'])||!text(record.key,100)||!/^(legal|case|trend):[a-z0-9-]+$/.test(record.key)||!Array.isArray(record.revisions)||!record.revisions.length||record.revisions.length>30){fail('자료 키 또는 검토 이력 형식이 잘못되었습니다.');continue;}
        if(keys.has(record.key))fail('중복 자료 키: '+record.key);keys.add(record.key);
        for(const [index,r] of record.revisions.entries()){
            if(!exact(r,['revision','status','publisher','urls','publishedAt','checkedAt','reviewedAt','reviewDueAt','reviewer','evidence','contentSha256','legalEditions','note'])||r.revision!==index+1||!['legacy','pending','reviewed','withdrawn'].includes(r.status)||!text(r.publisher,200)||!r.publisher.trim()||!Array.isArray(r.urls)||!r.urls.length||r.urls.length>20||!r.urls.every(officialSourceUrl)||!['publishedAt','checkedAt','reviewedAt','reviewDueAt'].every(k=>nullableDate(r[k]))||!(r.reviewer===null||text(r.reviewer,200)&&r.reviewer.trim())||!text(r.evidence)||!text(r.note)||!text(r.contentSha256,64)||!/^[a-f0-9]{64}$/.test(r.contentSha256)||!Array.isArray(r.legalEditions)||r.legalEditions.length>20){fail(record.key+': 검토 정보·공식 출처·날짜 형식 오류');continue;}
            if(r.checkedAt&&r.checkedAt>day||r.reviewedAt&&r.reviewedAt>day)fail(record.key+': 미래 일자를 확인·검토일로 사용할 수 없습니다.');
            if(r.status==='reviewed'&&(!r.checkedAt||!r.reviewedAt||!r.reviewDueAt||!r.reviewer||!r.evidence.trim()||r.checkedAt>r.reviewedAt||r.reviewDueAt<r.reviewedAt))fail(record.key+': 원문 확인·검토자·근거·재검토 기한을 기록하세요.');
            if(r.checkedAt&&r.publishedAt&&r.publishedAt>r.checkedAt)fail(record.key+': 공개일이 원문 확인일보다 늦습니다.');
            const editions=new Set();
            for(const edition of r.legalEditions){
                if(!exact(edition,['version','promulgatedAt','effectiveFrom','effectiveTo','url','note'])||!text(edition.version,100)||!edition.version.trim()||editions.has(edition.version)||!officialSourceUrl(edition.url)||!['promulgatedAt','effectiveFrom','effectiveTo'].every(k=>nullableDate(edition[k]))||!text(edition.note)||edition.effectiveTo&&(!edition.effectiveFrom||edition.effectiveTo<edition.effectiveFrom))fail(record.key+': 시행본·개정 이력 오류');
                if(object(edition))editions.add(edition.version);
            }
        }
        const current=record.revisions.at(-1);
        if(expectedUrls?.[record.key]?.some(url=>!Array.isArray(current?.urls)||!current.urls.includes(url)))fail(record.key+': 자료 본문에 연결된 공식 원문 출처를 유지하세요.');
        if(expectedDigests&&(!Object.hasOwn(expectedDigests,record.key)||current?.contentSha256!==expectedDigests[record.key]))fail(record.key+': 현재 자료 내용과 검토 해시가 다릅니다. 새 검토 이력을 추가하세요.');
    }
    if(expectedDigests)for(const key of Object.keys(expectedDigests))if(!keys.has(key))fail('검토 상태가 누락된 자료: '+key);
    if(baseline){
        if(value.version<=baseline.version)fail('갱신본 버전을 현재 버전보다 높여 주세요.');
        for(const prior of baseline.records){const next=value.records.find(r=>r?.key===prior.key);if(!next||!Array.isArray(next.revisions)||stable(next.revisions.slice(0,prior.revisions.length))!==stable(prior.revisions))fail(prior.key+': 과거 검토 이력 삭제·수정은 허용하지 않습니다.');}
        if(!value.records.some(r=>object(r)&&Array.isArray(r.revisions)&&r.revisions.length>(baseline.records.find(b=>b.key===r.key)?.revisions.length||0)))fail('변경된 검토 이력이 없습니다.');
    }
    return errors;
}
