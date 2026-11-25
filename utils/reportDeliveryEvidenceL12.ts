/** L12: read-only evidence boundaries for document generation and delivery.
 * It never submits/sends, auto-approves, or reads private documents.
 */
export type ReportGenerationStatus = 'idle' | 'running' | 'success' | 'error';
export type ShareHandoffResult = 'handed-off' | 'cancelled' | 'unsupported' | 'files-unsupported' | 'failed';
export interface DocumentStage {
    key: 'create' | 'device' | 'handoff' | 'receipt' | 'verify' | 'approval';
    title: string;
    state: 'not-started' | 'running' | 'requested' | 'reviewed' | 'attention' | 'unconfirmed';
    label: string;
    evidence: string;
}
export interface DocumentDeliveryEvidence {
    stages: DocumentStage[];
    nextCheck: string;
    safetyClearance: false;
    distributionConfirmed: false;
}
interface ReportInputs {
    generationStatus: ReportGenerationStatus;
    generationProgress: number;
    isGenerating: boolean;
    isPackagingEvidence: boolean;
    verificationChecked: boolean;
    verificationPassed: boolean;
}
export function buildReportDeliveryEvidence(input: ReportInputs): DocumentDeliveryEvidence {
    const busy = input.isGenerating || input.isPackagingEvidence || input.generationStatus === 'running';
    const failed = !busy && input.generationStatus === 'error';
    const generated = !busy && input.generationStatus === 'success';
    const verification = input.verificationChecked
        ? (input.verificationPassed ? '선택한 증빙 묶음 무결성 일치' : '선택한 증빙 묶음 재확인 필요')
        : '검증 이력 없음';
    return {
        stages: [
            { key: 'create', title: '1. 파일 생성·요청',
                state: busy ? 'running' : failed ? 'attention' : generated ? 'requested' : 'not-started',
                label: busy ? `보고서 처리 중 · ${Math.max(0,Math.min(100,Math.round(input.generationProgress)||0))}%` : failed ? '생성 실패·중단 기록' : generated ? '생성 처리 후 저장 요청 실행' : '생성 시작 전',
                evidence: 'PDF/ZIP 생성 프로그램의 화면 기록입니다. 일부 대상 실패와 기기 저장 결과는 별도로 확인합니다.',
            },
            { key: 'device', title: '2. 기기 파일 확인', state: 'unconfirmed', label: '실제 다운로드·보관 미확인',
                evidence: '브라우저 다운로드 목록에서 파일명·용량·열림 여부를 확인하세요. 저장 요청은 파일의 기기 보존을 보증하지 않습니다.',
            },
            { key: 'handoff', title: '3. 외부 전달', state: 'unconfirmed', label: '전송·수신 대상 미확인',
                evidence: '관리자가 카카오톡·메일 등 외부 앱에서 수신 대상과 실제 발송 결과를 별도로 확인해야 합니다. 이 보고서 화면은 자동 발송하지 않습니다.',
            },
            { key: 'receipt', title: '4. 상대방 수신', state: 'unconfirmed', label: '열람·접수 근거 없음',
                evidence: '상대방의 수신·열람·확인 회신을 이 화면에서 확인할 수 없습니다. 파일 생성·공유창 실행을 수신으로 대체하지 않습니다.',
            },
            { key: 'verify', title: '5. 증빙 무결성 검사', state: !input.verificationChecked ? 'not-started' : input.verificationPassed ? 'reviewed' : 'attention',
                label: verification,
                evidence: '별도로 업로드해 검증한 기준 파일·JSON 묶음의 일치 여부입니다. 지금 생성한 PDF의 원본 동일성·외부 수신·현장 안전을 자동 승인하지 않습니다.',
            },
            { key: 'approval', title: '6. 관리자 발행·검수', state: 'unconfirmed', label: '발행 승인·서명 확인 별도',
                evidence: '책임자, 승인 일시, 대상·문서번호와 현장 적용 근거가 확인되기 전까지 공식 발행·안전조치 완료로 간주하지 않습니다.',
            },
        ],
        nextCheck: failed ? '생성 오류를 확인한 후 재시도하세요. 실패한 파일은 전달 근거가 아닙니다.'
            : busy ? '보고서 생성 작업 종료 후 브라우저 다운로드 목록을 확인하세요.'
            : generated ? '다운로드 목록에서 실제 파일을 열어 확인한 후, 전달 대상을 검토하세요.'
            : '보고서 대상과 출력 조건을 확인한 뒤 파일 생성을 시작하세요.',
        safetyClearance: false,
        distributionConfirmed: false,
    };
}
export function buildShareHandoffEvidence(result: ShareHandoffResult | null, copied = false) {
    const handedOff = result === 'handed-off';
    const blocked = result !== null && !handedOff;
    return {
        appLabel: handedOff ? '공유앱 인계 요청 완료 · 실제 전송 미확인'
            : blocked ? '공유창 인계 실패 또는 취소 · 전송 근거 없음'
                : copied ? '문구 복사 기록만 있음 · 수신앱 인계 아님'
                    : '공유 전 · 외부 전송 기록 없음',
        recipientLabel: '상대방 수신·열람 확인 안 됨',
        operatorAction: handedOff
            ? '선택한 공유앱의 대화방에서 상대방·파일 첨부·전송 여부를 확인하세요.'
            : blocked ? '문구 복사 또는 사진 개별 저장 후 수신앱에서 직접 확인하세요.'
                : '개인정보·사진·대상자를 먼저 확인한 후 공유하세요.',
        transferConfirmed: false,
        receiptConfirmed: false,
    };
}
