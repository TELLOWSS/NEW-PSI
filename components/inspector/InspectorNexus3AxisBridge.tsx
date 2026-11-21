import React, { useMemo, useState } from 'react';
import { getKoreanCalendarDay } from '../../utils/monthlyFieldFollowup';
import {
  NEXUS_PIPELINE_STATUS_LABELS,
  advanceNexusPipelineCaseStatus,
  classifyStructuralPhotoContext,
  createNexusPipelineCase,
  type NexusPipelineCase,
} from '../../utils/nexusQuickPipeline';
import {
  NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS,
  NEXUS_PROCESS_AXIS_OPTIONS,
  NEXUS_ZONE_AXIS_OPTIONS,
  type NexusHazardEquipmentAxis,
  type NexusProcessAxis,
  type NexusZoneAxis,
} from '../../utils/nexusStructuralTaxonomy';

interface Props {
  note: string;
  fileName?: string;
  riskTopic?: string;
  workType?: string;
  aiFindingsText?: string;
  source: 'safety-inspector' | 'safety-nexus-quick';
  cases?: readonly NexusPipelineCase[];
  onCaseCreated?: (created: NexusPipelineCase) => void;
  onCaseUpdated?: (cases: NexusPipelineCase[]) => void;
}

export const InspectorNexus3AxisBridge: React.FC<Props> = ({
  note,
  fileName,
  riskTopic,
  workType,
  aiFindingsText,
  source,
  cases = [],
  onCaseCreated,
  onCaseUpdated,
}) => {
  const [quickNote, setQuickNote] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [overrideZone, setOverrideZone] = useState<NexusZoneAxis | ''>('');
  const [overrideProcess, setOverrideProcess] = useState<NexusProcessAxis | ''>('');
  const [overrideEquipment, setOverrideEquipment] = useState<NexusHazardEquipmentAxis | ''>('');
  const [customAction, setCustomAction] = useState('');
  const [assignee, setAssignee] = useState('형틀·골조 담당반장');
  const [dueDate, setDueDate] = useState(() => getKoreanCalendarDay());
  const [handoverShift, setHandoverShift] = useState('다음 교대 작업팀·안전담당 인계');
  const [feedbackNotice, setFeedbackNotice] = useState('');

  const effectiveNote = (note || quickNote).trim();
  const classification = useMemo(
    () =>
      classifyStructuralPhotoContext({
        note: effectiveNote,
        fileName,
        riskTopic,
        workType,
        aiFindingsText,
        overrideZone,
        overrideProcess,
        overrideEquipment,
      }),
    [effectiveNote, fileName, riskTopic, workType, aiFindingsText, overrideZone, overrideProcess, overrideEquipment],
  );

  const seed = classification.primarySeed;

  const handleRegisterToNexus = () => {
    const created = createNexusPipelineCase({
      locationLabel: locationLabel.trim() || '골조·형틀 점검 구간',
      observationNote: effectiveNote || `${seed.title} 관련 현장 사진점검`,
      photoName: fileName,
      zoneAxis: classification.zoneAxis,
      processAxis: classification.processAxis,
      hazardEquipmentAxis: classification.hazardEquipmentAxis,
      actionTitle: customAction.trim() || classification.recommendedActionDraft,
      assignee: assignee.trim() || '형틀·골조 담당반장',
      dueDate,
      handoverShift: handoverShift.trim() || '다음 교대 작업팀·안전담당 인계',
      handoverNote: classification.recommendedHandoverNote,
      source,
    });
    setFeedbackNotice(
      `3D 구체 포인트 [${created.structuralNodeIndex}] 및 유사사례 [${created.matchedCaseCode}]로 조치·재점검·인계 등록이 완료되었습니다.`,
    );
    setQuickNote('');
    setCustomAction('');
    onCaseCreated?.(created);
  };

  return (
    <div className="nexus-3axis-bridge" data-source={source}>
      <div className="nexus-3axis-bridge-head">
        <div>
          <span className="nexus-3axis-kicker">SLICE 2 · 30초 사진점검 → 3축 자동분류 → 사고사례 매칭 → 조치·인계 환류</span>
          <h3>골조·형틀·지하 RC 3축 자동 분류 및 구체 시그널 환류</h3>
        </div>
        <span className="nexus-3axis-confidence">{classification.confidenceLabel} · 구체 #{classification.structuralNodeIndex}</span>
      </div>

      {source === 'safety-nexus-quick' && (
        <div className="nexus-3axis-quick-inputs">
          <label>
            <span>점검 구간·위치</span>
            <input
              type="text"
              value={locationLabel}
              maxLength={100}
              onChange={e => setLocationLabel(e.target.value)}
              placeholder="예: B2층 북측 외벽 / 103동 14층 갱폼 구간"
            />
          </label>
          <label className="nexus-3axis-quick-note-field">
            <span>30초 현장 관찰·사진 한 줄 요약 (입력 즉시 3축·유사사례 자동 매칭)</span>
            <input
              type="text"
              value={quickNote}
              maxLength={300}
              onChange={e => setQuickNote(e.target.value)}
              placeholder="예: 지하 2층 외벽 거푸집 타이볼트 간격 미흡 및 개구부 난간 해체"
            />
          </label>
        </div>
      )}

      <div className="nexus-3axis-tags" role="group" aria-label="자동 추천 3축 태그 (1탭 수정 가능)">
        <label>
          <span>자동분류 축1 · 구간</span>
          <select
            aria-label="자동분류 구간 축"
            value={classification.zoneAxis}
            onChange={e => setOverrideZone(e.target.value as NexusZoneAxis)}
          >
            {NEXUS_ZONE_AXIS_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>자동분류 축2 · 세부작업</span>
          <select
            aria-label="자동분류 작업 축"
            value={classification.processAxis}
            onChange={e => setOverrideProcess(e.target.value as NexusProcessAxis)}
          >
            {NEXUS_PROCESS_AXIS_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>자동분류 축3 · 가설·장비</span>
          <select
            aria-label="자동분류 가설장비 축"
            value={classification.hazardEquipmentAxis}
            onChange={e => setOverrideEquipment(e.target.value as NexusHazardEquipmentAxis)}
          >
            {NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="nexus-3axis-matched-case">
        <div className="nexus-3axis-matched-title">
          <strong>02 유사 사고사례 즉시 매칭 · [{seed.caseCode}] ({seed.hazardMechanism})</strong>
          <small>{seed.sourceKind}</small>
        </div>
        <p className="nexus-3axis-case-name">{seed.title}</p>
        <p className="nexus-3axis-case-cause"><b>직접·근본원인:</b> {seed.directCause} / {seed.rootCause}</p>
      </div>

      <div className="nexus-3axis-action-form">
        <label className="nexus-3axis-action-wide">
          <span>06 시정조치 초안 (자동 제안 · 수정 가능)</span>
          <input
            type="text"
            value={customAction}
            maxLength={300}
            onChange={e => setCustomAction(e.target.value)}
            placeholder={classification.recommendedActionDraft}
          />
        </label>
        <label>
          <span>담당자·작업반</span>
          <input
            type="text"
            value={assignee}
            maxLength={60}
            onChange={e => setAssignee(e.target.value)}
          />
        </label>
        <label>
          <span>재점검 목표일</span>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </label>
        <label>
          <span>교대·인계 대상</span>
          <input
            type="text"
            value={handoverShift}
            maxLength={80}
            onChange={e => setHandoverShift(e.target.value)}
          />
        </label>
        <button type="button" className="nexus-3axis-submit" onClick={handleRegisterToNexus}>
          30초 조치·재점검·인계 등록 및 구체 환류 ↗
        </button>
      </div>

      {feedbackNotice && <p role="status" className="nexus-3axis-feedback">{feedbackNotice}</p>}

      {cases.length > 0 && (
        <div className="nexus-3axis-case-list" aria-label="시정조치·재점검·교대 인계 진행 현황">
          <strong>실시간 조치 · 재점검 · 교대 인계 파이프라인 ({cases.length}건)</strong>
          <ul>
            {cases.slice(0, 6).map(item => (
              <li key={item.caseId} data-status={item.status}>
                <div className="nexus-3axis-case-row-top">
                  <span>
                    <b>[{item.matchedCaseCode} · 구체 #{item.structuralNodeIndex}]</b> {item.locationLabel} · {item.observationNote}
                  </span>
                  <em className={'status-pill status-' + item.status}>{NEXUS_PIPELINE_STATUS_LABELS[item.status]}</em>
                </div>
                <p className="nexus-3axis-case-row-meta">
                  조치: {item.actionTitle} · 담당: {item.assignee} · 기한: {item.dueDate} · 인계: {item.handoverShift}
                </p>
                <div className="nexus-3axis-case-row-actions">
                  {item.status === 'action_required' && (
                    <button
                      type="button"
                      onClick={() => onCaseUpdated?.(advanceNexusPipelineCaseStatus(item.caseId, 'handover_pending'))}
                    >
                      교대 인계 대기 전환
                    </button>
                  )}
                  {(item.status === 'action_required' || item.status === 'handover_pending') && (
                    <button
                      type="button"
                      onClick={() => onCaseUpdated?.(advanceNexusPipelineCaseStatus(item.caseId, 'recheck_pending'))}
                    >
                      조치완료 · 재점검 요청
                    </button>
                  )}
                  {item.status !== 'closed' && (
                    <button
                      type="button"
                      onClick={() => onCaseUpdated?.(advanceNexusPipelineCaseStatus(item.caseId, 'closed', '현장 재점검 확인 종결'))}
                    >
                      현장 재점검 확인 · 종결
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
