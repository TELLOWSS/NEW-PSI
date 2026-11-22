import React, { useState } from 'react';
import { PsiRevisionEvidencePanelL06 } from '../components/assessment/PsiRevisionEvidencePanelL06';
import '../styles.css';

/**
 * Local Vite-dev-only evidence lab. NO authentication, real worker, API,
 * storage or business record. Never route this page from a deployed build.
 */
const originalAnswers = {
  Q1: '2001동 벽체 거푸집 설치 작업',
  Q2: '단부 작업발판의 안전난간 미설치로 추락 위험',
  Q3: '상',
  Q4: '안전대 착용 후 작업',
  Q5: '작업 전 안전대를 확인하겠습니다',
};
const correction = {
  ...originalAnswers,
  Q4: '작업 전 단부 안전난간 설치를 확인하고 안전대를 지정된 고정점에 체결',
  Q5: '미설치 구간은 작업을 중지하고 담당 관리자에게 즉시 알림',
};
const original = {
  schema: 'psi-worker-risk-manager-review-v1',
  tenantId: 'synthetic-tenant-a',
  siteId: 'synthetic-site-a',
  workerId: 'synthetic-worker-a',
  submissionId: 'synthetic-receipt-original',
  sourceLanguage: 'ko',
  gradeReason: '안전난간을 설치하지 못한 단부 작업',
  answers: originalAnswers,
  workClearanceGranted: false,
  events: [{
    action: 'request_changes',
    note: 'Q4 안전대 사용만으로 충분한 대책인지 검토하고, 난간 설치·고정점 확인과 Q5 실제 행동을 구체적으로 작성해 주세요.',
    revision: 1,
  }],
};
const replacement = {
  ...original,
  submissionId: 'synthetic-receipt-new',
  answers: correction,
  events: [],
};
const fixture = {
  schema: 'psi-worker-risk-revision-chain-v1',
  original,
  replacement,
  linkedAt: '2026-11-22T04:00:00.000Z',
  workClearanceGranted: false,
};
const invalidFixture = {
  ...fixture,
  replacement: { ...replacement, siteId: 'synthetic-other-site' },
};

export default function PsiRevisionLabL06() {
  const [mode, setMode] = useState<'valid'|'mismatch'>('valid');
  // This preview deliberately uses only built-in, explicitly synthetic values.
  const selected = mode === 'valid' ? fixture : invalidFixture;
  return (
    <main data-testid="psi-l06-revision-lab" className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white md:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[.15em] text-teal-300">NEW-PSI · Living UI / L06</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight md:text-4xl">근로자 보완기록 대조 · 개발 검수</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            가상 근로자의 5문항 원문과 변경 이력만 보여주는 내부 개발 화면입니다.
            실근로자 기록, 실제 관리자 권한, 서버 수신 및 업무 승인이 연결되지 않았습니다.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['원문', '5문항'],
              ['변경된 문항', '2문항'],
              ['보완 이력', '원본 보존'],
              ['업무 상태', '승인 전'],
            ].map(([title,value]) => (
              <div key={title} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                <p className="text-xs text-slate-300">{title}</p>
                <p className="mt-2 font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </header>
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="note">
          <strong className="block">개발용 가상 데이터 · 운영 기록 아님</strong>
          실제 접수·관리자 확인·위험 제거·작업 중지 해제·작업 재개 권한을 제공하지 않습니다.
        </div>
        <div className="my-5 flex flex-wrap items-center gap-3" role="group" aria-label="검수 시나리오">
          <button type="button" onClick={() => setMode('valid')} aria-pressed={mode === 'valid'}
            className={`min-h-12 rounded-xl border px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${mode === 'valid'
              ? 'border-teal-800 bg-teal-800 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>
            정상 보완 대조
          </button>
          <button type="button" onClick={() => setMode('mismatch')} aria-pressed={mode === 'mismatch'}
            className={`min-h-12 rounded-xl border px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${mode === 'mismatch'
              ? 'border-teal-800 bg-teal-800 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>
            다른 현장 연결 차단 시험
          </button>
        </div>
        <PsiRevisionEvidencePanelL06 chain={selected} />
        <footer className="mt-6 text-sm leading-6 text-slate-600">
          정식 L06 기능은 별도 테스트 Supabase에서 인증/RLS/GRANT 교차 검증을 통과한 뒤에만 관리자 메뉴와 연결합니다.
          이 내부 개발 화면은 본 프로그램의 공개 기능이나 현장 평가기록이 아닙니다.
        </footer>
      </div>
    </main>
  );
}
