import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {summarizeGlobalActionsBySite,type GlobalActionRow} from '../lib/inspector/globalActionRegister';
import InspectorManualContext,{INSPECTOR_WORK_TYPES} from '../components/inspector/InspectorManualContext';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const row=(patch:Partial<GlobalActionRow>):GlobalActionRow=>({
 inspectionId:'ins-1',
 inspectionRevision:2,
 inspectionTitle:'정기 안전점검',
 siteName:'용인 A현장',
 location:'102동 5층',
 workType:'형틀',
 urgent:false,
 inspectionCreatedAt:'2026-11-20T00:00:00Z',
 inspectionUpdatedAt:'2026-11-26T00:00:00Z',
 actionId:'act-1',
 title:'개구부 안전덮개 고정',
 owner:'형틀반장',
 dueDate:'2026-11-26',
 status:'open',
 scheduleContext:'',
 verifiedAt:'',
 ...patch,
});

describe('Inspector P0 HQ & Field workflow enhancements',()=>{
 it('aggregates loaded actions per site cleanly without mutating source rows',()=>{
  const today='2026-11-27';
  const input:GlobalActionRow[]=[
   row({actionId:'a1',siteName:'용인 A현장',status:'verified',verifiedAt:'2026-11-25T10:00:00Z'}),
   row({actionId:'a2',siteName:'용인 A현장',status:'review-requested',dueDate:'2026-11-28'}),
   row({actionId:'b1',siteName:'평택 B현장',status:'open',dueDate:'2026-11-25'}),
   row({actionId:'c1',siteName:'  ',status:'open',dueDate:'2026-11-30'}),
  ];
  const snapshot=JSON.stringify(input);
  const summary=summarizeGlobalActionsBySite(input,today);
  expect(JSON.stringify(input)).toBe(snapshot);
  expect(summary.map(s=>s.siteLabel)).toEqual(['평택 B현장','용인 A현장','현장 미입력']);
  expect(summary[0]).toMatchObject({total:1,overdue:1,unresolved:1,verified:0,completionRate:0});
  expect(summary[1]).toMatchObject({total:2,overdue:0,reinspection:1,unresolved:1,verified:1,completionRate:50});
  expect(summary[2]).toMatchObject({siteKey:'',siteLabel:'현장 미입력',total:1,unresolved:1});
 });

 it('unifies NEW-PSI frame-construction trades while retaining all legacy trades',()=>{
  for(const required of ['형틀','철근','갱폼','알폼','시스템','시스템비계','시스템동바리','해체정리','해체작업','콘크리트비계','콘크리트 타설','바닥미장','할석미장견출','양중']){
   expect(INSPECTOR_WORK_TYPES).toContain(required);
  }
  const html=renderToStaticMarkup(React.createElement(InspectorManualContext,{
   workType:'알폼',topic:'',showTopic:true,disabled:false,onWorkType:()=>{},onTopic:()=>{},
  }));
  expect(html).toContain('알폼');
  expect(html).toContain('해체정리');
  expect(html).toContain('콘크리트비계');
 });

 it('exposes top hub tabs, site/location fields, batch HQ load, and reinspection rejection loop',()=>{
  const quick=read('components/inspector/InspectorQuickWorkspace.tsx');
  const hq=read('components/inspector/InspectorGlobalActionRegister.tsx');
  const followup=read('components/inspector/InspectorActionFollowup.tsx');

  expect(quick).toContain('si-hub-tabs');
  expect(quick).toContain('본사 · 전현장 개선관제');
  expect(quick).toContain('si-site-context-bar');
  expect(quick).toContain('si-quick-site-name');
  expect(quick).toContain('si-quick-location');
  expect(quick).toContain('onReject={rejectAction}');

  expect(hq).toContain('defaultOpen=false');
  expect(hq).toContain('연속 5페이지 더 불러오기');
  expect(hq).toContain('summarizeGlobalActionsBySite');
  expect(hq).toContain('data-global-site-board="true"');

  expect(followup).toContain('보완 재요청 (반려)');
  expect(followup).toContain('extractRejectionHistory');
  expect(followup).toContain('data-rejection-history="true"');
 });
});
