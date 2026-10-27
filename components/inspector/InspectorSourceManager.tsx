import React,{useState} from 'react';
import {sourceCatalog} from '../../lib/inspector/sourceReviewRegistry';
import {sourceReviewState,type SourceCatalog} from '../../lib/inspector/sourceReview';
import {MAX_CATALOG_BYTES,validateSourceCatalog} from '../../lib/inspector/sourceCatalogValidation';
const download=(catalog:SourceCatalog)=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(catalog,null,2)+'\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`inspector-source-reviews-v${catalog.version}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
/** Mounted only in the existing admin workspace. Imports are local previews,
 * never production mutations; repository permissions and PR release gates apply. */
export default function InspectorSourceManager(){
    const [candidate,setCandidate]=useState<SourceCatalog|null>(null),[errors,setErrors]=useState<string[]>([]),[loading,setLoading]=useState(false);
    const inspect=async(file:File)=>{
        setCandidate(null);setErrors([]);setLoading(true);
        try{
            if(file.size>MAX_CATALOG_BYTES)throw new Error('자료 검토파일은 192KiB 이하여야 합니다.');
            const value=JSON.parse(await file.text());
            const expectedDigests=Object.fromEntries(sourceCatalog.records.map(r=>[r.key,r.revisions[r.revisions.length-1].contentSha256]));
            const expectedUrls=Object.fromEntries(sourceCatalog.records.map(r=>[r.key,r.revisions[r.revisions.length-1].urls]));
            const problems=validateSourceCatalog(value,{baseline:sourceCatalog,expectedDigests,expectedUrls});
            if(problems.length)setErrors(problems);else setCandidate(value);
        }catch(error){setErrors([error instanceof Error?error.message:'검토파일을 읽지 못했습니다.']);}
        finally{setLoading(false);}
    };
    return <details className="si-source-manager"><summary>관리자 · 공식 안전정보 검토·갱신</summary>
        <p>현재 자료 검토파일 v{sourceCatalog.version} · {sourceCatalog.records.length}건. 파일을 내보내 검토 이력을 추가한 뒤 가져오면 변경을 미리 확인할 수 있습니다.</p>
        <p className="si-caption">미리보기는 이 기기에서만 처리됩니다. 실제 반영은 저장소 관리자가 검증 명령 → PR 검토 → 기존 릴리즈 게이트를 거쳐 진행합니다. 법령카드의 금액이나 적용 조건은 이 파일로 바꿀 수 없습니다.</p>
        <div className="si-quick-buttons"><button type="button" className="si-btn" onClick={()=>download(sourceCatalog)}>현재 검토파일 내보내기</button><label className="si-btn">갱신 후보 가져오기<input aria-label="공식자료 갱신 후보 JSON" type="file" accept="application/json,.json" disabled={loading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void inspect(file);}}/></label></div>
        {loading&&<p role="status">갱신 후보 검사 중…</p>}
        {errors.length>0&&<div role="alert"><b>반영할 수 없는 검토파일입니다.</b><ul>{errors.slice(0,10).map((error,n)=><li key={n}>{error}</li>)}</ul></div>}
        {candidate&&<section aria-label="공식자료 갱신 차이"><p role="status">형식·현재 자료 해시·과거 검토이력 보존 검사 통과. 원문 내용의 사실 여부나 관리자 승인을 대신하지 않습니다.</p><ul>{candidate.records.filter(record=>record.revisions.length!==(sourceCatalog.records.find(r=>r.key===record.key)?.revisions.length||0)).map(record=><li key={record.key}>{record.key} · 검토 #{record.revisions.length} · {sourceReviewState(record.revisions[record.revisions.length-1]).label}</li>)}</ul><button className="si-btn" type="button" onClick={()=>download(candidate)}>검증한 갱신 후보 내보내기</button><p className="si-caption">권한 있는 저장소에서 npm run sources:manage -- preview &lt;후보파일&gt;로 대조한 후 apply로 로컬 파일에 반영하고 PR을 검토하세요.</p></section>}
    </details>;
}
