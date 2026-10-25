export type FreeTierScenario={photosPerMonth:number;averagePhotoKB:number;downloadsPerPhoto:number;analysisAttemptsPerPhoto:number;teamDeploymentsPerDay:number};
export type FreeTierEstimate={newStorageMiB:number;uncachedDownloadGiBUpper:number;analysisAttempts:number;deploymentsOfDailyCap:number;hobbyDeploymentSharePct:number;storageOfSupabaseFreePct:number;downloadOfUncachedFreePct:number;notes:string[]};
export const FREE_TIER_REFERENCE={vercelHobbyTeamDeploymentsPerDay:100,vercelHobbyInvocationsPerMonth:1_000_000,supabaseFreeStorageMiB:1024,supabaseFreeUncachedEgressGiB:5,sourceDate:'2026-10-25'} as const;
export const DEFAULT_FREE_TIER_SCENARIO:FreeTierScenario={
    photosPerMonth:300,averagePhotoKB:500,downloadsPerPhoto:2,analysisAttemptsPerPhoto:1,teamDeploymentsPerDay:4,
};
const safeNumber=(value:unknown,max:number):number=>{
    const parsed=typeof value==='number'?value:Number(value);
    return Number.isFinite(parsed)?Math.max(0,Math.min(max,parsed)):0;
};
/**
 * Manual scenario, not provider telemetry or a guarantee of quota availability.
 * Egress is deliberately the all-uncached upper estimate; other product traffic excluded.
 */
export const estimateFreeTierCapacity=(raw:Partial<FreeTierScenario>):FreeTierEstimate=>{
    const photos=Math.floor(safeNumber(raw.photosPerMonth,100000));
    const kb=safeNumber(raw.averagePhotoKB,3000);
    const reads=Math.floor(safeNumber(raw.downloadsPerPhoto,100));
    const ai=Math.floor(safeNumber(raw.analysisAttemptsPerPhoto,20));
    const deploys=Math.floor(safeNumber(raw.teamDeploymentsPerDay,500));
    const newStorageMiB=photos*kb/1024;
    const uncachedDownloadGiBUpper=photos*kb*reads/(1024*1024);
    const analysisAttempts=photos*ai;
    const hobbyDeploymentSharePct=100*deploys/FREE_TIER_REFERENCE.vercelHobbyTeamDeploymentsPerDay;
    const storageOfSupabaseFreePct=100*newStorageMiB/FREE_TIER_REFERENCE.supabaseFreeStorageMiB;
    const downloadOfUncachedFreePct=100*uncachedDownloadGiBUpper/FREE_TIER_REFERENCE.supabaseFreeUncachedEgressGiB;
    const notes:string[]=[];
    if(deploys>=100)notes.push('팀 전체 새 배포 추정이 Hobby 하루 100회 제한에 도달하거나 초과합니다. 기존 배포를 유지하고 작업 변경을 묶어 주세요.');
    else if(deploys>=70)notes.push('예상 배포가 Hobby 일일 한도의 70%를 넘습니다. 같은 팀 다른 제품의 배포까지 합산해 확인하세요.');
    if(storageOfSupabaseFreePct>=70)notes.push('새 사진만으로 Supabase Free Storage 1GB 참고 한도의 70% 이상입니다. 기존 저장 데이터는 따로 확인해야 합니다.');
    if(downloadOfUncachedFreePct>=70)notes.push('사진 재조회만으로 Supabase Free 비캐시 전송 5GB 참고 한도의 70% 이상입니다. 캐시·다른 API 전송량은 별도입니다.');
    notes.push('사진 용량·조회 횟수·호출 횟수·배포 횟수는 수동 가정이며 실제 운영 사용량이나 남은 할당량을 조회하지 않습니다.');
    notes.push('Vercel 함수 CPU·메모리·실행시간·동시성·빌드비용, Supabase DB 크기·기존 사진·백업, 외부 AI 유료요금은 이 계산에 포함되지 않습니다.');
    return {newStorageMiB,uncachedDownloadGiBUpper,analysisAttempts,deploymentsOfDailyCap:deploys,hobbyDeploymentSharePct,storageOfSupabaseFreePct,downloadOfUncachedFreePct,notes};
};
