import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildLocalRecheckQueue} from '../lib/inspector/localRecheckQueue.mjs';
import {buildLocalNextCheckPrompt} from '../lib/inspector/localNextCheckPrompt.mjs';

const now=new Date('2026-11-22T12:00:00+09:00');
const id=(last:string)=>`1a1a1a1a-2222-4333-8444-${last}`;
const record=(suffix:string,status='pending',dueDate='2026-11-22',overrides:Record<string,unknown>={})=>({
    id:id(suffix),note:'합성 점검 기록',followup:{
        status,assignee:'합성 책임자',temporaryMeasure:'임시 통제 계획 기록',dueDate,
        history:[{status,at:'2026-11-20T00:00:00Z'}],
    },rechecks:[],...overrides,
});
const source=(name:string)=>readFileSync(resolve(process.cwd(),name),'utf8');

describe('L09 local deferred-action next confirmation',()=>{
    it('shows a neutral result for zero records and never infers safety or approval',()=>{
        const status=buildLocalNextCheckPrompt(buildLocalRecheckQueue([],now));
        expect(status.target).toBeNull();
        expect(status.headline).toContain('대상이 없습니다');
        expect(status.guidance).toContain('위험이 없거나');
        expect(status.isSafetyApproved).toBe(false);
        expect(status.notified).toBe(false);
    });
    it('shows recorded verified entries as input only, not physical completion',()=>{
        const status=buildLocalNextCheckPrompt(buildLocalRecheckQueue([
            record('000000000001','verified','2026-11-01'),
        ],now));
        expect(status.target).toBeNull();
        expect(status.recordedVerified).toBe(1);
        expect(status.openCount).toBe(0);
        expect(status.headline).toContain('입력');
        expect(status.isSafetyApproved).toBe(false);
    });
    it('prioritizes contradictory verified record against newer unresolved recheck',()=>{
        const conflicting=record('000000000001','verified','2026-11-26',{
            rechecks:[{result:'delayed',at:'2026-11-21T00:00:00Z',nextCheckDate:'2026-11-22'}],
        });
        const status=buildLocalNextCheckPrompt(buildLocalRecheckQueue([
            record('000000000002','pending','2026-11-20'),conflicting,
        ],now));
        expect(status.target?.recordId).toBe(conflicting.id);
        expect(status.category).toContain('상태 불일치');
        expect(status.action).toContain('기록 충돌');
        expect(status.openCount).toBe(2);
        expect(status.isSafetyApproved).toBe(false);
    });
    it('prioritizes overdue before a recheck due today and names the correct date type',()=>{
        const status=buildLocalNextCheckPrompt(buildLocalRecheckQueue([
            record('000000000001','in_progress','2026-11-22'),
            record('000000000002','pending','2026-11-18',{
                rechecks:[{result:'delayed',at:'2026-11-20T00:00:00Z',nextCheckDate:'2026-11-21'}],
            }),
        ],now));
        expect(status.target?.recordId).toBe(id('000000000002'));
        expect(status.category).toBe('예정일 초과');
        expect(status.dateLabel).toBe('재점검 예정일 2026-11-21');
        expect(status.guidance).toContain('임시 통제');
    });
    it('shows missing owner, controls and next check date separately without inferring nonimplementation',()=>{
        const target=record('000000000001','pending','',{
            followup:{status:'pending',assignee:'',temporaryMeasure:'',dueDate:'',history:[]},
        });
        const status=buildLocalNextCheckPrompt(buildLocalRecheckQueue([target],now));
        expect(status.category).toBe('일정 미정');
        expect(status.checklist).toHaveLength(3);
        expect(status.checklist[0]).toContain('담당자');
        expect(status.checklist[1]).toContain('실제 시행 여부 별도 확인');
        expect(status.dateLabel).toContain('미정');
        expect(status.isSafetyApproved).toBe(false);
    });
    it('puts an unscheduled handoff target ahead of an assigned future task',()=>{
        const status=buildLocalNextCheckPrompt(buildLocalRecheckQueue([
            record('000000000001','pending','2026-12-10'),
            record('000000000002','pending',''),
        ],now));
        expect(status.target?.recordId).toBe(id('000000000002'));
        expect(status.action).toContain('조치 기한');
    });
    it('does not mix additional actions or photos with the whole inspection target',()=>{
        const row=record('000000000001','in_progress','2026-12-10',{
            additionalActions:[{
                id:id('000000000099'),title:'조치 추가 항목',
                followup:{status:'pending',assignee:'',temporaryMeasure:'',dueDate:'2026-11-20',history:[]},
            }],
        });
        const status=buildLocalNextCheckPrompt(buildLocalRecheckQueue([row],now));
        expect(status.target).toEqual({recordId:row.id,actionId:id('000000000099')});
        expect(status.targetLabel).toBe('조치 추가 항목');
        expect(status.statusLabel).toBe('미조치');
        expect(status.isSafetyApproved).toBe(false);
    });
    it('keeps guide read-only and routes to the existing saved recheck editor',()=>{
        const logic=source('lib/inspector/localNextCheckPrompt.mjs');
        const panel=source('components/inspector/LocalNextCheckPanel.tsx');
        const page=source('components/inspector/InspectorLocalDraft.tsx');
        expect(logic).toContain('selectLocalHandoffTargets(records)');
        expect(logic).toContain('isSafetyApproved:false,notified:false');
        expect(panel).toContain('data-psi-l09-next-check');
        expect(panel).toContain('onOpen(prompt.target.recordId,prompt.target.actionId)');
        expect(page).toContain('const nextCheckPrompt=buildLocalNextCheckPrompt(recheckQueue)');
        expect(page).toContain('<LocalNextCheckPanel prompt={nextCheckPrompt} busy={busy} onOpen={(recordId,actionId)=>{void jumpToNextSavedRecheck(recordId,actionId);}}/>');
        expect(page).toContain('const fresh=await list()');
        expect(page).toContain('current.target.recordId!==recordId||current.target.actionId!==actionId');
        expect(page).toContain('setMessage(\'다른 탭 또는 기기 저장 기록이 바뀌었습니다.');
        expect(page).toContain('setRecheckJumpTarget({recordId,actionId})');
        expect(page).toContain("setRecheckJumpTarget({recordId,actionId})");
        expect(page).toContain('<FollowupEditor row={row} busy={busy} onSave={saveFollowup}/>');
        expect(logic).not.toMatch(/fetch\s*\(|indexedDB\.|localStorage|sessionStorage|setInterval\s*\(/i);
        expect(panel).not.toMatch(/fetch\s*\(|indexedDB\.|localStorage|sessionStorage|setInterval\s*\(/i);
    });
});
