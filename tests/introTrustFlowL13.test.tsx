import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import FirstUseTrustGuideL13 from '../components/introduction/FirstUseTrustGuideL13';
import {INTRO_SCOPE_WARNINGS,INTRO_VERIFIED_PATH,getIntroPathStep} from '../utils/introTrustFlowL13';
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');

describe('L13 actual PSI first-use guide and evidence-safe product claims',()=>{
 it('shows five genuine admin-page destinations without inventing an automatic worker submission',()=>{
   expect(INTRO_VERIFIED_PATH.map(x=>x.key)).toEqual(['original','review','education','followup','report']);
   expect(INTRO_VERIFIED_PATH.map(x=>x.destination)).toEqual([
     'ocr-analysis','ocr-analysis','education-return','monthly-guidance-report','reports',
   ]);
   expect(getIntroPathStep('report').action).toBe('보고서 검토 열기');
   expect(INTRO_VERIFIED_PATH.every(x=>x.task&&x.evidenceBoundary)).toBe(true);
 });
 it('retains each handoff and approval boundary rather than a claim of fulfilled safety',()=>{
   const full=JSON.stringify(INTRO_VERIFIED_PATH);
   expect(getIntroPathStep('original').evidenceBoundary).toContain('직접 QR 제출을 증명하지 않습니다');
   expect(getIntroPathStep('review').task).toContain('그대로 공식 판단으로 확정하지 않습니다');
   expect(getIntroPathStep('education').evidenceBoundary).toContain('교육 발행');
   expect(getIntroPathStep('followup').evidenceBoundary).toContain('안전조치 완료');
   expect(getIntroPathStep('report').evidenceBoundary).toContain('상대방 수신');
   expect(full).not.toMatch(/모든 현장 자동 승인|근로자 100% 이수|자동 전송 완료|사고 0건 보장/);
 });
 it('disclaims six scored fields vs proposed six perception dimensions and QR/multilingual validation',()=>{
   expect(INTRO_SCOPE_WARNINGS).toHaveLength(3);
   expect(INTRO_SCOPE_WARNINGS[0]).toContain('동일한 확정 지표가 아닙니다');
   expect(INTRO_SCOPE_WARNINGS[1]).toContain('직접 Q1~Q5 온라인 제출은 별도 미완성');
   expect(INTRO_SCOPE_WARNINGS[2]).toContain('실제 전송');
 });
 it('renders clear accessible 44px choices and exactly one real destination action',()=>{
   const html=renderToStaticMarkup(React.createElement(FirstUseTrustGuideL13,{onNavigate:()=>{}}));
   expect(html).toContain('data-psi-onboarding-l13="true"');
   expect(html).toContain('aria-label="처음 시작하는 다섯 단계"');
   expect((html.match(/role="tab"/g)||[])).toHaveLength(5);
   expect((html.match(/role="tabpanel"/g)||[])).toHaveLength(1);
   expect(html).toContain('aria-selected="true"');
   expect(html).toContain('min-h-11');
   expect(html).toContain('OCR 원본 대조 열기');
   expect(html).toContain('실제 메뉴 연결 · 자동 완료 아님');
   expect(html).toContain('제품 기능 설명과 실제 검증의 차이');
 });
 it('uses the actual introduction entry; does not add new route auth, network API or persistent completion state',()=>{
   const intro=read('pages/Introduction.tsx');
   const guide=read('components/introduction/FirstUseTrustGuideL13.tsx');
   const helper=read('utils/introTrustFlowL13.ts');
   expect(intro).toContain('<FirstUseTrustGuideL13 onNavigate={onNavigateToPage} />');
   expect(intro).toContain('기록지 한 장에서 관리자 확인과 다음 안전조치로.');
   expect(intro).toContain("hasValidSafetyScore(record) && record.safetyScore < 60");
   expect(intro).not.toContain("Number(record.safetyScore || 0) < 60");
   expect(guide).toContain('onNavigate(step.destination)');
   expect(guide+helper).not.toMatch(/fetch\s*\(|postAdminJson|localStorage|sessionStorage|indexedDB|navigator\.share|setInterval/);
 });
});
