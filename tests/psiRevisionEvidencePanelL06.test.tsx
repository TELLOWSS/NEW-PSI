import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PsiRevisionEvidencePanelL06, hasReadableL06RevisionChain } from '../components/assessment/PsiRevisionEvidencePanelL06';
import { PSI_FORM_QUESTIONS } from '../config/psiFormMaster';

const source = (name: string) => readFileSync(resolve(process.cwd(),name),'utf8');
const answers = {Q1:'갱폼 인상 작업',Q2:'단부 추락 위험',Q3:'상',Q4:'안전고리 체결',Q5:'작업 전 안전고리 점검'};
const record = (id: string, update = answers, events: Array<{action:string;note:string;revision:number}> = []) => ({
  schema:'psi-worker-risk-manager-review-v1',
  tenantId:'tenant-a',siteId:'site-a',workerId:'worker-a',
  submissionId:id,sourceLanguage:'ko',gradeReason:'추락 방지 대책 점검 필요',answers:update,events,workClearanceGranted:false as const,
});
const valid = () => ({
  schema:'psi-worker-risk-revision-chain-v1',
  original:record('original-a',answers,[{action:'request_changes',note:'위험 감소대책의 구체적인 체결 위치를 보완하세요.',revision:1}]),
  replacement:record('replacement-b',{...answers,Q4:'지정된 고정점 확인 후 안전고리 체결'}),
  linkedAt:'2026-11-22T00:00:00.000Z',
  workClearanceGranted:false as const,
});

