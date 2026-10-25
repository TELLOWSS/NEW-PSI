import type {Page,WorkerRecord} from '../types';
import {isOperationalWorkerRecord,selectLatestCoreMetricRecords,calculateCoreMetricSnapshot} from './coreMetrics';
import {getSafetyLevelThresholds} from './safetyLevelUtils';
import {isPendingOperationsReviewRecord,isProtectionPriorityRecord} from './operationsBoard';

export type OperatorNextTask={title:string;description:string;label:string;page:Page;status:'review'|'start'|'education'};
/**
 * Only PSI self-risk-assessment records are considered. Does not inspect server
 * photos, validate site conditions, save statuses or authorize work stoppage.
 */
export function selectOperatorNextTask(records:WorkerRecord[]):OperatorNextTask{
    const latest=selectLatestCoreMetricRecords(records.filter(isOperationalWorkerRecord));
    const metric=calculateCoreMetricSnapshot(latest);
    if(latest.length===0){
        return {title:'현장 기록부터 시작',description:'위험성평가 기록을 추가한 뒤 관리자가 사실과 점수를 확인합니다.',label:'위험성평가 작성·분석',page:'ocr-analysis',status:'start'};
    }
    if(latest.some(record=>record.riskDecision==='CRITICAL_STOP')){
        return {title:'작업중지 신호의 근거 확인',description:'기록에 작업중지 신호가 있습니다. 실제 통제·작업재개 판단은 현장 책임자가 확인해야 합니다.',label:'보호 조치 근거 확인',page:'safety-compliance-hub',status:'review'};
    }
    const threshold=getSafetyLevelThresholds().intermediateMin;
    if(latest.some(record=>isProtectionPriorityRecord(record,threshold))){
        return {title:'보호 우선 기록 검토',description:'근로자 위험 신호 또는 유효 점수를 기준으로 선정된 기록입니다. 작업 현장의 사실과 조치 필요성을 확인하세요.',label:'보호 우선 기록 열기',page:'ocr-analysis',status:'review'};
    }
    if(latest.some(isPendingOperationsReviewRecord)){
        return {title:'관리자 검토 대기',description:'저장된 위험성평가 중 검토 대기 상태가 있습니다. 승인 전 기록을 먼저 확인하세요.',label:'검토 대기 기록 열기',page:'ocr-analysis',status:'review'};
    }
    if(metric.validScoreRecordCount===0){
        return {title:'유효 점수 자료 확인',description:'위험성평가 기록은 있으나 유효 점수가 없습니다. 이를 안전한 0점이나 무위험으로 판단하지 마세요.',label:'원본 기록 검토',page:'ocr-analysis',status:'start'};
    }
    return {title:'검토된 기록을 교육으로 연결',description:'다음 교육자료 초안을 검토할 수 있습니다. 인스펙터의 미결 조치 여부는 이 추천에 포함되지 않습니다.',label:'교육 환류 센터 열기',page:'education-return',status:'education'};
}
