/**
 * F08-44: read-only recovery triage for the three reserved IndexedDB drafts.
 * Checks what can be verified without claiming authenticity, completion,
 * automatic repair, or that a stale React form matches durable storage.
 */
import {validLocalInputDraft,LOCAL_INPUT_DRAFT_KEY} from './localInputDraft.mjs';
import {SINGLE_PHOTO_DRAFT_KEY} from './localSinglePhotoDraft.mjs';
import {packUnfinishedBackup} from './localUnfinishedBackup.mjs';

export const LOCAL_RECOVERY_KEYS=[
 LOCAL_INPUT_DRAFT_KEY,
 SINGLE_PHOTO_DRAFT_KEY,
 'psi-photo-set-draft-v1',
];

const labels=['점검 내용·현장정보','단건 사진','연속 촬영 사진'];
const statuses={
 empty:'저장된 임시기록 없음',
 limited:'기록을 읽었지만 원본 변경 여부는 검증 불가',
 verified:'저장 파일과 비교값 일치',
 invalid:'저장 기록에 오류 또는 비교값 불일치',
};
const row=(label,state,detail)=>({label,state,message:statuses[state],detail});

export async function diagnoseLocalUnfinishedSlots(slots={}){
 const input=slots[LOCAL_RECOVERY_KEYS[0]],single=slots[LOCAL_RECOVERY_KEYS[1]],
  sequence=slots[LOCAL_RECOVERY_KEYS[2]];
 const results=[];
 if(input===undefined||input===null)results.push(row(labels[0],'empty',''));
 else if(!validLocalInputDraft(input))results.push(row(labels[0],'invalid','입력 항목 형식이 손상됐습니다. 기기 자료를 자동 삭제하지 마세요.'));
 else results.push(row(labels[0],'limited','현재 입력 형식을 확인했습니다. 과거 작성 내용과 동일하다는 증명은 아닙니다.'));
 if(single===undefined||single===null)results.push(row(labels[1],'empty',''));
 else{
  try{
   await packUnfinishedBackup({single});
   results.push(row(labels[1],'verified','기기에 보관된 사진 바이트와 저장된 SHA-256을 비교했습니다. 촬영 당시 원본성 증명은 아닙니다.'));
  }catch{
   results.push(row(labels[1],'invalid','사진 또는 편집 전 원본의 파일·비교값이 맞지 않습니다. 원본 백업을 보관하세요.'));
  }
 }
 if(sequence===undefined||sequence===null)results.push(row(labels[2],'empty',''));
 else{
  try{
   await packUnfinishedBackup({sequence});
   const withBaseline=Array.isArray(sequence.sources)&&sequence.sources.length===sequence.photos.length;
   results.push(row(labels[2],withBaseline?'verified':'limited',withBaseline
    ?'각 촬영 파일과 기록된 출처 비교값을 확인했습니다. 촬영 당시 원본성 증명은 아닙니다.'
    :'사진 파일은 읽었으나 기존 출처 비교값이 없어 촬영 당시 파일과 동일한지 확인할 수 없습니다.'));
  }catch{
   results.push(row(labels[2],'invalid','연속 촬영 사진 또는 편집 이력에 문제가 있습니다. 자동 삭제하지 마세요.'));
  }
 }
 const stored=results.filter(x=>x.state!=='empty').length;
 const invalid=results.some(x=>x.state==='invalid');
 const both=results[1].state!=='empty'&&results[2].state!=='empty';
 const state=invalid?'attention':both?'mixed':stored?'recoverable':'empty';
 const guidance=invalid
  ?'손상 의심 기록이 있어 안전한 통합 백업으로 확인되지 않습니다. 원본 백업 파일과 현재 화면의 사진을 별도 보관하고 기록을 자동 삭제하지 마세요.'
  :both
   ?'단건 사진과 연속 촬영 사진이 함께 있습니다. 어느 사진을 사용할지 임의로 선택하지 마세요. 각 원본을 보관하고 필요 시 명시적으로 정리하세요.'
   :stored
    ?'기기에 임시자료가 남아 있습니다. 먼저 별도 백업한 뒤 화면에서 계속 작성하세요. 임시자료는 완료된 점검이 아닙니다.'
    :'기기에 저장된 임시기록 3종이 보이지 않습니다. 현재 화면의 미저장 입력과 원본 백업 파일을 먼저 확인하세요.';
 return {state,results,stored,canExportStored:stored>0&&!invalid,guidance};
}

/**
 * UI-level preflight only. The actual restore must still recheck all three
 * IndexedDB slots in one readwrite transaction to defeat cross-tab races.
 */
export function unfinishedRestoreActionGate({verifiedBackup=false,loading=false,hasActiveWork=false,busy=false}={}){
 if(!verifiedBackup)return {allowed:false,reason:'먼저 복구할 백업 파일을 선택해 검사하세요.',state:'no-file'};
 if(loading||busy)return {allowed:false,reason:'기기의 임시기록 확인 또는 다른 저장 작업이 끝난 뒤 다시 확인하세요.',state:'busy'};
 if(hasActiveWork)return {allowed:false,reason:'현재 화면에 미완료 사진·입력이 있습니다. 먼저 화면 내용을 백업하고, 빈 점검 화면에서 파일을 복원하세요. 기존 자료는 자동 삭제하지 않습니다.',state:'active-work'};
 return {allowed:true,reason:'검사한 백업을 복원할 수 있습니다. 실행 직전에 기기 임시기록 3종이 비었는지도 다시 확인하며, 이미 저장된 자료가 있으면 중단합니다.',state:'ready'};
}

/**
 * F08-46 continuation never imports, overwrites, or deletes any record.
 * It merely permits focusing an already loaded form, after a fresh diagnostic
 * and independent byte-level readback verification at the call site.
 */
export function storedUnfinishedResumeGate(report,{draftsReady=true,hasUnstagedPhoto=false}={}){
 if(!draftsReady)return {allowed:false,state:'loading',
  message:'저장된 임시기록 확인이 끝난 다음 이어쓰기를 선택하세요.'};
 if(!report)return {allowed:false,state:'unchecked',
  message:'기기 임시기록 상태를 먼저 확인하세요.'};
 if(report.state==='attention')return {allowed:false,state:'damaged',
  message:'손상 의심 임시기록이 있습니다. 현재 화면과 원본 파일을 먼저 보관하고 자동으로 불러오지 마세요.'};
 if(report.state==='mixed')return {allowed:false,state:'mixed',
  message:'단건 사진과 연속 촬영 사진이 함께 남아 있습니다. 원본을 별도 보관하고 어떤 사진을 사용할지 직접 확인하세요.'};
 if(report.state==='empty')return {allowed:false,state:'empty',
  message:'기기에 남은 임시기록이 없습니다. 현재 화면의 내용과 백업 파일을 확인하세요.'};
 if(hasUnstagedPhoto)return {allowed:false,state:'unsaved-photo',
  message:'현재 화면에 아직 기기 임시저장으로 확인되지 않은 사진이 있습니다. 먼저 화면 내용 전체를 백업하세요.'};
 return {allowed:true,state:'ready',
  message:'저장된 임시기록이 확인됐습니다. 현재 입력 화면으로만 이동하며 기록을 수정·복원·삭제하지 않습니다.'};
}
