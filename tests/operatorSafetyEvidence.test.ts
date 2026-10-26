import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import type {WorkerRecord} from '../types';
import {summarizeOperatorSafetyEvidence} from '../utils/operatorSafetyEvidence';
import {selectOperatorNextTask} from '../utils/operatorNextTask';

const make=(person:string,date:string,patch:Partial<WorkerRecord>={}):WorkerRecord=>({
    id:person+'-'+date,worker_uuid:person,name:'합성'+person,
    jobField:'형틀',date,safetyScore:90,selfAssessedRiskLevel:'중',
    ...patch,
} as WorkerRecord);
const score=(value:unknown):Partial<WorkerRecord>=>({safetyScore:value} as Partial<WorkerRecord>);

describe('ATLAS P0 first implementation: safety evidence and missing-score integrity',()=>{
    it('reports current and older work-stop signals separately from the actual field decision',()=>{
        const cases=[
            make('a','2026-10-01',{riskDecision:'CRITICAL_STOP'}),
            make('a','2026-10-02',{riskDecision:undefined}),
            make('b','2026-10-03',{riskDecision:'CRITICAL_STOP',...score(null)}),
        ];
        const facts=summarizeOperatorSafetyEvidence(cases);
        expect(facts.latestAssessmentRecords).toBe(2);
        expect(facts.latestCriticalStopSignals).toBe(1);
        expect(facts.olderCriticalStopRecords).toBe(1);
        expect(facts.siteControlVerified).toBe(false);
        expect(facts.inspectorActionsQueried).toBe(false);
        expect(selectOperatorNextTask(cases).page).toBe('safety-compliance-hub');
    });
    it('an older work-stop signal cannot quietly disappear behind a new normal score',()=>{
        const cases=[
            make('a','2026-09-11',{riskDecision:'CRITICAL_STOP',safetyScore:0}),
            make('a','2026-10-26',{riskDecision:undefined,safetyScore:100}),
        ];
        expect(summarizeOperatorSafetyEvidence(cases).olderCriticalStopRecords).toBe(1);
        expect(selectOperatorNextTask(cases)).toMatchObject({
            status:'review',page:'ocr-analysis',title:'이전 작업중지 신호의 처리 경위 확인',
        });
    });
    it('does not incorrectly call previous stop signals currently active',()=>{
        const cases=[
            make('a','2026-09-11',{riskDecision:'CRITICAL_STOP'}),
            make('a','2026-10-26',{safetyScore:91}),
        ];
        const snapshot=summarizeOperatorSafetyEvidence(cases);
        expect(snapshot.latestCriticalStopSignals).toBe(0);
        expect(snapshot.olderCriticalStopRecords).toBe(1);
        expect(snapshot.siteControlVerified).toBe(false);
    });
    it('manager/non-worker data cannot inflate worker stop and score signals',()=>{
        const cases=[
            make('manager','2026-10-26',{jobField:'안전관리',riskDecision:'CRITICAL_STOP'}),
            make('worker','2026-10-26',{jobField:'철근'}),
        ];
        expect(summarizeOperatorSafetyEvidence(cases)).toMatchObject({
            loadedSourceRecords:2,excludedNonWorkerRecords:1,
            operationalSourceRecords:1,latestAssessmentRecords:1,
            latestCriticalStopSignals:0,olderCriticalStopRecords:0,
        });
    });
    it('null/blank/string/NaN scores are not false 0 scores; numeric zero is valid',()=>{
        const cases=[
            make('a','2026-10-26',score(null)),
            make('b','2026-10-26',score('')),
            make('c','2026-10-26',score('0')),
            make('d','2026-10-26',score(Number.NaN)),
            make('e','2026-10-26',score(0)),
            make('f','2026-10-26',score(100)),
        ];
        const facts=summarizeOperatorSafetyEvidence(cases);
        expect(facts.latestAssessmentRecords).toBe(6);
        expect(facts.validScoreRecords).toBe(2);
        expect(facts.missingOrInvalidScoreRecords).toBe(4);
        expect(facts.latestProtectionPriority).toBeGreaterThanOrEqual(1);
    });
    it('distinguishes absent improvement scores from a real zero-improvement score',()=>{
        const empty=summarizeOperatorSafetyEvidence([
            make('a','2026-10-26',{scoreBreakdown:undefined}),
        ]);
        expect(empty.validScoreRecords).toBe(1);
        expect(empty.validImprovementResponseRecords).toBe(0);
        const withZero=summarizeOperatorSafetyEvidence([
            make('a','2026-10-26',{scoreBreakdown:{improvementExecution:0} as WorkerRecord['scoreBreakdown']}),
        ]);
        expect(withZero.validImprovementResponseRecords).toBe(1);
        expect(withZero.validScoreRecords).toBe(1);
    });
    it('rejects invalid improvement responses but never edits existing scores',()=>{
        const rows=[
            make('a','2026-10-26',{scoreBreakdown:{improvementExecution:-1} as WorkerRecord['scoreBreakdown']}),
            make('b','2026-10-26',{scoreBreakdown:{improvementExecution:25} as WorkerRecord['scoreBreakdown']}),
            make('c','2026-10-26',{scoreBreakdown:{improvementExecution:10} as WorkerRecord['scoreBreakdown']}),
        ];
        const before=JSON.stringify(rows);
        const facts=summarizeOperatorSafetyEvidence(rows);
        expect(facts.validImprovementResponseRecords).toBe(1);
        expect(JSON.stringify(rows)).toBe(before);
    });
    it('does not prioritize historical stop above a currently recorded immediate protection signal',()=>{
        const rows=[
            make('a','2026-09-01',{riskDecision:'CRITICAL_STOP'}),
            make('a','2026-10-26',{}),
            make('b','2026-10-26',{riskDecision:'IMMEDIATE_ATTENTION'}),
        ];
        const facts=summarizeOperatorSafetyEvidence(rows);
        expect(facts.olderCriticalStopRecords).toBe(1);
        expect(facts.latestImmediateAttention).toBe(1);
        expect(selectOperatorNextTask(rows)).toMatchObject({status:'review',page:'ocr-analysis',title:'보호 우선 기록 검토'});
    });
    it('all historical stop alerts from the same person remain audit records, not unique people',()=>{
        const rows=[
            make('a','2026-09-01',{riskDecision:'CRITICAL_STOP'}),
            make('a','2026-09-02',{riskDecision:'CRITICAL_STOP'}),
            make('a','2026-10-26',{}),
        ];
        expect(summarizeOperatorSafetyEvidence(rows)).toMatchObject({
            latestAssessmentRecords:1,olderCriticalStopRecords:2,latestCriticalStopSignals:0,
        });
    });
    it('1000 deterministic input reorders do not change evidence totals',()=>{
        const rows=[
            make('a','2026-08-01',{riskDecision:'CRITICAL_STOP'}),
            make('a','2026-10-01',{safetyScore:100}),
            make('b','2026-10-01',{riskDecision:'CRITICAL_STOP',...score(null)}),
            make('c','2026-10-01',{reviewStatus:'PENDING'}),
            make('d','2026-10-01',{selfAssessedRiskLevel:'상',...score('bad')}),
            make('e','2026-10-01',{jobField:'관리'}),
        ];
        const reference=summarizeOperatorSafetyEvidence(rows);
        let seed=0x752026;
        for(let i=0;i<1000;i++){
            const shuffled=[...rows];
            for(let k=shuffled.length-1;k>0;k--){
                seed=(Math.imul(seed,1664525)+1013904223)>>>0;
                const index=seed%(k+1);
                [shuffled[k],shuffled[index]]=[shuffled[index],shuffled[k]];
            }
            expect(summarizeOperatorSafetyEvidence(shuffled)).toEqual(reference);
        }
    });
    it('landing screen labels every unsafe unknown explicitly and preserves inspector independence',()=>{
        const ui=readFileSync('components/IntegratedWorkBoard.tsx','utf8');
        expect(ui).toContain('data-psi-risk-evidence');
        expect(ui).toContain('과거 기록의 중지 신호');
        expect(ui).toContain('중지 신호는 기록상 표식');
        expect(ui).toContain('인스펙터 서버·현장 이슈·교육의 미결 상태는 이 카드에서 조회하지 않습니다.');
        expect(ui).toContain("'자료 없음'");
        expect(ui).toContain("'safety-inspector'");
        expect(ui).not.toContain('전체 지표가 우수하게 유지 중입니다');
    });
    it('adds no Vercel server functions, cron jobs, paid AI, or field decision automation',()=>{
        const source=readFileSync('utils/operatorSafetyEvidence.ts','utf8');
        expect(source).not.toMatch(/fetch\s*\(|\/api\/|XMLHttpRequest|WebSocket|onnxruntime|localStorage|supabase\.from/);
        const vercel=JSON.parse(readFileSync('vercel.json','utf8')) as {
            fluid:boolean;crons?:unknown[];functions:Record<string,{maxDuration:number}>;
        };
        expect(vercel.fluid).toBe(true);
        expect(vercel.crons||[]).toEqual([]);
        expect(Object.keys(vercel.functions).sort()).toEqual(['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort());
        expect(Object.values(vercel.functions).every(x=>x.maxDuration<=300)).toBe(true);
    });
});
