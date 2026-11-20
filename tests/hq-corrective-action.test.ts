import { describe, expect, it } from 'vitest';
import {
  createCorrectiveAction, recordInterimControl, submitActionEvidence,
  requestActionReinspection, requestActionRevision, overdueActions,
  ACTION_STATE_LABELS, type CorrectiveAction
} from '../components/hq/correctiveActionModel';

const at='2026-11-20T02:00:00.000Z';
const create=(dueOn='2026-11-23'):CorrectiveAction=>createCorrectiveAction({
  id:'ACTION-1',incidentId:23,title:'지하 합벽 거푸집 긴결 상태 보완',
  controlClass:'engineering',ownerRole:'현장 안전관리자',dueOn
},'E1',at);

describe('HQ corrective action/reinspection prototype safety contracts',()=>{
  it('requires an incident, a meaningful action and a valid due date',()=>{
    expect(()=>createCorrectiveAction({
      id:'',incidentId:0,title:'짧음',controlClass:'education',ownerRole:'현장 담당자',dueOn:'2026-02-30'
    },'E1',at)).toThrow();
    const action=create();
    expect(action.state).toBe('open');
    expect(action.events).toHaveLength(1);
    expect('verified' in ACTION_STATE_LABELS).toBe(false);
  });

  it('records interim protections without marking a pending measure complete',()=>{
    const action=create();
    expect(()=>recordInterimControl(action,'미흡','E2',at)).toThrow();
    const after=recordInterimControl(action,'해당 구역의 접근을 제한하고 관리자를 배치','E2',at);
    expect(after.state).toBe('interim_control');
    expect(after.interimDescription).toContain('접근을 제한');
    expect(action.state).toBe('open');
  });

  it('rejects unsupported implementation or reinspection transitions',()=>{
    const a=create();
    expect(()=>requestActionReinspection(a,'E2',at)).toThrow('이행자료 제출');
    expect(()=>submitActionEvidence(a,'','검토를 위한 조치 이행내용 설명','E2',at)).toThrow('자료 번호');
    const b=submitActionEvidence(a,'ACT-001','이행사진 등록과 세부조치 설명 기록','E2',at);
    expect(b.state).toBe('evidence_submitted');
    expect(()=>submitActionEvidence(b,'ACT-002','자료를 또 제출하려고 시도','E3',at)).toThrow();
    const c=requestActionReinspection(b,'E3',at);
    expect(c.state).toBe('reinspection_requested');
    expect(()=>requestActionReinspection(c,'E4',at)).toThrow();
    expect(c.events.map(e=>e.type)).toEqual(['created','implementation_submitted','reinspection_requested']);
  });

  it('preserves audit history when requesting a supplement and submitting revised evidence',()=>{
    const a=create();
    const b=submitActionEvidence(a,'ACT-001','임시 지지대 설치 사진과 위치 정보','E2',at);
    expect(()=>requestActionRevision(b,'X','E3',at)).toThrow('보완 사유');
    const c=requestActionRevision(b,'지지대 설치상태 증빙 추가 필요','E3',at);
    expect(c.state).toBe('revision_required');
    const d=submitActionEvidence(c,'ACT-002','보완된 지지대 설치상태 증빙을 등록','E4',at);
    expect(d.state).toBe('evidence_submitted');
    expect(d.events).toHaveLength(4);
    expect(d.events[2].type).toBe('revision_required');
    expect(()=>requestActionRevision(d,'재확인','E4',at)).toThrow('중복 이력');
  });

  it('treats overdue submissions and reinspection requests as NOT verified',()=>{
    let a=create('2026-11-19');
    a=submitActionEvidence(a,'ACT-011','개선자료 제출내용 예시 설명입니다','E2',at);
    a=requestActionReinspection(a,'E3',at);
    expect(overdueActions([a,create('2026-11-21')],'2026-11-20')).toBe(1);
    expect(Object.values(ACTION_STATE_LABELS)).not.toContain('검증완료');
    expect(()=>overdueActions([a],'invalid')).toThrow();
  });
});
