import React, { useEffect, useMemo, useState } from 'react';
import { nexusFeatureFlags } from '../../config/nexusFeatureFlags';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../../types';
import {
  KineticCounter,
  KineticSparkline,
  SignalBeacon,
} from './KineticTelemetryPrimitives';
import {
  getAllowedDecisionPersonas,
  NEXUS_DECISION_PERSONA_META,
  type NexusDecisionPersona,
} from '../../utils/nexusDecisionBrief';
import {
  NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT,
  readEquipmentPhotoSubmissions,
} from '../../utils/nexusEquipmentPhotoReport';
import {
  NEXUS_CEO_TRAINING_UPDATED_EVENT,
  readExecutiveTrainingCampaigns,
} from '../../utils/nexusExecutiveTrainingPipeline';
import {
  NEXUS_HQ_LOOP_UPDATED_EVENT,
  readAiInvestigations,
  readHqVisitPlans,
  scopeNexusWorkspaceData,
} from '../../utils/nexusHqCommandLoop';
import {
  getPendingOfflineQueueCount,
  NEXUS_OFFLINE_QUEUE_UPDATED_EVENT,
} from '../../utils/nexusOfflineQueue';
import {
  NEXUS_PIPELINE_UPDATED_EVENT,
  readNexusPipelineCases,
} from '../../utils/nexusQuickPipeline';
import {
  buildConnectedPageDecisionBrief,
  NEXUS_AUTHORITY_STORAGE_KEY,
  readActiveNexusAuthority,
} from '../../utils/psiPageDecisionBrief';

interface Props {
  currentPage: Page;
  workerRecords?: readonly WorkerRecord[];
  safetyCheckRecords?: readonly SafetyCheckRecord[];
  onNavigateToPage: (page: Page) => void;
  onOpenInspectorDrawer?: () => void;
}

const triggerTapFeedback = () => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  } catch {
    // Ignore unsupported platforms
  }
};

