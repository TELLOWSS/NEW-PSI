import type {InspectorAction} from './types.js';
import {koreanDay,overdueAction} from './workQueue.js';

export type ActionRadarSummary={
    total:number; overdue:number; awaitingReinspection:number; open:number; verified:number;
    dueToday:number; missingAssignment:number; immediateMessage:string; scope:string;
};
/**
 * Classifies saved actions from exactly one inspection, without requesting share receipts.
 * Reply delivery/read state cannot be inferred from an action record or a generated link.
 * No transitions or legal/work-resumption conclusions are made here.
 */
export function summarizeActionRadar(actions:readonly InspectorAction[],today:string=koreanDay()):ActionRadarSummary{
    const overdue=actions.filter(a=>overdueAction(a,today)).length;
    const awaitingReinspection=actions.filter(a=>a.status==='review-requested').length;
    const open=actions.filter(a=>a.status==='open').length;
    const verified=actions.filter(a=>a.status==='verified').length;
    const dueToday=actions.filter(a=>a.status!=='verified'&&a.dueDate===today).length;
    const missingAssignment=actions.filter(a=>a.status!=='verified'&&(
        !a.owner?.trim()||!/\d{4}-\d{2}-\d{2}/.test(a.dueDate||'')
    )).length;
    const immediateMessage=overdue>0
        ? `기한이 지난 미결 조치 ${overdue}건을 확인하세요. 위험 정도와 작업통제 필요성은 현장에서 판단합니다.`
        : awaitingReinspection>0
            ? `개선사진을 받은 조치 ${awaitingReinspection}건의 실제 현장 재점검을 진행하세요. 아직 완료 승인이 아닙니다.`
            : missingAssignment>0
                ? `담당자 또는 기한 확인이 필요한 조치 ${missingAssignment}건을 보완하세요.`
                : open>0
                    ? `미조치 ${open}건의 담당자·기한을 확인하고 개선 진행을 요청하세요.`
                    : actions.length>0
                        ? '저장된 조치는 재점검 확인 상태입니다. 새 위험이나 미등록 조치가 없는지는 현장 확인이 필요합니다.'
                        : '이 점검에 등록된 조치가 없습니다. 위험이나 조치 필요성이 없다는 뜻은 아닙니다.';
    return {
        total:actions.length,overdue,awaitingReinspection,open,verified,dueToday,missingAssignment,
        immediateMessage,
        scope:'이 점검의 저장된 조치만 표시합니다. 링크 발송·상대 열람·미회신 여부는 공유 기록을 별도로 조회해야 알 수 있습니다.',
    };
}