describe('L06 manager-side immutable Q1-Q5 revision comparison (unwired staging UI)',()=>{
  it('shows five source pairs, meaningful change labels and no automatic approval',()=>{
    const chain=valid();
    const originalSnapshot=JSON.stringify(chain);
    expect(hasReadableL06RevisionChain(chain)).toBe(true);
    const markup=renderToStaticMarkup(<PsiRevisionEvidencePanelL06 chain={chain}/>);
    expect(markup).toContain('data-testid="psi-l06-revision-evidence"');
    expect(markup).toContain('보완요청 원문과 새 작성본 비교');
    expect(markup).toContain('위험 감소대책의 구체적인 체결 위치를 보완하세요.');
    expect(markup).toContain('지정된 고정점 확인 후 안전고리 체결');
    expect(markup).toContain('문구 변경');
    expect(markup).toContain('원문 동일');
    expect(markup).toContain('변경 문항만 보기 (1)');
    expect(markup).toContain('신규 보완본 접수 · 검토 대기');
    expect(markup).toContain('data-testid="psi-l06-changed-count"');
    expect(markup).toContain('data-testid="psi-l06-changes-filter"');
    expect(markup).toContain('작업 재개 승인');
    expect((markup.match(/<article/g)||[])).toHaveLength(PSI_FORM_QUESTIONS.length);
    expect(markup).toContain('md:grid-cols-2');
    expect(JSON.stringify(chain)).toBe(originalSnapshot);
  });

  it('fails closed for wrong tenant/site/worker/identity, missing review, or forged work clearance',()=>{
    const sample=valid();
    const invalid = [
      null,{}, {...sample,schema:'invented'},
      {...sample,workClearanceGranted:true},
      {...sample,replacement:{...sample.replacement,tenantId:'tenant-b'}},
      {...sample,replacement:{...sample.replacement,siteId:'site-b'}},
      {...sample,replacement:{...sample.replacement,workerId:'worker-b'}},
      {...sample,replacement:{...sample.replacement,submissionId:'original-a'}},
      {...sample,original:{...sample.original,events:[]}},
      {...sample,original:{...sample.original,events:[{action:'approved',note:'최종 검토',revision:2}]}},
      {...sample,original:{...sample.original,workClearanceGranted:true}},
      {...sample,replacement:{...sample.replacement,answers:{Q1:'있음'}}},
    ];
    for(const candidate of invalid) {
      expect(hasReadableL06RevisionChain(candidate)).toBe(false);
      const markup=renderToStaticMarkup(<PsiRevisionEvidencePanelL06 chain={candidate}/>);
      expect(markup).toContain('data-testid="psi-l06-revision-unavailable"');
      expect(markup).not.toContain('갱폼 인상 작업');
    }
  });

  it('keeps the demonstration out of production and connects browser QA to the real dev route',()=>{
    const appEntry=source('index.tsx');
    const entryHtml=source('index.html');
    const demo=source('pages/PsiRevisionLabL06.tsx');
    const workflow=source('.github/workflows/psi-company-wide.yml');
    const browser=source('scripts/verify-psi-l06-revision-lab.mjs');
    expect(appEntry).toContain("import.meta.env.DEV ? React.lazy(() => import('./pages/PsiRevisionLabL06')) : null");
    expect(appEntry).toContain("'/_dev/psi-l06-revisions'");
    expect(entryHtml).toContain("'/worker-risk-draft', '/_dev/psi-l06-revisions'");
    expect(appEntry).toContain('해당 내부 검수 화면은 운영 환경에서 제공되지 않습니다');
    expect(demo).toContain('<PsiRevisionEvidencePanelL06 chain={selected} />');
    expect(demo).toContain('가상 데이터');
    expect(demo).not.toMatch(/fetch\s*\(|supabase\.from|localStorage|indexedDB|XMLHttpRequest/);
    expect(workflow).toContain('node scripts/verify-psi-l06-revision-lab.mjs');
    expect(browser).toContain('productionDenied:true');
    expect(browser).toContain('crossSiteBlocked:true');
  });

  it('uses each child review event as record-only status, never as field work authorization',()=>{
    const first=valid();
    const reviewed={...first,replacement:{...first.replacement,
      events:[{action:'reviewed',note:'위험요인과 안전조치 원문을 확인했습니다.',revision:1}]}};
    const approved={...first,replacement:{...first.replacement,
      events:[{action:'reviewed',note:'위험요인과 안전조치 원문을 확인했습니다.',revision:1},
        {action:'approved',note:'기록 검토만 승인했으며 작업 재개 허가가 아닙니다.',revision:2}]}};
    const reviseAgain={...first,replacement:{...first.replacement,
      events:[{action:'request_changes',note:'Q5의 점검시점을 추가 작성 바랍니다.',revision:1}]}};
    expect(renderToStaticMarkup(<PsiRevisionEvidencePanelL06 chain={reviewed}/>)).toContain('1차 검토 완료 · 최종 검토 대기');
    expect(renderToStaticMarkup(<PsiRevisionEvidencePanelL06 chain={approved}/>)).toContain('평가자료 검토 승인 · 작업허가 아님');
    expect(renderToStaticMarkup(<PsiRevisionEvidencePanelL06 chain={reviseAgain}/>)).toContain('추가 보완요청 · 미완료');
    expect(renderToStaticMarkup(<PsiRevisionEvidencePanelL06 chain={approved}/>)).toContain('기록 검토와 현장 조치는 별개입니다');
  });

  it('never creates a worker submission, a network call or writable manager approval',()=>{
    const component=source('components/assessment/PsiRevisionEvidencePanelL06.tsx');
    const sql=source('supabase/proposals/psi_worker_risk_resubmission_l06_staging.sql');
    expect(component).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|supabase\.from|localStorage|indexedDB|navigator\.share/);
    expect(component).not.toMatch(/onSubmit=|autoApprove|grantWorkClearance/);
    expect(component).toContain('setChangedOnly(v => !v)');
    expect(sql).toContain('public.psi_submit_worker_risk_l06(');
    expect(sql).toContain('public.psi_read_worker_risk_review_l06(');
    expect(sql).toContain('psi_l06_revision_link_immutable');
    expect(sql).toContain('force row level security');
    expect(sql).not.toMatch(/create\s+policy\s+allow_all/i);
  });
});
