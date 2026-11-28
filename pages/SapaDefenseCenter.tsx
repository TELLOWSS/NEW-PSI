import React, { useEffect, useMemo, useState } from 'react';
import type { Page, WorkerRecord } from '../types';
import { getKoreanCalendarDay } from '../utils/monthlyFieldFollowup';
import { downloadNexusComplianceZip } from '../utils/nexusComplianceBundle';
import { readEquipmentPhotoSubmissions } from '../utils/nexusEquipmentPhotoReport';
import { readExecutiveTrainingCampaigns } from '../utils/nexusExecutiveTrainingPipeline';
import { readAiInvestigations, readHqVisitPlans, seedMultiSiteOperationalSimulation } from '../utils/nexusHqCommandLoop';
import { readNexusPipelineCases } from '../utils/nexusQuickPipeline';
import {
  SAPA_APPROVAL_PRESETS,
  SAPA_CEO_DIRECTIVE_TEMPLATES,
  SAPA_DEFENSE_CARD_SPECS,
  SAPA_DEFENSE_UPDATED_EVENT,
  SAPA_ERP_STATUS_LABELS,
  SAPA_ROUTINE_CYCLE_LABELS,
  advanceApprovalStepOnCard,
  applyApprovalPresetToCard,
  applyCeoDirectiveAndSealCard,
  hydrateSapaDefenseMatrix,
  readSapaGovernanceMode,
  seedSapaDefensePortfolio,
  updateCardApprovalSteps,
  upsertSapaDefenseCardRecord,
  writeSapaGovernanceMode,
  type SapaApprovalPresetId,
  type SapaApprovalStep,
  type SapaDefenseHydratedCard,
  type SapaErpApprovalStatus,
  type SapaErpCustomField,
  type SapaGovernanceMode,
  type SapaRoutineCycle,
} from '../utils/sapaDefenseLedger';
import {
  openErpAttachmentSummaryPrint,
  openSapaDefenseSummaryPrint,
} from '../utils/sapaDefenseReport';
import './SapaDefenseCenter.css';

interface SapaDefenseCenterProps {
  workerRecords: WorkerRecord[];
  onNavigateToPage?: (page: Page) => void;
}

type CenterTab = 'ceo_matrix' | 'field_routine' | 'routine_calendar';

const SIGNAL_EMOJI: Record<SapaDefenseHydratedCard['signal'], string> = {
  green: '🟢',
  purple: '🟣',
  yellow: '🟡',
  red: '🔴',
};

