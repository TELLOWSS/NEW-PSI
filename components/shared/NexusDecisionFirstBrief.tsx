import React, { useState } from 'react';
import {
  NEXUS_DECISION_PERSONA_META,
  type NexusDecisionActionTarget,
  type NexusDecisionBriefViewModel,
  type NexusDecisionPersona,
} from '../../utils/nexusDecisionBrief';

interface Props {
  viewModel: NexusDecisionBriefViewModel;
  allowedPersonas: readonly NexusDecisionPersona[];
  onSelectPersona: (persona: NexusDecisionPersona) => void;
  onAction: (target: NexusDecisionActionTarget) => void;
}

export const NexusDecisionFirstBrief: React.FC<Props> = ({
  viewModel,
  allowedPersonas,
  onSelectPersona,
  onAction,
}) => {
  const [desktopExpanded, setDesktopExpanded] = useState(false);

  return (
    <section
      className={
        'nexus-decision-brief' +
        (desktopExpanded ? ' is-desktop-expanded' : ' is-desktop-compact')
      }
      data-signal={viewModel.signalLevel}
      data-persona={viewModel.persona}
      aria-label="결론 중심 안전 의사결정 브리핑"
    >
      <div className="nexus-decision-head">
        <div className="nexus-decision-head-left">
          <em className={'nexus-decision-signal is-' + viewModel.signalLevel}>
            {viewModel.signalLabel}
          </em>
          <span className="nexus-decision-scope">{viewModel.scopeLabel}</span>
          <small className="nexus-decision-cadence">
            {NEXUS_DECISION_PERSONA_META[viewModel.persona].cadenceNote}
          </small>
        </div>

        <div className="nexus-decision-head-right">
          <div className="nexus-decision-personas" role="group" aria-label="의사결정 역할 보기 선택">
            {allowedPersonas.map(personaKey => (
              <button
                key={personaKey}
                type="button"
                aria-pressed={viewModel.persona === personaKey}
                onClick={() => onSelectPersona(personaKey)}
              >
                {NEXUS_DECISION_PERSONA_META[personaKey].shortLabel}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="nexus-decision-expand-btn"
            aria-expanded={desktopExpanded}
            onClick={() => setDesktopExpanded(v => !v)}
          >
            {desktopExpanded ? '간략히 보기 ▲' : '4단 결론 브리핑 펼치기 ▼'}
          </button>
        </div>
      </div>

      {!desktopExpanded && (
        <div className="nexus-decision-compact-bar">
          <div className="nexus-decision-compact-copy">
            <strong>01 그래서</strong>
            <span>{viewModel.soWhatHeadline}</span>
          </div>
          {viewModel.howActions[0] && (
            <button
              type="button"
              className={'nexus-decision-compact-cta is-' + viewModel.howActions[0].tone}
              onClick={() => onAction(viewModel.howActions[0].targetAction)}
            >
              {viewModel.howActions[0].label} →
            </button>
          )}
        </div>
      )}

      <div className="nexus-decision-grid">
        <article className="nexus-db-card is-sowhat">
          <div className="nexus-db-card-head">
            <span>01 그래서</span>
            <small>핵심 결론</small>
          </div>
          <h3>{viewModel.soWhatHeadline}</h3>
          <p>{viewModel.soWhatSubline}</p>
        </article>

        <article className="nexus-db-card is-why">
          <div className="nexus-db-card-head">
            <span>02 왜</span>
            <small>원인 · 근거</small>
          </div>
          <ul className="nexus-db-why-list">
            {viewModel.whyReasons.map(reason => (
              <li key={reason.id}>
                <b>{reason.tag}</b>
                <span>{reason.summary}</span>
              </li>
            ))}
          </ul>
          {viewModel.previewPhotoUrl && (
            <figure className="nexus-db-photo-preview">
              <img src={viewModel.previewPhotoUrl} alt={viewModel.previewPhotoCaption || '현장 점검 사진'} />
              {viewModel.previewPhotoCaption && <figcaption>{viewModel.previewPhotoCaption}</figcaption>}
            </figure>
          )}
        </article>

        <article className="nexus-db-card is-how">
          <div className="nexus-db-card-head">
            <span>03 어떻게</span>
            <small>1터치 즉시 실행</small>
          </div>
          <div className="nexus-db-how-actions">
            {viewModel.howActions.map(action => (
              <button
                key={action.id}
                type="button"
                className={'nexus-db-action-btn is-' + action.tone}
                onClick={() => onAction(action.targetAction)}
              >
                {action.label} →
              </button>
            ))}
          </div>
        </article>

        <article className="nexus-db-card is-outcome">
          <div className="nexus-db-card-head">
            <span>04 결과</span>
            <small>조치 · 예방 성과</small>
          </div>
          <div className="nexus-db-outcome-metrics">
            {viewModel.outcomeMetrics.map(metric => (
              <div key={metric.id} className="nexus-db-metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.deltaNote}</small>
              </div>
            ))}
          </div>
          <p className="nexus-db-outcome-proof">{viewModel.outcomeProofLine}</p>
        </article>
      </div>
    </section>
  );
};
