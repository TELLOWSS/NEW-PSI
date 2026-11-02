/**
 * F10-58: a non-durable, advisory checklist for HUMAN handoff and acknowledgement.
 * No network, no contact verification, no DB write, no completed safety action.
 * A copied/exported handoff draft is never treated as a delivered notice.
 */
export function buildLocalHandoffFollowthrough({prepared=false,deliveryReported=false,receiptReported=false}={}){
 const drafted=prepared===true;
 const delivered=drafted&&deliveryReported===true;
 // An operator may attest to an actual response only after attesting to delivery.
 const received=delivered&&receiptReported===true;
 const stages=[
  {key:'draft',label:'기기 인계 초안 확인',status:drafted?'prepared':'not-prepared',
   description:drafted?'기기 기록과 인계 초안 대조됨 · 실제 전달은 별도':'기기 기록 조회 후 인계 초안을 준비하세요'},
  {key:'delivery',label:'별도 전달 여부 확인',status:delivered?'operator-reported':'unconfirmed',
   description:delivered?'사용자가 외부 전달 사실을 직접 확인했다고 표시':'복사·파일 저장은 전송 증거가 아닙니다'},
  {key:'receipt',label:'담당자 수신 회신 확인',status:received?'operator-reported':'unconfirmed',
   description:received?'사용자가 담당자의 실제 회신을 확인했다고 표시':'담당자에게 수신 여부를 직접 확인하세요'},
  {key:'recheck',label:'현장 재점검 기록',status:'requires-local-record',
   description:'각 점검·조치 항목의 재점검 이력에 직접 기록해야 합니다. 이 체크리스트로 완료되지 않습니다'},
 ];
 return {
  stages,
  next:!drafted?'인계 초안 준비':!delivered?'별도 전달 사실 확인':!received?'담당자 수신 회신 확인':'점검 항목별 재점검·조치 이력 기록',
  // Deliberately no overall completed, delivery verification, or safety approval.
  selfReportedDelivery:delivered,
  selfReportedReceipt:received,
  externallyVerified:false,
  actionVerified:false,
  persisted:false,
 };
}
/** Copyable, privacy-minimal request, not a claim of sending or response. */
export function formatLocalReceiptRequest(){
 return [
  '[PSI F10] 조치 인계 수신 확인 요청',
  '인계 자료의 실제 수신 여부를 확인해 회신해 주세요. 자료를 받지 못했다면 미수신으로 알려 주세요.',
  '회신 시: 수신 여부 / 담당 가능 여부 / 임시 안전조치 유지 확인 필요사항 / 다음 확인 예정일',
  '이 요청 문구는 발송·수신·현장 확인·조치 완료를 증명하지 않습니다.',
 ].join('\n');
}
