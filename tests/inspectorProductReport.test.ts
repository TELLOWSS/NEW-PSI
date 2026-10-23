import {describe,it,expect} from 'vitest';
import {PRODUCT_EXAMPLES} from '../lib/inspector/productExperience';
import {productReportSnapshot,validSampleDue,type ProductReportInput} from '../lib/inspector/productReport';
const input=():ProductReportInput=>({sample:PRODUCT_EXAMPLES[0],reviewSaved:false,decision:'accepted',note:'저장 전 전문가 의견',assignment:{owner:'예시 담당',due:'2026-10-26'},assignmentApplied:false});
describe('public sample report boundaries',()=>{
 it('does not publish unsaved reviewer input or imply an approval',()=>{const report=productReportSnapshot(input(),new Date('2026-10-23T00:00:00Z'));expect(report.expert).toBe('');expect(report.review).toContain('저장 전');expect(report.proposal).toBe(PRODUCT_EXAMPLES[0].action);expect(report.assignmentLabel).toContain('기본 가상');expect(report.createdAt).toBe('2026-10-23T00:00:00.000Z');});
 it('uses saved expert rejection instead of the original proposal',()=>{const report=productReportSnapshot({...input(),reviewSaved:true,decision:'rejected',note:'  현장 재확인 후 다른 통행구간 보완  '});expect(report.proposal).toBe('현장 재확인 후 다른 통행구간 보완');expect(report.review).toContain('미수용');expect(report.rejected).toBe(true);expect(JSON.stringify(report)).not.toContain(PRODUCT_EXAMPLES[0].action);});
 it('keeps the opened document independent of subsequent input changes',()=>{const source=input(),report=productReportSnapshot({...source,assignmentApplied:true});source.assignment.owner='DRAFT OWNER';source.assignment.due='2027-01-01';source.note='DRAFT NOTE';expect(report.owner).toBe('예시 담당');expect(report.due).toBe('2026-10-26');expect(report.assignmentLabel).toContain('적용한 가상');expect(JSON.stringify(report)).not.toContain('DRAFT');});
 it('requires real ISO calendar dates before applying sample assignments',()=>{for(const value of ['2026-02-30','2026-13-01','','not-a-date','2026-1-01'])expect(validSampleDue(value)).toBe(false);expect(validSampleDue('2028-02-29')).toBe(true);});
});