const STEP_STATUS_LABELS: Record<SapaApprovalStep['status'], string> = {
  pending: '결재 대기',
  approved: '승인 완료',
  revision_requested: '보완 요청',
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('첨부 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });

export const SapaDefenseCenter: React.FC<SapaDefenseCenterProps> = ({
  workerRecords,
  onNavigateToPage,
}) => {
  const [activeTab, setActiveTab] = useState<CenterTab>('ceo_matrix');
  const [mode, setMode] = useState<SapaGovernanceMode>(() => readSapaGovernanceMode());
  const [siteFilterId, setSiteFilterId] = useState<string>('');
  const [cycleFilter, setCycleFilter] = useState<SapaRoutineCycle | 'all'>('all');
  const [revisionNonce, setRevisionNonce] = useState(0);
  const [selectedRecordKey, setSelectedRecordKey] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string>('');
  const [busyAction, setBusyAction] = useState(false);

  // Interactive Draft Fields for currently inspected card
  const [draftErpDocNo, setDraftErpDocNo] = useState('');
  const [draftErpSiteCode, setDraftErpSiteCode] = useState('');
  const [draftErpBudgetCode, setDraftErpBudgetCode] = useState('');
  const [draftErpCostCenter, setDraftErpCostCenter] = useState('');
  const [draftErpVendorCode, setDraftErpVendorCode] = useState('');
  const [draftErpAmount, setDraftErpAmount] = useState('');
  const [draftErpStatus, setDraftErpStatus] = useState<SapaErpApprovalStatus>('not_drafted');
  const [draftErpApprovedAt, setDraftErpApprovedAt] = useState('');
  const [draftCustomFields, setDraftCustomFields] = useState<SapaErpCustomField[]>([]);
  const [draftSummaryMemo, setDraftSummaryMemo] = useState('');
  const [draftActorName, setDraftActorName] = useState('본사 안전보건실장');
  const [draftStepNote, setDraftStepNote] = useState('');
  const [draftNewStepLabel, setDraftNewStepLabel] = useState('');
  const [draftCeoNote, setDraftCeoNote] = useState('');

  useEffect(() => {
    const sync = () => {
      setMode(readSapaGovernanceMode());
      setRevisionNonce(n => n + 1);
    };
    window.addEventListener(SAPA_DEFENSE_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAPA_DEFENSE_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const matrix = useMemo(() => {
    void revisionNonce;
    return hydrateSapaDefenseMatrix({
      workerRecords,
      asOfDate: getKoreanCalendarDay(),
    });
  }, [workerRecords, revisionNonce]);

  const filteredCards = useMemo(() => {
    return matrix.cards.filter(card => {
      if (siteFilterId && card.siteId !== siteFilterId) return false;
      if (cycleFilter !== 'all' && card.spec.cycle !== cycleFilter) return false;
      return true;
    });
  }, [matrix.cards, siteFilterId, cycleFilter]);

  const selectedCard = useMemo(() => {
    return (
      matrix.cards.find(c => c.recordKey === selectedRecordKey) ??
      filteredCards[0] ??
      matrix.cards[0] ??
      null
    );
  }, [matrix.cards, filteredCards, selectedRecordKey]);

  useEffect(() => {
    if (!selectedCard) return;
    setDraftErpDocNo(selectedCard.erpBridge.erpDocNo || '');
    setDraftErpSiteCode(selectedCard.erpBridge.erpSiteCode || selectedCard.siteId);
    setDraftErpBudgetCode(selectedCard.erpBridge.erpBudgetCode || 'SAFE-MGT-01');
    setDraftErpCostCenter(selectedCard.erpBridge.erpCostCenter || '');
    setDraftErpVendorCode(selectedCard.erpBridge.erpVendorCode || '');
    setDraftErpAmount(
      typeof selectedCard.erpBridge.erpAmountKrw === 'number'
        ? String(selectedCard.erpBridge.erpAmountKrw)
        : '',
    );
    setDraftErpStatus(selectedCard.erpBridge.erpApprovalStatus);
    setDraftErpApprovedAt(selectedCard.erpBridge.erpApprovedAt || '');
    setDraftCustomFields(selectedCard.erpBridge.erpCustomFields.map(f => ({ ...f })));
    setDraftSummaryMemo(selectedCard.summaryMemo || '');
    setDraftCeoNote(selectedCard.ceoDirectiveNote || '');
    setDraftStepNote('');
  }, [selectedCard?.recordKey, selectedCard?.updatedAt]);

  const pendingExecutiveCards = useMemo(() => {
    return matrix.cards.filter(
      c =>
        (!siteFilterId || c.siteId === siteFilterId) &&
        (c.isPendingExecutive || c.signal === 'red' || c.signal === 'yellow'),
    );
  }, [matrix.cards, siteFilterId]);

  const calendarQueue = useMemo(() => {
    return [...filteredCards].sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [filteredCards]);

  const handleToggleMode = (nextMode: SapaGovernanceMode) => {
    writeSapaGovernanceMode(nextMode);
    setMode(nextMode);
    setStatusNotice(
      nextMode === 'erp_bridge'
        ? 'Stage 1 (ERP 연계·공존 모드)로 전환했습니다. ERP 기안 첨부 요약지 출력 및 ERP 문서번호 역연결이 활성화됩니다.'
        : 'Stage 2 (PSI 단독 안전결재 대체 모드)로 전환했습니다. 전 현장 안전 결재를 PSI 내부 동적 결재라인으로 직접 봉인합니다.',
    );
  };

  const handleSeedDemo = async () => {
    setBusyAction(true);
    try {
      seedMultiSiteOperationalSimulation();
      await seedSapaDefensePortfolio(matrix.asOfDate);
      setRevisionNonce(n => n + 1);
      setStatusNotice('3개 골조 현장(지하RC · 103동 갱폼 · 전이층 동바리) 실무 시나리오 및 9대 방어 카드 데이터를 생성했습니다.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveCardFields = (overrides?: Partial<SapaDefenseHydratedCard['erpBridge']>) => {
    if (!selectedCard) return;
    const parsedAmount = Number(draftErpAmount.replace(/,/g, '').trim());
    upsertSapaDefenseCardRecord({
      ...selectedCard,
      summaryMemo: draftSummaryMemo.trim(),
      erpBridge: {
        ...selectedCard.erpBridge,
        erpDocNo: draftErpDocNo.trim(),
        erpSiteCode: draftErpSiteCode.trim() || selectedCard.siteId,
        erpBudgetCode: draftErpBudgetCode.trim(),
        erpCostCenter: draftErpCostCenter.trim(),
        erpVendorCode: draftErpVendorCode.trim(),
        erpAmountKrw: Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : undefined,
        erpApprovalStatus: draftErpStatus,
        erpApprovedAt: draftErpApprovedAt.trim(),
        erpCustomFields: draftCustomFields.filter(f => f.label.trim() || f.key.trim() || f.value.trim()),
        ...overrides,
      },
    });
    setRevisionNonce(n => n + 1);
    setStatusNotice(`[${selectedCard.siteName} · ${selectedCard.spec.shortTitle}] 현장 메모 및 ERP 특정항목 연계를 저장했습니다.`);
  };

  const handleAttachErpFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCard) return;
    setBusyAction(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      handleSaveCardFields({
        erpAttachmentName: file.name,
        erpAttachmentDataUrl: dataUrl,
      });
      setStatusNotice(`ERP 증빙 파일(${file.name})을 ${selectedCard.spec.folderName}에 편철했습니다.`);
    } finally {
      setBusyAction(false);
      event.target.value = '';
    }
  };

  const handleSelectPreset = (presetId: SapaApprovalPresetId) => {
    if (!selectedCard) return;
    applyApprovalPresetToCard(selectedCard, presetId);
    setRevisionNonce(n => n + 1);
    setStatusNotice(`[${SAPA_APPROVAL_PRESETS[presetId].label}]으로 결재라인을 재구성했습니다.`);
  };

  const handleAddCustomStep = () => {
    if (!selectedCard || !draftNewStepLabel.trim()) return;
    const nextSteps: SapaApprovalStep[] = [
      ...selectedCard.approvalSteps,
      {
        stepOrder: selectedCard.approvalSteps.length + 1,
        roleCode: 'custom',
        roleLabel: draftNewStepLabel.trim(),
        status: 'pending',
        actorName: '',
        actedAt: '',
        note: '',
      },
    ];
    updateCardApprovalSteps(selectedCard, nextSteps);
    setDraftNewStepLabel('');
    setRevisionNonce(n => n + 1);
    setStatusNotice(`결재 단계 [${draftNewStepLabel.trim()}]를 결재라인에 추가했습니다.`);
  };

  const handleRemoveStep = (stepOrder: number) => {
    if (!selectedCard || selectedCard.approvalSteps.length <= 1) return;
    const nextSteps = selectedCard.approvalSteps.filter(s => s.stepOrder !== stepOrder);
    updateCardApprovalSteps(selectedCard, nextSteps);
    setRevisionNonce(n => n + 1);
  };

  const handleAdvanceStep = async (
    card: SapaDefenseHydratedCard,
    stepOrder: number,
    decision: 'approved' | 'revision_requested',
  ) => {
    setBusyAction(true);
    try {
      const updated = await advanceApprovalStepOnCard(card, {
        stepOrder,
        decision,
        actorName: draftActorName,
        note: draftStepNote,
      });
      setRevisionNonce(n => n + 1);
      setStatusNotice(
        updated.sealHash
          ? `${card.siteName} ${card.spec.shortTitle} 최종 결재 완료 및 SHA-256 무결성 봉인(${updated.sealHash.slice(0, 12)}…)이 생성되었습니다.`
          : `${stepOrder}차 결재 단계를 ${decision === 'approved' ? '승인' : '보완 요청'} 처리했습니다.`,
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleCeoDirective = async (
    card: SapaDefenseHydratedCard,
    directiveType: 'confirmed' | 'budget_support' | 'revision_ordered',
    customNote?: string,
  ) => {
    setBusyAction(true);
    try {
      const template = SAPA_CEO_DIRECTIVE_TEMPLATES.find(t => t.type === directiveType);
      const note = (customNote ?? draftCeoNote).trim() || template?.text || '';
      const updated = await applyCeoDirectiveAndSealCard(card, {
        directiveType,
        directiveNote: note,
        actorName: '대표이사(경영책임자)',
      });
      setRevisionNonce(n => n + 1);
      setStatusNotice(
        directiveType === 'revision_ordered'
          ? `[${card.siteName} · ${card.spec.shortTitle}] 보완 재보고 지시를 현장으로 하달했습니다.`
          : `[${card.siteName} · ${card.spec.shortTitle}] 대표이사 확인 결재 및 방어 카드 봉인 완료 (${updated.sealHash.slice(0, 12)}…)`,
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDownloadDefenseZip = async () => {
    setBusyAction(true);
    try {
      const scopeLabel = siteFilterId
        ? matrix.sites.find(s => s.siteId === siteFilterId)?.siteName || siteFilterId
        : `전사 ${matrix.sites.length}개 골조 현장`;
      const res = await downloadNexusComplianceZip({
        asOfDate: matrix.asOfDate,
        siteScopeLabel: scopeLabel,
        periodLabel: `${matrix.periodKey} 중대재해처벌법 방어 카드 편철팩`,
        pipelineCases: readNexusPipelineCases(),
        equipmentReports: readEquipmentPhotoSubmissions(),
        trainingCampaigns: readExecutiveTrainingCampaigns(),
        visitPlans: readHqVisitPlans(),
        investigations: readAiInvestigations(),
        defenseCards: filteredCards,
        governanceMode: mode,
      });
      setStatusNotice(
        `중처법 조항별 방어팩 ZIP(${res.fileName}, 총 ${res.fileCount}파일, SHA-256 매니페스트 포함)을 저장했습니다.`,
      );
    } finally {
      setBusyAction(false);
    }
  };

  const openCellInRoutineTab = (recordKey: string) => {
    setSelectedRecordKey(recordKey);
    setActiveTab('field_routine');
  };

  const handlePrintDefensePdf = () => {
    const scopeLabel = siteFilterId
      ? matrix.sites.find(s => s.siteId === siteFilterId)?.siteName || siteFilterId
      : `전사 ${matrix.sites.length}개 골조 현장`;
    openSapaDefenseSummaryPrint({
      siteScopeLabel: scopeLabel,
      asOfDate: matrix.asOfDate,
      mode,
      summary: matrix.summary,
      cards: filteredCards,
    });
  };

  return (
    <div className="sapa-defense-center">
      {/* Top Executive Header */}
      <header className="sapa-hero-header">
        <div className="sapa-hero-title">
          <span className="sapa-kicker">SAPA DEFENSE SHIELD · 시행령 제4조 9대 의무</span>
          <h1>중대재해처벌법 현장별 방어 카드 · 결재 센터</h1>
          <p>
            현장별 주기 루틴(월간·반기·착공)과 PSI 원천 기록·ERP 품의를 하나로 봉인해, 사고 시 대표이사의 안전보건 확보의무 이행을 즉시 입증합니다.
          </p>
        </div>

        <div className="sapa-hero-actions">
          <div className="sapa-mode-switch" role="group" aria-label="ERP 공존 및 PSI 단독 결재 전환">
            <button
              type="button"
              className={mode === 'erp_bridge' ? 'is-active' : ''}
              aria-pressed={mode === 'erp_bridge'}
              onClick={() => handleToggleMode('erp_bridge')}
            >
              Stage 1 · ERP 공존 연계
            </button>
            <button
              type="button"
              className={mode === 'psi_native' ? 'is-active' : ''}
              aria-pressed={mode === 'psi_native'}
              onClick={() => handleToggleMode('psi_native')}
            >
              Stage 2 · PSI 단독 안전결재
            </button>
          </div>

          <div className="sapa-primary-btns">
            <button type="button" className="sapa-btn-secondary" disabled={busyAction} onClick={() => void handleSeedDemo()}>
              🏗️ 3대 골조현장 예시 채우기
            </button>
            <button type="button" className="sapa-btn-secondary" onClick={handlePrintDefensePdf}>
              🖨️ 법정 방어 요약서 (PDF)
            </button>
            <button type="button" className="sapa-btn-primary" disabled={busyAction} onClick={() => void handleDownloadDefenseZip()}>
              📦 조항별 방어팩 ZIP 편철
            </button>
            {onNavigateToPage && (
              <button type="button" className="sapa-btn-ghost" onClick={() => onNavigateToPage('safety-nexus')}>
                Ψ 3D 안전지능 복귀 ↗
              </button>
            )}
          </div>
        </div>
      </header>

      {statusNotice && (
        <div className="sapa-notice-banner" role="status" aria-live="polite">
          <span>{statusNotice}</span>
          <button type="button" onClick={() => setStatusNotice('')} aria-label="알림 닫기">✕</button>
        </div>
      )}

      {/* Navigation Tabs + Site Filter Bar */}
      <div className="sapa-toolbar">
        <div className="sapa-tabs" role="tablist" aria-label="방어 카드 업무 화면 전환">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ceo_matrix'}
            className={activeTab === 'ceo_matrix' ? 'is-active' : ''}
            onClick={() => setActiveTab('ceo_matrix')}
          >
            🏛️ 경영진 방어 매트릭스 · 1분 결재
            {matrix.summary.pendingCeoCount > 0 && <em className="sapa-tab-count">{matrix.summary.pendingCeoCount}</em>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'field_routine'}
            className={activeTab === 'field_routine' ? 'is-active' : ''}
            onClick={() => setActiveTab('field_routine')}
          >
            📋 현장 루틴 마감 · ERP 연계 · 결재라인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'routine_calendar'}
            className={activeTab === 'routine_calendar' ? 'is-active' : ''}
            onClick={() => setActiveTab('routine_calendar')}
          >
            ⏱️ 법정 마감 D-Day 경보함
            {matrix.summary.redCount + matrix.summary.yellowCount > 0 && (
              <em className="sapa-tab-count is-warn">{matrix.summary.redCount + matrix.summary.yellowCount}</em>
            )}
          </button>
        </div>

        <div className="sapa-site-filters" role="group" aria-label="현장 범위 필터">
          <button
            type="button"
            aria-pressed={!siteFilterId}
            className={!siteFilterId ? 'is-active' : ''}
            onClick={() => setSiteFilterId('')}
          >
            전사 ({matrix.sites.length}개 현장)
          </button>
          {matrix.sites.map(site => (
            <button
              key={site.siteId}
              type="button"
              aria-pressed={siteFilterId === site.siteId}
              className={siteFilterId === site.siteId ? 'is-active' : ''}
              onClick={() => setSiteFilterId(siteFilterId === site.siteId ? '' : site.siteId)}
            >
              {site.shortLabel.split(' · ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Executive Scorecard KPIs */}
      <section className="sapa-kpi-grid" aria-label="중대재해처벌법 방어 준비 핵심 지표">
        <article className="sapa-kpi-card is-accent">
          <small>전사 중처법 방어 준비율</small>
          <strong>{matrix.summary.defenseReadinessPct}%</strong>
          <span>완료·봉인 {matrix.summary.greenCount} / 전체 {matrix.summary.totalCells}카드</span>
        </article>
        <article className={'sapa-kpi-card' + (matrix.summary.criticalGapCount > 0 ? ' is-danger' : '')}>
          <small>핵심 조항 미이행 · 마감임박</small>
          <strong>{matrix.summary.redCount + matrix.summary.yellowCount}건</strong>
          <span>핵심(3·5·7·9호) 취약 {matrix.summary.criticalGapCount}건 즉시 보완 필요</span>
        </article>
        <article className={'sapa-kpi-card' + (matrix.summary.pendingCeoCount > 0 ? ' is-purple' : '')}>
          <small>대표이사 · CSO 결재·지시 대기</small>
          <strong>{matrix.summary.pendingCeoCount}건</strong>
          <span>확인·예산지원 시 타임스탬프 + SHA-256 봉인</span>
        </article>
        <article className="sapa-kpi-card">
          <small>{mode === 'erp_bridge' ? '기존 ERP 품의·문서 연계' : 'PSI 단독 전자결재 봉인'}</small>
          <strong>
            {mode === 'erp_bridge'
              ? `${matrix.summary.erpConnectedCount} / ${matrix.summary.totalCells}`
              : `${matrix.summary.psiSealedCount} / ${matrix.summary.totalCells}`}
          </strong>
          <span>
            {mode === 'erp_bridge'
              ? `봉인 완료 ${matrix.summary.psiSealedCount}건 (ERP 대체 전환 준비됨)`
              : 'ERP 없이 PSI 4단계 결재라인으로 완결'}
          </span>
        </article>
      </section>

      {/* TAB 1: CEO MATRIX & 1-MINUTE DIRECTIVE */}
      {activeTab === 'ceo_matrix' && (
        <div className="sapa-ceo-layout">
          <section className="sapa-matrix-panel" aria-label="전 현장 9대 중대재해 방어 카드 신호등 매트릭스">
            <div className="sapa-panel-head">
              <div>
                <h2>전 현장 × 시행령 제4조 9대 방어 카드 신호등</h2>
                <p>각 셀을 클릭하면 현장 증빙, ERP 특정항목 연계 상태, 동적 결재라인을 즉시 확인·결재합니다.</p>
              </div>
              <div className="sapa-legend">
                <span>🟢 방어봉인</span>
                <span>🟣 결재대기</span>
                <span>🟡 마감임박</span>
                <span>🔴 미이행·보완</span>
              </div>
            </div>

            <div className="sapa-table-scroll">
              <table className="sapa-matrix-table">
                <thead>
                  <tr>
                    <th>골조 현장</th>
                    {SAPA_DEFENSE_CARD_SPECS.map(spec => (
                      <th key={spec.cardId} title={`${spec.legalBasis} · ${spec.cycleLabel}`}>
                        <span className="th-code">{spec.code}</span>
                        <span className="th-title">{spec.shortTitle}</span>
                        {spec.isCritical && <em className="th-star">핵심</em>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.sites
                    .filter(site => !siteFilterId || site.siteId === siteFilterId)
                    .map(site => (
                      <tr key={site.siteId}>
                        <th className="sapa-site-cell">
                          <strong>{site.shortLabel.split(' · ')[0]}</strong>
                          <small>{site.siteName}</small>
                        </th>
                        {SAPA_DEFENSE_CARD_SPECS.map(spec => {
                          const cell = matrix.cards.find(
                            c => c.siteId === site.siteId && c.cardId === spec.cardId,
                          );
                          if (!cell) return <td key={spec.cardId}>-</td>;
                          const isSelected = selectedCard?.recordKey === cell.recordKey;
                          return (
                            <td key={spec.cardId}>
                              <button
                                type="button"
                                className={`sapa-signal-cell tone-${cell.signal}` + (isSelected ? ' is-selected' : '')}
                                onClick={() => openCellInRoutineTab(cell.recordKey)}
                                title={`${site.siteName} - ${spec.title}: ${cell.signalLabel}`}
                              >
                                <span>{SIGNAL_EMOJI[cell.signal]}</span>
                                <small>{cell.signal === 'green' ? '봉인' : cell.signal === 'purple' ? '대기' : cell.dDayLabel}</small>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sapa-ceo-inbox" aria-label="대표이사 1분 방어 결재 및 지시함">
            <div className="sapa-panel-head">
              <div>
                <h2>🏛️ 경영책임자(대표이사·CSO) 1분 확인 · 지시함</h2>
                <p>검찰·법원 판례상 핵심 방어 요소인 ‘보고 수령 → 예산 지원·보완 지시’ 이력을 원클릭으로 남깁니다.</p>
              </div>
            </div>

            {pendingExecutiveCards.length === 0 ? (
              <div className="sapa-empty-box">
                모든 현장 방어 카드가 이행·봉인 완료 상태입니다. 상단의 ‘조항별 방어팩 ZIP 편철’로 법정 제출팩을 보관하세요.
              </div>
            ) : (
              <div className="sapa-inbox-list">
                {pendingExecutiveCards.map(card => (
                  <article key={card.recordKey} className={`sapa-inbox-card tone-${card.signal}`}>
                    <div className="sapa-inbox-top">
                      <div>
                        <span className="sapa-pill">{card.siteName}</span>
                        <span className="sapa-pill is-law">{card.spec.legalBasis}</span>
                        <span className={`sapa-pill is-sig-${card.signal}`}>
                          {SIGNAL_EMOJI[card.signal]} {card.signalLabel} · {card.dDayLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="sapa-link-btn"
                        onClick={() => openCellInRoutineTab(card.recordKey)}
                      >
                        상세·ERP 열기 →
                      </button>
                    </div>
                    <h3>{card.spec.code}. {card.spec.title}</h3>
                    <p className="sapa-inbox-summary">
                      {card.summaryMemo || `필수 첨부: ${card.spec.requiredArtifacts[0]} (${card.spec.inputOwnerLabel} 등록 대기)`}
                    </p>
                    <div className="sapa-inbox-meta">
                      <span>ERP 문서: <b>{card.erpBridge.erpDocNo || '미기안'}</b></span>
                      <span>결재라인: <b>{SAPA_APPROVAL_PRESETS[card.presetId].label}</b></span>
                      <span>PSI 연계: OCR {card.autoEvidence.ocrRiskRecordCount} · 사진 {card.autoEvidence.equipmentPhotoCount} · 교육서명 {card.autoEvidence.trainingSignatureCount}</span>
                    </div>
                    <div className="sapa-ceo-actions">
                      <button
                        type="button"
                        className="is-confirm"
                        disabled={busyAction}
                        onClick={() => void handleCeoDirective(card, 'confirmed', SAPA_CEO_DIRECTIVE_TEMPLATES[0].text)}
                      >
                        ✅ 보고 확인 · 봉인
                      </button>
                      <button
                        type="button"
                        className="is-budget"
                        disabled={busyAction}
                        onClick={() => void handleCeoDirective(card, 'budget_support', SAPA_CEO_DIRECTIVE_TEMPLATES[1].text)}
                      >
                        💰 예산·인력 지원 승인
                      </button>
                      <button
                        type="button"
                        className="is-revise"
                        disabled={busyAction}
                        onClick={() => void handleCeoDirective(card, 'revision_ordered', SAPA_CEO_DIRECTIVE_TEMPLATES[2].text)}
                      >
                        ⚠️ 보완 재보고 지시
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: FIELD ROUTINE + ERP SPECIFIC FIELDS + DYNAMIC APPROVAL LINE */}
      {activeTab === 'field_routine' && (
        <div className="sapa-routine-layout">
          <aside className="sapa-card-rail" aria-label="현장별 9대 방어 카드 선택 목록">
            <div className="sapa-cycle-filter" role="group" aria-label="루틴 주기 필터">
              <button type="button" className={cycleFilter === 'all' ? 'is-active' : ''} onClick={() => setCycleFilter('all')}>전체</button>
              <button type="button" className={cycleFilter === 'monthly_5min' ? 'is-active' : ''} onClick={() => setCycleFilter('monthly_5min')}>월간 5분</button>
              <button type="button" className={cycleFilter === 'semiannual_mandatory' ? 'is-active' : ''} onClick={() => setCycleFilter('semiannual_mandatory')}>반기 필수</button>
              <button type="button" className={cycleFilter === 'annual_or_mobilization' ? 'is-active' : ''} onClick={() => setCycleFilter('annual_or_mobilization')}>착공·연간</button>
            </div>
            <div className="sapa-card-rail-list">
              {filteredCards.map(card => (
                <button
                  key={card.recordKey}
                  type="button"
                  className={`sapa-rail-item tone-${card.signal}` + (selectedCard?.recordKey === card.recordKey ? ' is-selected' : '')}
                  onClick={() => setSelectedRecordKey(card.recordKey)}
                >
                  <div className="sapa-rail-top">
                    <b>{card.spec.code}. {card.spec.shortTitle}</b>
                    <span>{SIGNAL_EMOJI[card.signal]} {card.signalLabel}</span>
                  </div>
                  <small>{card.siteName} · {card.spec.cycleLabel}</small>
                </button>
              ))}
            </div>
          </aside>

          {selectedCard && (
            <section className="sapa-card-editor" aria-label="선택 방어 카드 상세 및 ERP · 결재 설정">
              <div className="sapa-editor-head">
                <div>
                  <span className="sapa-pill is-law">{selectedCard.spec.legalBasis}</span>
                  <span className="sapa-pill">{selectedCard.siteName}</span>
                  <span className={`sapa-pill is-sig-${selectedCard.signal}`}>
                    {SIGNAL_EMOJI[selectedCard.signal]} {selectedCard.signalLabel} · {selectedCard.dDayLabel}
                  </span>
                  <h2>{selectedCard.spec.code}. {selectedCard.spec.title}</h2>
                  <p>{selectedCard.spec.defenseObjective}</p>
                </div>
                <div className="sapa-editor-head-actions">
                  <button
                    type="button"
                    className="sapa-btn-secondary"
                    onClick={() => openErpAttachmentSummaryPrint(selectedCard, matrix.asOfDate)}
                  >
                    🖨️ ERP 기안 첨부용 요약지
                  </button>
                </div>
              </div>

              {/* PSI Live Auto-Evidence Box */}
              <div className="sapa-subpanel">
                <h3>1. PSI 현장 원천 데이터 자동 집계 ({selectedCard.spec.inputOwnerLabel})</h3>
                <div className="sapa-auto-grid">
                  <div><small>자필 위험성평가 OCR</small><strong>{selectedCard.autoEvidence.ocrRiskRecordCount}건</strong></div>
                  <div><small>시정조치(작업중지)</small><strong>{selectedCard.autoEvidence.pipelineCaseCount}건 ({selectedCard.autoEvidence.stopWorkCount})</strong></div>
                  <div><small>건설기계 점검사진</small><strong>{selectedCard.autoEvidence.equipmentPhotoCount}건</strong></div>
                  <div><small>12개국어 교육서명</small><strong>{selectedCard.autoEvidence.trainingSignatureCount}건</strong></div>
                  <div><small>본사 순회 / 사고조사</small><strong>{selectedCard.autoEvidence.hqVisitCount} / {selectedCard.autoEvidence.investigationCount}건</strong></div>
                </div>
                <label className="sapa-field-block">
                  <span>현장 실무 이행 요약 · 점검 메모 (월간 5분 마감 기록)</span>
                  <textarea
                    rows={2}
                    value={draftSummaryMemo}
                    onChange={e => setDraftSummaryMemo(e.target.value)}
                    placeholder="예: 15층 갱폼 고정볼트 전수점검 및 미이행 협력팀 1곳 보완완료 사진 첨부"
                  />
                </label>
              </div>

              {/* Dynamic Approval Line by Document Nature */}
              <div className="sapa-subpanel">
                <div className="sapa-subpanel-head">
                  <h3>2. 문서 성격별 동적 결재라인 구성 ({mode === 'psi_native' ? 'PSI 단독 결재 활성' : 'ERP 결재선 매핑'})</h3>
                  <select
                    aria-label="결재라인 프리셋 선택"
                    value={selectedCard.presetId}
                    onChange={e => handleSelectPreset(e.target.value as SapaApprovalPresetId)}
                  >
                    {Object.values(SAPA_APPROVAL_PRESETS).map(preset => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                  </select>
                </div>
                <p className="sapa-helper-text">{SAPA_APPROVAL_PRESETS[selectedCard.presetId].description}</p>

                <div className="sapa-steps-strip">
                  {selectedCard.approvalSteps.map(step => (
                    <div key={step.stepOrder} className={`sapa-step-card status-${step.status}`}>
                      <div className="sapa-step-top">
                        <b>{step.stepOrder}차 · {step.roleLabel}</b>
                        {selectedCard.approvalSteps.length > 1 && step.status === 'pending' && (
                          <button type="button" onClick={() => handleRemoveStep(step.stepOrder)} aria-label={`${step.roleLabel} 단계 삭제`}>✕</button>
                        )}
                      </div>
                      <span className="sapa-step-status">{STEP_STATUS_LABELS[step.status]}</span>
                      <small>{step.actorName ? `${step.actorName} (${step.actedAt.slice(0, 10)})` : '서명 전'}</small>
                      {step.note && <p className="sapa-step-note">{step.note}</p>}
                      {step.status !== 'approved' && (
                        <div className="sapa-step-btns">
                          <button type="button" disabled={busyAction} onClick={() => void handleAdvanceStep(selectedCard, step.stepOrder, 'approved')}>승인</button>
                          <button type="button" disabled={busyAction} onClick={() => void handleAdvanceStep(selectedCard, step.stepOrder, 'revision_requested')}>보완</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="sapa-step-controls">
                  <input
                    type="text"
                    value={draftActorName}
                    onChange={e => setDraftActorName(e.target.value)}
                    placeholder="결재자 직책·성명"
                    aria-label="결재자 이름"
                  />
                  <input
                    type="text"
                    value={draftStepNote}
                    onChange={e => setDraftStepNote(e.target.value)}
                    placeholder="검토·지시 의견 (선택)"
                    aria-label="검토 의견"
                  />
                  <div className="sapa-add-step-group">
                    <input
                      type="text"
                      value={draftNewStepLabel}
                      onChange={e => setDraftNewStepLabel(e.target.value)}
                      placeholder="추가 결재 직책 (예: 본사 공무팀장)"
                      aria-label="추가할 결재 직책"
                    />
                    <button type="button" onClick={handleAddCustomStep}>+ 결재 단계 추가</button>
                  </div>
                </div>
              </div>

              {/* Structured + Custom ERP Fields Bridge */}
              <div className="sapa-subpanel">
                <div className="sapa-subpanel-head">
                  <h3>3. 회사 기존 ERP 특정항목 연계 매핑 ({SAPA_ERP_STATUS_LABELS[draftErpStatus]})</h3>
                  <label className="sapa-upload-btn">
                    📎 ERP 결재완료본 / 증빙 첨부
                    <input type="file" accept=".pdf,image/*" onChange={e => void handleAttachErpFile(e)} />
                  </label>
                </div>

                <div className="sapa-erp-grid">
                  <label>
                    <span>ERP 품의(문서)번호</span>
                    <input type="text" value={draftErpDocNo} onChange={e => setDraftErpDocNo(e.target.value)} placeholder="예: ERP-202611-03" />
                  </label>
                  <label>
                    <span>ERP 현장코드</span>
                    <input type="text" value={draftErpSiteCode} onChange={e => setDraftErpSiteCode(e.target.value)} />
                  </label>
                  <label>
                    <span>안전관리비 · 예산코드</span>
                    <input type="text" value={draftErpBudgetCode} onChange={e => setDraftErpBudgetCode(e.target.value)} />
                  </label>
                  <label>
                    <span>원가센터 / 코스트센터</span>
                    <input type="text" value={draftErpCostCenter} onChange={e => setDraftErpCostCenter(e.target.value)} />
                  </label>
                  <label>
                    <span>수급인 · 협력사 코드</span>
                    <input type="text" value={draftErpVendorCode} onChange={e => setDraftErpVendorCode(e.target.value)} placeholder="예: VND-TOWER-02" />
                  </label>
                  <label>
                    <span>집행·요청 금액 (원)</span>
                    <input type="text" value={draftErpAmount} onChange={e => setDraftErpAmount(e.target.value)} placeholder="예: 16200000" />
                  </label>
                  <label>
                    <span>ERP 결재 진행상태</span>
                    <select value={draftErpStatus} onChange={e => setDraftErpStatus(e.target.value as SapaErpApprovalStatus)}>
                      {Object.entries(SAPA_ERP_STATUS_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>ERP 최종 승인일</span>
                    <input type="date" value={draftErpApprovedAt} onChange={e => setDraftErpApprovedAt(e.target.value)} />
                  </label>
                </div>

                {/* Company-specific Arbitrary ERP Custom Fields */}
                <div className="sapa-custom-erp">
                  <div className="sapa-custom-erp-head">
                    <strong>사내 ERP 추가 특정항목 (자유 확장)</strong>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftCustomFields(prev => [
                          ...prev,
                          { key: `ERP_FIELD_${prev.length + 1}`, label: '', value: '' },
                        ])
                      }
                    >
                      + ERP 특정항목 추가
                    </button>
                  </div>
                  {draftCustomFields.map((cf, idx) => (
                    <div key={`${cf.key}-${idx}`} className="sapa-custom-erp-row">
                      <input
                        type="text"
                        placeholder="항목 코드 (예: WBS_CD)"
                        value={cf.key}
                        onChange={e =>
                          setDraftCustomFields(prev =>
                            prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row)),
                          )
                        }
                      />
                      <input
                        type="text"
                        placeholder="항목명 (예: ERP 공종 WBS)"
                        value={cf.label}
                        onChange={e =>
                          setDraftCustomFields(prev =>
                            prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)),
                          )
                        }
                      />
                      <input
                        type="text"
                        placeholder="입력값 (예: RC-B2-WALL)"
                        value={cf.value}
                        onChange={e =>
                          setDraftCustomFields(prev =>
                            prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)),
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setDraftCustomFields(prev => prev.filter((_, i) => i !== idx))}
                        aria-label="항목 삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {selectedCard.erpBridge.erpAttachmentName && (
                    <p className="sapa-attached-badge">📎 첨부된 ERP 승인본: <b>{selectedCard.erpBridge.erpAttachmentName}</b></p>
                  )}
                </div>

                <div className="sapa-save-bar">
                  <div className="sapa-seal-info">
                    {selectedCard.sealHash ? (
                      <span>🔒 SHA-256 봉인됨: <code>{selectedCard.sealHash.slice(0, 20)}…</code></span>
                    ) : (
                      <span>⏳ 모든 결재 완료 또는 ERP 완결 승인 시 무결성 해시가 자동 봉인됩니다.</span>
                    )}
                  </div>
                  <div className="sapa-save-btns">
                    <button type="button" className="sapa-btn-primary" onClick={() => handleSaveCardFields()}>
                      💾 현장 메모 · ERP 연계 저장
                    </button>
                    <button
                      type="button"
                      className="sapa-btn-seal"
                      disabled={busyAction}
                      onClick={() => void handleCeoDirective(selectedCard, 'confirmed', draftCeoNote || SAPA_CEO_DIRECTIVE_TEMPLATES[0].text)}
                    >
                      ✅ 대표이사 확인 · 즉시 봉인
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 3: ROUTINE CALENDAR & D-DAY OVERDUE ALERTS */}
      {activeTab === 'routine_calendar' && (
        <section className="sapa-calendar-panel" aria-label="전 현장 법정 루틴 마감 기한 및 경보 목록">
          <div className="sapa-panel-head">
            <div>
              <h2>⏱️ 법정 의무 루틴 마감 D-Day · 누락 경보함</h2>
              <p>반기 필수(6월·12월: 관리감독자 평가 · 비상훈련 · 협력팀 점검)와 월간 5분 마감 기한을 놓치지 않도록 우선순위 순으로 정렬합니다.</p>
            </div>
          </div>

          <div className="sapa-table-scroll">
            <table className="sapa-calendar-table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>마감 D-Day</th>
                  <th>현장명</th>
                  <th>방어 카드 (시행령 조항)</th>
                  <th>루틴 주기</th>
                  <th>ERP 연계</th>
                  <th>바로 처리</th>
                </tr>
              </thead>
              <tbody>
                {calendarQueue.map(card => (
                  <tr key={card.recordKey}>
                    <td>
                      <span className={`sapa-pill is-sig-${card.signal}`}>
                        {SIGNAL_EMOJI[card.signal]} {card.signalLabel}
                      </span>
                    </td>
                    <td><b>{card.dDayLabel}</b><br /><small>{card.dueDate}</small></td>
                    <td>{card.siteName}</td>
                    <td><b>{card.spec.code}. {card.spec.shortTitle}</b><br /><small>{card.spec.legalBasis}</small></td>
                    <td>{card.spec.cycleLabel}</td>
                    <td>{card.erpBridge.erpDocNo || '미연결'}</td>
                    <td>
                      <button type="button" className="sapa-link-btn" onClick={() => openCellInRoutineTab(card.recordKey)}>
                        입력·결재 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default SapaDefenseCenter;
