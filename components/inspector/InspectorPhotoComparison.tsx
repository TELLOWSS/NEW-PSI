import React from 'react';
export default function InspectorPhotoComparison({before,after,beforeLabel='조치 전',afterLabel='개선 후',beforeError=false,afterError=false}:{before?:string;after?:string;beforeLabel?:string;afterLabel?:string;beforeError?:boolean;afterError?:boolean}){
    return <div className="si-photo-comparison" aria-label="조치 전후 사진 비교">
        {[{url:before,label:beforeLabel,alt:'조치 전 사진',error:beforeError},{url:after,label:afterLabel,alt:'개선 후 사진',error:afterError}].map(p=><figure key={p.alt}><figcaption>{p.label}</figcaption>{p.url?<img src={p.url} alt={p.alt}/>:<p>{p.error?'사진을 불러오지 못했습니다. 삭제·권한 상태를 확인해 주세요.':'사진 선택 또는 불러오기 대기'}</p>}</figure>)}
    </div>;
}
