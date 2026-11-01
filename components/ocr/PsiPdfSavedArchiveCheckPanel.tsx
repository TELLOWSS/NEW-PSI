import React,{useState} from 'react';
import {
    verifyPsiSavedReviewZipLocally,
    type PsiSavedPdfArchiveVerification,
} from '../../utils/psiPdfLocalArchiveVerifier';

type Props={expectedOriginalSha256?:string};

/** No network calls, uploads, approval decisions or saved worker identifiers. */
export const PsiPdfSavedArchiveCheckPanel:React.FC<Props>=({expectedOriginalSha256})=>{
    const [busy,setBusy]=useState(false);
    const [result,setResult]=useState<PsiSavedPdfArchiveVerification|null>(null);
    const [error,setError]=useState('');
    const inspect=async(file:File|null)=>{
        setResult(null);setError('');
        if(!file)return;
        setBusy(true);
        try{
            setResult(await verifyPsiSavedReviewZipLocally(file,expectedOriginalSha256));
        }catch(e){
            setError(e instanceof Error?e.message:'내부 검토 ZIP을 확인하지 못했습니다.');
        }finally{setBusy(false);}
    };
    return <section data-psi-saved-pdf-archive-check="true"
        className="mt-4 rounded-xl border border-indigo-200 bg-slate-50 p-3 sm:p-4">
        <h5 className="text-sm font-black text-slate-900">24차 · 저장된 PDF 검토 ZIP 다시 확인</h5>
        <p className="mt-2 text-xs leading-5 text-slate-700">
            다운로드 폴더에 저장된 ZIP을 다시 선택하면 기기 안에서 PDF·검토 기록·
            SHA-256 목록이 서로 일치하는지 확인합니다. PDF 속 복사 가능한 문자·주석·
            첨부파일·양식 필드도 다시 검사합니다. 파일은 서버에 전송하지 않습니다.
        </p>
        <label className="mt-3 block text-xs font-bold text-slate-800">
            저장된 PSI 검토 ZIP 선택 (최대 60MB)
            <input type="file" accept=".zip,application/zip,application/x-zip-compressed"
                disabled={busy}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3 text-xs"
                onChange={e=>{
                    const file=e.currentTarget.files?.[0]||null;
                    e.currentTarget.value='';
                    void inspect(file);
                }}/>
        </label>
        <p className="mt-2 text-xs text-slate-600">
            {expectedOriginalSha256
                ?'현재 불러온 원본 PDF의 해시와 ZIP의 원본 해시도 함께 비교합니다.'
                :'원본 PDF를 불러오지 않은 상태입니다. ZIP 내부 파일의 일치 여부만 확인하며 원본과의 연결은 확인하지 않습니다.'}
        </p>
        {busy&&<p role="status" className="mt-2 text-xs font-bold text-indigo-800">
            ZIP 압축·문서 구조·해시 확인 중...
        </p>}
        {error&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-3 text-xs font-bold text-rose-900">
            확인 실패: {error}
        </p>}
        {result&&<div role="status" className="mt-3 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-800">
            <p className="font-black">ZIP 내부 파일 무결성 확인 통과 · {result.pageCount}페이지</p>
            <p className="mt-1">원본 연계 확인: {result.boundToOpenSource?'현재 원본 해시와 일치':'미확인 (원본을 별도로 불러오세요)'}</p>
            <p className="mt-1 break-all font-mono text-[11px]">가림 PDF SHA-256: {result.rasterPdfSha256}</p>
            <p className="mt-2 font-bold text-amber-900">
                이는 저장된 파일 구조와 해시의 일치 여부만 확인한 결과입니다.
                가림 누락 여부에 대한 사람의 육안 검토, 제3자 승인 또는 외부 제출 허가가 아닙니다.
            </p>
        </div>}
    </section>;
};
