import type { ShareResult } from './sharing';

export type FieldPhotoStageTone = 'pending' | 'ready' | 'review';
export interface FieldPhotoLifecycleStage {
    key: 'local' | 'handoff' | 'receipt' | 'review';
    title: string;
    status: string;
    detail: string;
    tone: FieldPhotoStageTone;
}
export interface FieldPhotoLifecycleInput {
    photoCount: number;
    localStoreAvailable: boolean;
    photoPending: boolean;
    photoSaving: boolean;
    invalidStoredPhoto: boolean;
    sharing: boolean;
    shareResult: ShareResult | null;
}

/**
 * Camera-only evidence semantics. The camera page has no server photo-upload
 * path; OS share completion never proves network delivery or recipient receipt.
 * Photos are not transferred to /field-local/ automatically.
 */
export const getFieldPhotoLifecycleStages = ({
    photoCount,
    localStoreAvailable,
    photoPending,
    photoSaving,
    invalidStoredPhoto,
    sharing,
    shareResult,
}: FieldPhotoLifecycleInput): FieldPhotoLifecycleStage[] => {
    let local: FieldPhotoLifecycleStage = {
        key: 'local',
        title: '1. 브라우저 보관',
        status: photoCount > 0 ? `사진 ${photoCount}장 이 브라우저 보관` : '보관 사진 없음',
        detail: 'IndexedDB 보관입니다. 휴대전화 사진첩 저장이나 영구 백업을 뜻하지 않습니다.',
        tone: photoCount > 0 ? 'ready' : 'pending',
    };
    if (!localStoreAvailable) {
        local = photoSaving
            ? { ...local, status: '사진함 확인 중', tone: 'pending',
                detail: '브라우저 저장소를 읽고 있습니다. 확인 전에는 보관 결과를 표시하지 않습니다.' }
            : { ...local, status: '사진함 읽기 확인 필요', tone: 'review',
                detail: '사진함을 조회하지 못했으며, 기존 파일의 유무도 확정할 수 없습니다.' };
    } else if (photoPending) {
        local = {
            ...local, status: photoSaving ? '새 사진 보관 중' : '새 사진 보관 재시도 필요',
            tone: 'review',
            detail: '새 사진은 아직 보관 완료로 확인되지 않았습니다. 기존 보관 사진과 구분하세요.',
        };
    } else if (invalidStoredPhoto) {
        local = {
            ...local, status: '선택 사진 보관 정보 불일치', tone: 'review',
            detail: '현재 미리보기와 기기에 저장된 파일이 달라 재확인이 필요하며, 일반 공유가 제한됩니다.',
        };
    }

    let share: FieldPhotoLifecycleStage = {
        key: 'handoff',
        title: '2. 외부 공유앱',
        status: '공유 시도 전',
        detail: '필요하면 직접 사진 공유를 실행하세요. 이 화면은 자동으로 사진을 전송하지 않습니다.',
        tone: 'pending',
    };
    if (sharing) {
        share = {
            ...share, status: '공유 전 파일 확인 중', tone: 'pending',
            detail: '보관 파일을 다시 검증하거나 공유창을 열고 있습니다. 수신 완료를 뜻하지 않습니다.',
        };
    } else if (shareResult === 'handed-off') {
        share = {
            ...share, status: '공유앱 인계 · 수신 미확인', tone: 'ready',
            detail: '기기의 공유 기능이 반환되었습니다. 상대방 실제 전송·수신 여부는 공유한 앱에서 별도 확인하세요.',
        };
    } else if (shareResult) {
        share = {
            ...share, status: '공유 미완료 · 다시 확인', tone: 'review',
            detail: '공유가 취소되거나 지원되지 않았습니다. 이 화면에서 실제 전송 완료를 주장하지 않습니다.',
        };
    }

    return [
        local,
        share,
        {
            key: 'receipt', title: '3. 서버 수신', status: '수신 기록 없음',
            detail: '이 카메라에서는 PSI 서버에 사진을 업로드하지 않습니다. 공유앱의 수신 확인과도 별개입니다.',
            tone: 'pending',
        },
        {
            key: 'review', title: '4. 현장 검수·조치', status: '별도 점검 필요',
            detail: '사진 보관이나 공유로 위험성평가·조치 완료·재점검 승인이 되지 않습니다. /field-local/ 점검과도 자동 연결되지 않습니다.',
            tone: 'pending',
        },
    ];
};
