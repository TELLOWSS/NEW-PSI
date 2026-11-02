/** F08 offline recovery messages. Advisory only; never automatically delete, retry,
 * overwrite, synchronize, or assert that a missing record was erased.
 * Use the DOMException.name boundary rather than untrusted error.message to
 * avoid leaking file paths, OS details, user data or browser internals.
 */
const LOCAL_RESTORE_FAILURES={
  ConstraintError:{
    kind:'duplicate',
    message:'동일한 점검 ID가 이미 저장돼 기존 기록을 변경하지 않았습니다. 기기 기록 다시 조회 후 필요한 경우 원본 백업과 비교하세요.',
    mayRetry:false,
  },
  QuotaExceededError:{
    kind:'capacity',
    message:'기기 저장공간이 부족하거나 브라우저 저장 한도에 도달해 이 기록의 복원이 실패했습니다. 기존 기록을 삭제하지 말고 백업 파일을 안전하게 보관한 뒤 저장공간 상태를 확인하세요.',
    mayRetry:true,
  },
  AbortError:{
    kind:'interrupted',
    message:'기기 저장 트랜잭션이 중단됐습니다. 기록 목록을 다시 조회하여 저장 여부를 확인한 뒤 원본 백업에서 다시 시도하세요.',
    mayRetry:true,
  },
  InvalidStateError:{
    kind:'unavailable',
    message:'브라우저 저장소가 사용 불가능한 상태입니다. 다른 탭이나 브라우저 설정을 확인하고 기록 목록을 다시 조회하세요. 원본 백업은 삭제하지 마세요.',
    mayRetry:true,
  },
  NotFoundError:{
    kind:'unavailable',
    message:'점검 저장소를 찾지 못했습니다. 브라우저 저장 설정과 현재 프로필을 확인하고 원본 백업을 유지하세요.',
    mayRetry:true,
  },
  SecurityError:{
    kind:'blocked',
    message:'브라우저 보안 설정으로 저장 요청이 제한됐습니다. 현재 주소·브라우저 권한과 저장 정책을 확인하세요. 원본 백업은 삭제하지 마세요.',
    mayRetry:true,
  },
};
const UNKNOWN={
  kind:'unknown',
  message:'복원 결과를 확정할 수 없습니다. 기기 기록 다시 조회로 같은 ID가 저장됐는지 확인하고, 원본 백업을 보관하세요. 자동 재시도·기존 기록 덮어쓰기는 하지 않습니다.',
  mayRetry:false,
};
export function classifyLocalRestoreError(error){
  // Avoid depending on cross-realm instanceof DOMException.
  const name=error&&typeof error==='object'&&typeof error.name==='string'?error.name:'';
  return LOCAL_RESTORE_FAILURES[name]||UNKNOWN;
}
/** Called only AFTER a committed IndexedDB write, and only if readback succeeds.
 * Never equate a matching ID alone with byte-level integrity or legal authenticity.
 */
export function verifyLocalRestoreReadback(expected,stored){
  return Boolean(expected&&stored&&typeof expected.id==='string'&&expected.id===stored.id&&
    expected.sha256===stored.sha256&&expected.photo?.size===stored.photo?.size&&
    expected.photo?.type===stored.photo?.type&&
    expected.photo?.name===stored.photo?.name);
}
