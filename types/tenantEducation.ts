export interface TenantWorkerAccount { email:string; active:boolean; revision:number; updatedAt:string; }
export interface TenantEducationRelease {
 id:string; draftId:string; draftRevision:number; title:string; siteName:string; workerIds:string[];
 expiresAt:string; revoked:boolean; revision:number; createdAt:string;
}
export interface WorkerEducation { title:string; siteName:string; sourceTextKo:string; workerName:string; expiresAt:string; draftRevision:number; }
