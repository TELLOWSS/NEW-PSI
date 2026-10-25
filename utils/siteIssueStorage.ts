export type SiteIssueReadResult<T>={items:T[];safe:boolean;warning:string};
export function readSiteIssueList<T>(read:()=>string|null):SiteIssueReadResult<T>{
 try{
  const raw=read();if(raw===null)return {items:[],safe:true,warning:''};
  const parsed:unknown=JSON.parse(raw);
  if(!Array.isArray(parsed)||parsed.some(x=>!x||typeof x!=='object'||Array.isArray(x)||typeof (x as {id?:unknown}).id!=='string'))
   return {items:[],safe:false,warning:'기존 지적사항 데이터가 손상됐을 수 있습니다. 원본을 덮어쓰지 않습니다.'};
  return {items:parsed as T[],safe:true,warning:''};
 }catch{return {items:[],safe:false,warning:'기존 지적사항을 읽지 못했습니다. 원본 보존을 위해 저장을 차단했습니다.'};}
}
export function persistSiteIssueList<T>(items:readonly T[],write:(text:string)=>void):{ok:boolean;warning:string}{
 try{write(JSON.stringify(items));return {ok:true,warning:''};}
 catch{return {ok:false,warning:'브라우저 저장공간 부족 또는 접근 제한으로 저장에 실패했습니다.'};}
}
