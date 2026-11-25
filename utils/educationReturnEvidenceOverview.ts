import type { EducationReturnSummary } from './educationReturnSummary';
import type { PracticeVerificationSummary } from './practiceVerification';

/** L10: evidence boundaries between approved sources, authoring, language,
 * delivery, comprehension and observable field behavior. Source counts are
 * aggregated across currently loaded records, not independent release proofs.
 */
export interface EducationReturnEvidenceStep {
    key: 'source' | 'authoring' | 'language' | 'delivery' | 'understanding' | 'field';
    title: string;
    status: string;
    detail: string;
    tone: 'review' | 'recorded' | 'unknown';
    destination: 'ocr-analysis' | 'a4-education-material' | null;
    actionLabel: string | null;
}

export interface EducationReturnEvidenceOverview {
    sourceScope: string;
    steps: EducationReturnEvidenceStep[];
    risksNote: string;
    guarantee: 'not-approved';
}

export const buildEducationReturnEvidenceOverview = (
    summary: EducationReturnSummary,
    practice: PracticeVerificationSummary,
): EducationReturnEvidenceOverview => {
    const total = Math.max(0, summary.totalRecords);
    const reviewed = Math.max(0, Math.min(total, summary.completedRecords));
    const pending = Math.max(0, summary.reviewRequiredRecords);
    const delivered = Math.max(0, practice.educationDelivered);
    const understood = Math.max(0, practice.understandingConfirmed);
    const requiresHelp = Math.max(0, practice.understandingNeedsHelp);
    const needsRecheck = Math.max(0, practice.needsFieldRecheck);
    const overdue = Math.max(0, practice.overdueFieldRecheck);
    const conflicts = Math.max(0, practice.conflictingRecords);
    return {
        sourceScope: `앱에 불러온 위험성평가 기록 ${total}건 · 관리자 승인 기록 ${reviewed}건 · 확인 필요 ${pending}건`,
        steps: [
            {
                key: 'source', title: '1. 원본·관리자 대조',
                status: !total ? '기록 없음' : pending ? `관리자 확인 필요 ${pending}건` : `승인 상태 기록 ${reviewed}건`,
                detail: 'OCR 원본 사진·Q1~Q5 해석과 관리자 수정·승인을 원문 기록에서 대조합니다. 승인 건수는 이 앱에 불러온 기록의 상태만 뜻합니다.',
                tone: !total ? 'unknown' : pending ? 'review' : 'recorded',
                destination: 'ocr-analysis', actionLabel: '원본 확인',
            },
            {
                key: 'authoring', title: '2. 다음 교육자료 구성',
                status: !total ? '자료 작성 근거 부족' : '작성 경로 제공 · 발행 미확인',
                detail: '월간 반복 위험과 미완료 조치가 다음 교육 원문에 반영됐는지 확인하세요. 화면에서 제작 가능하다는 표시만으로 공식 발행을 증명하지 않습니다.',
                tone: !total ? 'unknown' : 'review',
                destination: 'a4-education-material', actionLabel: 'A4 자료 검수',
            },
            {
                key: 'language', title: '3. 다국어 의미·출력 검수',
                status: '언어별 출력·의미 검증 별도',
                detail: `근로자 기록에 표시된 언어 ${Math.max(0, summary.supportedLanguageCount)}종은 번역본 보유 수가 아닙니다. 11개 언어의 최신 원문 대조·작업중지 지시·글꼴·출력물 확인은 A4 제작 단계에서 별도로 검수합니다.`,
                tone: 'review',
                destination: 'a4-education-material', actionLabel: '언어별 확인',
            },
            {
                key: 'delivery', title: '4. 교육 전달 근거',
                status: delivered ? `전달 이력 ${delivered}회 · 수신 범위 별도` : '교육 전달 기록 없음',
                detail: '기록된 교육 전달 이벤트 수입니다. 실제 대상자 전원의 수신·출석·서명 또는 A4 출력물 배포 완료를 뜻하지 않습니다.',
                tone: delivered ? 'recorded' : 'unknown',
                destination: null, actionLabel: null,
            },
            {
                key: 'understanding', title: '5. 이해 확인·보충',
                status: understood || requiresHelp ? `이해 확인 ${understood}회 · 설명 보완 ${requiresHelp}회` : '이해 확인 기록 없음',
                detail: '교육 전달·이해도 확인·근로자의 실제 안전행동 관찰은 별도입니다. 모국어를 읽는 데 문제가 없는지 현장에서 확인하세요.',
                tone: requiresHelp ? 'review' : understood ? 'recorded' : 'unknown',
                destination: null, actionLabel: null,
            },
            {
                key: 'field', title: '6. 작업·재점검으로 환류',
                status: conflicts ? `상충 이력 ${conflicts}건 · 원본 확인` : needsRecheck ? `재확인 ${needsRecheck}건 · 기한 경과 ${overdue}건` : '미해소 실천 이력 없음 · 현장 안전 미확정',
                detail: '기록된 현장 관찰과 재점검 이력을 바탕으로 다음 교육 중점 내용을 검토하세요. 상태가 비어 있거나 모두 입력돼도 실제 조치 완료·작업 재개를 승인하지 않습니다.',
                tone: conflicts || needsRecheck ? 'review' : 'unknown',
                destination: 'ocr-analysis', actionLabel: '현장 확인 기록',
            },
        ],
        risksNote: summary.repeatedRiskKeywords.length
            ? `여러 운영 구간에 반복 등장한 위험 키워드 ${summary.repeatedRiskKeywords.length}개. 단어 중복은 사고 감소 또는 위험 제거 효과를 입증하지 않습니다.`
            : '현재 집계에서 반복 위험 키워드를 확인하지 못했습니다. 표본 부족이나 기록 방식 차이일 수 있으며 위험이 없다는 뜻은 아닙니다.',
        guarantee: 'not-approved',
    };
};
