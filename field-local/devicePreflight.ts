/**
 * P3 / L39 — User-invoked, local-only device capability preflight.
 * These checks DO NOT approve real-device UAT or prove browser storage durability.
 * Never collect UA, device IDs, coordinates, photos, record content, account or tokens.
 */
export type FieldDeviceFacts={
  online:boolean;
  secureContext:boolean;
  standalone:boolean;
  indexedDbApi:boolean;
  cameraApi:boolean;
  workerActive:boolean|null;
  offlineAssetsVerified:boolean|null;
  persistenceGranted:boolean|null;
};
export type FieldDeviceReport={
  schema:'psi-field-device-preflight-v1';
  generatedAt:string;
  scope:'/field-local/';
  outcome:'DIAGNOSTIC_ONLY';
  realDeviceUatApproved:false;
  noAutomaticUpload:true;
  checks:Array<{id:string;label:string;value:string;limit:string}>;
};
const yesNo=(value:boolean|null,yes:string,no:string):string=>
  value===null?'확인 불가':value?yes:no;

export function buildFieldDeviceReport(f:FieldDeviceFacts,at:string):FieldDeviceReport{
  return {
    schema:'psi-field-device-preflight-v1',
    generatedAt:at,
    scope:'/field-local/',
    outcome:'DIAGNOSTIC_ONLY',
    realDeviceUatApproved:false,
    noAutomaticUpload:true,
    checks:[
      {id:'connection-signal',label:'브라우저 연결 신호',value:f.online?'온라인':'오프라인',
       limit:'서버 접속·응답·실제 통신속도 확인이 아닙니다.'},
      {id:'secure-context',label:'보안 컨텍스트',value:yesNo(f.secureContext,'감지됨','감지되지 않음'),
       limit:'계정 인증·개인정보 보호·서버 보안 승인 증거가 아닙니다.'},
      {id:'standalone',label:'설치형 화면 실행',value:yesNo(f.standalone,'설치형 화면 감지','일반 브라우저 화면'),
       limit:'홈화면 설치 성공·오프라인 저장 성공을 증명하지 않습니다.'},
      {id:'worker',label:'오프라인 서비스워커',value:yesNo(f.workerActive,'활성 확인','활성 미확인'),
       limit:'캐시 완전성·기록 영구보존과 별개입니다.'},
      {id:'offline-assets',label:'오프라인 셸 파일',value:yesNo(f.offlineAssetsVerified,'파일 검사 성공','파일 검사 실패'),
       limit:'실제 비행기 모드 재실행·사진 복원은 직접 검수해야 합니다.'},
      {id:'indexeddb-api',label:'기기 기록 저장 API',value:yesNo(f.indexedDbApi,'API 감지','API 미감지'),
       limit:'사진 저장·재실행 복원·해시 무결성·백업 완료를 증명하지 않습니다.'},
      {id:'persistent-storage',label:'브라우저 지속 보관',value:yesNo(f.persistenceGranted,'브라우저 허용','브라우저 미허용'),
       limit:'사용자 데이터 삭제·기기 분실·용량 부족으로 인한 유실을 막지 못합니다.'},
      {id:'camera-api',label:'카메라 API',value:yesNo(f.cameraApi,'API 감지','API 미감지'),
       limit:'카메라 권한 승인·사진 촬영·실제 해상도 검사는 수행하지 않습니다.'}
    ]
  };
}

export async function runFieldDevicePreflight(
  verifyOffline:(worker:ServiceWorker)=>Promise<boolean>
):Promise<FieldDeviceReport>{
  let active:boolean|null=null,cache:boolean|null=null,persisted:boolean|null=null;
  try{
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.getRegistration('/field-local/');
      active=!!reg?.active;
      if(reg?.active){
        try{cache=await verifyOffline(reg.active);}catch{/* Not a completed cache verification. */}
      }
    }
  }catch{/* Capability query unavailable. */}
  try{
    if(navigator.storage?.persisted)persisted=await navigator.storage.persisted();
  }catch{/* Unknown is safer than success. */}
  return buildFieldDeviceReport({
    online:navigator.onLine,
    secureContext:window.isSecureContext,
    standalone:!!window.matchMedia?.('(display-mode: standalone)').matches,
    indexedDbApi:typeof indexedDB!=='undefined',
    cameraApi:typeof navigator.mediaDevices?.getUserMedia==='function',
    workerActive:active,offlineAssetsVerified:cache,persistenceGranted:persisted
  },new Date().toISOString());
}

export function formatFieldDeviceReport(report:FieldDeviceReport):string{
 return [
  'PSI 기기 점검 · 지원상태 사전 진단 (실기기 인수 승인 아님)',
  '진단시각: '+report.generatedAt,
  '범위: '+report.scope,
  ...report.checks.map(item=>item.label+': '+item.value+' / '+item.limit),
  '직접 확인 필요: Android Chrome·삼성 인터넷 설치, 오프라인 재실행, 실제 사진·메모 복원, A4/확대/TalkBack, 배터리·저장공간.',
  '자동 서버 전송 없음 · 본문에 기기 식별정보/사진/작업자 기록 미포함 · RELEASE=BLOCKED'
 ].join('\n');
}