export const ConnectedPageDecisionBanner: React.FC<Props> = ({
  currentPage,
  workerRecords = [],
  safetyCheckRecords = [],
  onNavigateToPage,
  onOpenInspectorDrawer,
}) => {
  const [authority, setAuthority] = useState(() => readActiveNexusAuthority());
  const [persona, setPersona] = useState<NexusDecisionPersona>(() =>
    readActiveNexusAuthority() === 'field' ? 'field_manager' : 'executive',
  );
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [revisionTick, setRevisionTick] = useState(0);

  useEffect(() => {
    const syncState = () => {
      const nextAuthority = readActiveNexusAuthority();
      setAuthority(nextAuthority);
      setPersona(prev => {
        const allowed = getAllowedDecisionPersonas(nextAuthority);
        return allowed.includes(prev) ? prev : allowed[0];
      });
      setRevisionTick(t => t + 1);
    };

    const events = [
      'psi-nexus-authority-updated',
      NEXUS_PIPELINE_UPDATED_EVENT,
      NEXUS_EQUIPMENT_PHOTO_UPDATED_EVENT,
      NEXUS_HQ_LOOP_UPDATED_EVENT,
      NEXUS_CEO_TRAINING_UPDATED_EVENT,
      NEXUS_OFFLINE_QUEUE_UPDATED_EVENT,
      'storage',
    ];
    for (const ev of events) {
      window.addEventListener(ev, syncState);
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, syncState);
      }
    };
  }, []);

  const allowedPersonas = useMemo(
    () => getAllowedDecisionPersonas(authority),
    [authority],
  );

  const vm = useMemo(() => {
    const scoped = scopeNexusWorkspaceData({
      workspaceRole: authority,
      pipelineCases: readNexusPipelineCases(),
      visitPlans: readHqVisitPlans(),
      investigations: readAiInvestigations(),
      trainingCampaigns: readExecutiveTrainingCampaigns(),
      equipmentReports: readEquipmentPhotoSubmissions(),
    });
    return buildConnectedPageDecisionBrief({
      page: currentPage,
      authority,
      persona,
      siteScopeLabel:
        authority === 'hq'
          ? '전사 통합 관제'
          : scoped.activeSiteMeta?.shortLabel || '소속 현장 범위',
      workerRecords,
      safetyCheckRecords,
      pipelineCases: scoped.pipelineCases,
      equipmentReports: scoped.equipmentReports,
      trainingCampaigns: scoped.trainingCampaigns,
      visitPlans: scoped.visitPlans,
      investigations: scoped.investigations,
      offlinePendingCount: getPendingOfflineQueueCount(),
    });
  }, [currentPage, authority, persona, workerRecords, safetyCheckRecords, revisionTick]);

  const visibleHowActions = useMemo(
    () =>
      nexusFeatureFlags.uiEnabled
        ? vm.howActions
        : vm.howActions.filter(action => action.targetPage !== 'safety-nexus'),
    [vm.howActions],
  );

  const handleToggleAuthority = () => {
    const next = authority === 'hq' ? 'field' : 'hq';
    try {
      window.localStorage.setItem(NEXUS_AUTHORITY_STORAGE_KEY, next);
      window.dispatchEvent(new Event('psi-nexus-authority-updated'));
    } catch {
      // Ignore storage errors
    }
    setAuthority(next);
    const allowed = getAllowedDecisionPersonas(next);
    setPersona(allowed[0]);
  };

  return (
    <section
      className={
        'psi-connected-decision-shell' +
        (desktopExpanded ? ' is-desktop-expanded' : ' is-desktop-compact')
      }
      data-page={currentPage}
      data-signal={vm.signalLevel}
      data-persona={vm.persona}
      data-authority={vm.authority}
      aria-label="연계 화면 결론 중심 의사결정 브리핑"
    >
      <span className="psi-kinetic-sweep" aria-hidden="true" />
      <div className="psi-cd-head">
        <div className="psi-cd-head-left">
          <SignalBeacon level={vm.signalLevel} label={vm.signalLabel} />
          <button
            type="button"
            className="psi-cd-authority-pill"
            onClick={handleToggleAuthority}
            title="본사 통합 또는 단일 현장 격리 범위 전환"
          >
            {vm.authority === 'hq' ? '🏛️ 본사 통합 관제 · 전 현장' : `🔒 단일 현장 격리 · ${vm.scopeLabel}`}
          </button>
          {vm.offlinePendingCount > 0 && (
            <span className="psi-cd-offline-badge psi-tabular-num">전송 대기 {vm.offlinePendingCount}건</span>
          )}
        </div>

        <div className="psi-cd-head-right">
          <div className="psi-cd-personas" role="group" aria-label="역할별 결론 관점 선택">
            {allowedPersonas.map(personaKey => (
              <button
                key={personaKey}
                type="button"
                aria-pressed={vm.persona === personaKey}
                onClick={() => setPersona(personaKey)}
              >
                {NEXUS_DECISION_PERSONA_META[personaKey].shortLabel}
              </button>
            ))}
          </div>
          {onOpenInspectorDrawer && (
            <button
              type="button"
              className="psi-cd-inspector-btn"
              onClick={() => {
                triggerTapFeedback();
                onOpenInspectorDrawer();
              }}
              aria-label="현장 점검 결재함 열기"
            >
              <span>현장 점검·결재함</span>
              <b className="psi-tabular-num">{vm.openActionCount}</b>
            </button>
          )}
          {nexusFeatureFlags.uiEnabled && (
            <button
              type="button"
              className="psi-cd-nexus-btn"
              onClick={() => {
                triggerTapFeedback();
                onNavigateToPage('safety-nexus');
              }}
            >
              Ψ 안전지능 네트워크
            </button>
          )}
          <button
            type="button"
            className="psi-cd-expand-btn"
            aria-expanded={desktopExpanded}
            onClick={() => setDesktopExpanded(v => !v)}
          >
            {desktopExpanded ? '간략히 보기 ▲' : '4단 결론 브리핑 펼치기 ▼'}
          </button>
        </div>
      </div>

      {!desktopExpanded && (
        <div className="psi-cd-compact-bar">
          <div className="psi-cd-compact-copy">
            <strong>01 그래서</strong>
            <span>{vm.soWhatHeadline}</span>
          </div>
          <div className="psi-cd-compact-right">
            <div className="psi-cd-compact-metrics" aria-label="핵심 성과 요약">
              {vm.outcomeMetrics.slice(0, 3).map(metric => (
                <div key={metric.id} className="psi-cd-mini-kpi">
                  <small>{metric.label}</small>
                  <b>
                    <KineticCounter
                      value={metric.numericValue}
                      suffix={metric.unitSuffix}
                      fallbackText={metric.value}
                    />
                  </b>
                </div>
              ))}
            </div>
            {visibleHowActions[0] && (
              <button
                type="button"
                className={'psi-cd-compact-cta is-' + visibleHowActions[0].tone}
                onClick={() => {
                  triggerTapFeedback();
                  onNavigateToPage(visibleHowActions[0].targetPage);
                }}
              >
                {visibleHowActions[0].label} →
              </button>
            )}
          </div>
        </div>
      )}

      <div className="psi-cd-grid">
        <article className="psi-cd-card is-sowhat">
          <div className="psi-cd-card-head">
            <span>01 그래서</span>
            <small>{vm.pageLabel}</small>
          </div>
          <h3>{vm.soWhatHeadline}</h3>
          <p>{vm.soWhatSubline}</p>
        </article>

        <article className="psi-cd-card is-why">
          <div className="psi-cd-card-head">
            <span>02 왜</span>
            <small>원인 · 근거</small>
          </div>
          <ul className="psi-cd-why-list">
            {vm.whyReasons.map(reason => (
              <li key={reason.id}>
                <b>{reason.tag}</b>
                <span>{reason.summary}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="psi-cd-card is-how">
          <div className="psi-cd-card-head">
            <span>03 어떻게</span>
            <small>다음 연결 실행</small>
          </div>
          <div className="psi-cd-how-actions">
            {visibleHowActions.map(action => (
              <button
                key={action.id}
                type="button"
                className={'psi-cd-action-btn is-' + action.tone}
                onClick={() => onNavigateToPage(action.targetPage)}
              >
                {action.label} →
              </button>
            ))}
          </div>
        </article>

        <article className="psi-cd-card is-outcome">
          <div className="psi-cd-card-head">
            <span>04 결과</span>
            <small>연계 성과</small>
          </div>
          <div className="psi-cd-outcome-metrics">
            {vm.outcomeMetrics.map(metric => {
              const subNote =
                metric.deltaBadge && metric.deltaBadge !== metric.deltaNote
                  ? `${metric.deltaNote} · ${metric.deltaBadge}`
                  : metric.deltaNote;
              return (
                <div key={metric.id} className="psi-cd-metric">
                  <div className="psi-cd-metric-top">
                    <span>{metric.label}</span>
                    <small className="psi-cd-metric-delta">{subNote}</small>
                  </div>
                  <strong>
                    <KineticCounter
                      value={metric.numericValue}
                      suffix={metric.unitSuffix}
                      fallbackText={metric.value}
                    />
                  </strong>
                  <KineticSparkline
                    points={metric.trendPoints}
                    tone={metric.trendTone}
                    label={metric.label}
                  />
                </div>
              );
            })}
          </div>
          <p className="psi-cd-outcome-proof">{vm.outcomeProofLine}</p>
        </article>
      </div>
    </section>
  );
};
