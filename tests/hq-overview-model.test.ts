import {describe, expect, it} from 'vitest';
import {CONSTRUCTION_ZONES, summarizeHqOverview, type HqOverviewInput} from '../components/hq/hqOverviewModel';

const empty: HqOverviewInput={
  processes:[
    {id:'underground-wall',area:'지하 RC',title:'지하 합벽·벽체',zones:['지하']},
    {id:'formwork',area:'일반 형틀',title:'형틀',zones:['기초','지하','지상','옥탑']},
    {id:'alform',area:'지상 골조',title:'AL폼',zones:['지상']}
  ],
  cases:[],visits:[],actions:[],reviews:[]
};

describe('HQ executive overview derived from in-memory records',()=>{
  it('does not infer zero field risk from an empty session',()=>{
    const x=summarizeHqOverview(empty,'2026-11-20');
    expect(x.incidentCases).toBe(0);
    expect(x.zones.map(z=>z.zone)).toEqual(CONSTRUCTION_ZONES);
    expect(x.zones.find(z=>z.zone==='지하')?.processes).toBe(2);
    expect(x.overdueOpenActions).toBe(0);
    expect(x.unlinkedActionIds).toEqual([]);
  });
  it('separates the physical zone and the structural trade and counts actual session records only',()=>{
    const input:HqOverviewInput={
      ...empty,
      cases:[
        {id:1,date:'2026-11-19',zone:'지하',processId:'formwork'},
        {id:2,date:'2026-11-20',zone:'지상',processId:'alform'},
        {id:3,date:'2026-11-20',zone:'지하',processId:'underground-wall'}
      ],
      visits:[{id:1,date:'2026-11-20',status:'예정'},{id:2,date:'2026-11-19',status:'방문 기록'}],
      actions:[
        {id:'a',incidentId:1,dueOn:'2026-11-19',state:'reinspection_requested'},
        {id:'b',incidentId:1,dueOn:'2026-11-21',state:'evidence_submitted'},
        {id:'c',incidentId:2,dueOn:'2026-11-10',state:'revision_required'},
        {id:'orphan',incidentId:999,dueOn:'2026-11-10',state:'open'}
      ],
      reviews:[{incidentId:1,status:'requested'},{incidentId:2,status:'draft'},{incidentId:999,status:'requested'}]
    };
    const x=summarizeHqOverview(input,'2026-11-20');
    expect(x.scheduledVisits).toBe(1);
    expect(x.incidentCases).toBe(3);
    expect(x.reviewRequests).toBe(1);
    expect(x.casesAwaitingReview).toBe(2);
    expect(x.linkedActionCount).toBe(3);
    expect(x.overdueOpenActions).toBe(2);
    expect(x.reinspectionRequests).toBe(1);
    expect(x.unlinkedActionIds).toEqual(['orphan']);
    expect(x.zones.find(z=>z.zone==='지하')?.cases).toBe(2);
    expect(x.zones.find(z=>z.zone==='지상')?.cases).toBe(1);
    expect(x.processGroups.find(g=>g.name==='일반 형틀')?.cases).toBe(1);
    expect(x.processGroups.find(g=>g.name==='지하 RC')?.cases).toBe(1);
    expect(x.processGroups.find(g=>g.name==='지상 골조')?.cases).toBe(1);
  });
  it('rejects invalid dates and duplicate incident IDs rather than double-counting',()=>{
    expect(()=>summarizeHqOverview(empty,'2026-02-30')).toThrow('기준일');
    expect(()=>summarizeHqOverview({...empty,cases:[
      {id:4,date:'2026-11-19',zone:'지하',processId:'formwork'},
      {id:4,date:'2026-11-20',zone:'지상',processId:'alform'}]},'2026-11-20')).toThrow('중복');
  });
});
