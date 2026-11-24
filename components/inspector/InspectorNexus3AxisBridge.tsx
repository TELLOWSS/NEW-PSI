import React, { useMemo, useState } from 'react';
import { getKoreanCalendarDay } from '../../utils/monthlyFieldFollowup';
import {
  NEXUS_EQUIPMENT_TYPE_OPTIONS,
  submitEquipmentPhotoReport,
  type NexusEquipmentType,
} from '../../utils/nexusEquipmentPhotoReport';
import { enqueueNexusOfflineMutation } from '../../utils/nexusOfflineQueue';
import {
  NEXUS_PIPELINE_STATUS_LABELS,
  NEXUS_QUICK_FIELD_PRESETS,
  addHqDirectiveToPipelineCase,
  advanceNexusPipelineCaseStatus,
  buildShiftHandoverBriefingText,
  classifyStructuralPhotoContext,
  createNexusPipelineCase,
  type NexusPipelineCase,
  type NexusQuickFieldPreset,
} from '../../utils/nexusQuickPipeline';
import { readManagedNexusSites } from '../../utils/nexusSiteRegistry';
import {
  NEXUS_HAZARD_EQUIPMENT_AXIS_OPTIONS,
  NEXUS_PROCESS_AXIS_OPTIONS,
  NEXUS_ZONE_AXIS_OPTIONS,
  type NexusHazardEquipmentAxis,
  type NexusProcessAxis,
  type NexusZoneAxis,
} from '../../utils/nexusStructuralTaxonomy';
import { compressFieldPhotoForNexus } from '../../utils/nexusSyncEngine';

interface Props {
  workspaceRole?: 'hq' | 'field';
  note: string;
  fileName?: string;
  previewDataUrl?: string;
  riskTopic?: string;
  workType?: string;
  aiFindingsText?: string;
  source: 'safety-inspector' | 'safety-nexus-quick';
  lockedSiteId?: string;
  lockedSiteName?: string;
  cases?: readonly NexusPipelineCase[];
  onCaseCreated?: (created: NexusPipelineCase) => void;
  onCaseUpdated?: (cases: NexusPipelineCase[]) => void;
  onEscalateToInvestigation?: (item: NexusPipelineCase) => void;
  onDispatchTrainingForCase?: (item: NexusPipelineCase) => void;
}

export const InspectorNexus3AxisBridge: React.FC<Props> = ({
  workspaceRole = 'field',
  note,
  fileName,
  previewDataUrl,
  riskTopic,
  workType,
  aiFindingsText,
  source,
  lockedSiteId,
  lockedSiteName,
  cases = [],
  onCaseCreated,
  onCaseUpdated,
  onEscalateToInvestigation,
  onDispatchTrainingForCase,
}) => {
  const isHq = workspaceRole === 'hq';
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
  const [stepEvidenceByCase, setStepEvidenceByCase] = useState<Record<string, string>>({});
  const [hqDirectiveByCase, setHqDirectiveByCase] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'stop_work' | 'action_required' | 'handover_pending' | 'recheck_pending' | 'closed'>('all');
  const [stopWorkFlag, setStopWorkFlag] = useState(false);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState('');
  const [beforePhotoName, setBeforePhotoName] = useState('');
  const [afterPhotoByCase, setAfterPhotoByCase] = useState<Record<string, string>>({});
  const [handoverPreviewText, setHandoverPreviewText] = useState('');
  const managedSites = useMemo(() => readManagedNexusSites(false), []);
  const [inspectorEqType, setInspectorEqType] = useState<NexusEquipmentType>('concrete_pump_car');
  const [inspectorEqSiteId, setInspectorEqSiteId] = useState<string>(
    lockedSiteId || managedSites[0]?.siteId || 'SITE-01-SUBRC',
  );

  const filteredCases = useMemo(
    () =>
      statusFilter === 'all'
        ? cases
        : statusFilter === 'stop_work'
          ? cases.filter(c => Boolean(c.stopWorkFlag) && c.status !== 'closed')
          : cases.filter(c => c.status === statusFilter),
    [cases, statusFilter],
  );

  const handleApplyQuickPreset = (preset: NexusQuickFieldPreset) => {
    setLocationLabel(lockedSiteName ? `${lockedSiteName} · ${preset.badge} 구간` : preset.locationLabel);
    setQuickNote(preset.observationNote);
    setOverrideZone(preset.zoneAxis);
    setOverrideProcess(preset.processAxis);
    setOverrideEquipment(preset.hazardEquipmentAxis);
    setCustomAction('');
    setFeedbackNotice(
      `[1초 현장 프리셋 적용] ${preset.badge} ${preset.label} — 위치·관찰내용·3축 분류 및 시정조치 초안이 자동 입력되었습니다.`,
    );
  };

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

  const handleBeforePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBeforePhotoName(file.name);
    const dataUrl = await compressFieldPhotoForNexus(file);
    setBeforePhotoUrl(dataUrl);
  };

  const handleAfterPhotoChange = async (caseId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressFieldPhotoForNexus(file);
    setAfterPhotoByCase(prev => ({ ...prev, [caseId]: dataUrl }));
  };

  const handleSendInspectorPhotoToHqEquipment = () => {
    const targetSiteId = lockedSiteId || inspectorEqSiteId;
    const siteMeta = managedSites.find(s => s.siteId === targetSiteId) ?? managedSites[0];
    const submitted = submitEquipmentPhotoReport({
      siteId: siteMeta?.siteId || targetSiteId,
      siteName: lockedSiteName || siteMeta?.siteName,
      equipmentType: inspectorEqType,
      workActivity: effectiveNote || `사진점검 연계 · ${siteMeta?.shortLabel || '현장'} 건설기계 점검`,
      photoName: beforePhotoName || fileName || undefined,
      photoDataUrl: beforePhotoUrl || previewDataUrl || undefined,
      uploadedBy: assignee.trim() || '현장 안전관리자',
    });
    enqueueNexusOfflineMutation({
      kind: 'equipment_photo',
      siteId: submitted.siteId,
      recordId: submitted.submissionId,
      summary: `${submitted.siteName} · ${submitted.equipmentLabel} 사진 전송`,
    });
    setFeedbackNotice(
      `[건설기계 사진 본사 직송] ${submitted.siteName} · ${submitted.equipmentLabel} 사진이 안전지능 네트워크 본사 검토함으로 전송되었습니다.`,
    );
  };

  const handleCopyShiftHandover = async () => {
    const summary = buildShiftHandoverBriefingText(cases, lockedSiteName || '전체 현장');
    setHandoverPreviewText(summary);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
      }
      setFeedbackNotice('교대 인계서 5줄 요약이 클립보드에 복사되었습니다. 야간·다음 교대팀에 바로 공유하세요.');
    } catch {
      setFeedbackNotice('교대 인계서 5줄 요약이 생성되었습니다. 아래 요약 박스에서 복사하세요.');
    }
  };

  const handleRegisterToNexus = () => {
    const rawLoc = locationLabel.trim();
    const boundLocation = lockedSiteName
      ? rawLoc
        ? rawLoc.includes(lockedSiteName)
          ? rawLoc
          : `${lockedSiteName} · ${rawLoc}`
        : lockedSiteName
      : rawLoc || '골조·형틀 점검 구간';
    const created = createNexusPipelineCase({
      siteId: lockedSiteId || undefined,
      locationLabel: boundLocation,
      observationNote: effectiveNote || `${seed.title} 관련 현장 사진점검`,
      photoName: beforePhotoName || fileName,
      zoneAxis: classification.zoneAxis,
      processAxis: classification.processAxis,
      hazardEquipmentAxis: classification.hazardEquipmentAxis,
      actionTitle: customAction.trim() || classification.recommendedActionDraft,
      assignee: assignee.trim() || '형틀·골조 담당반장',
      dueDate,
      handoverShift: handoverShift.trim() || '다음 교대 작업팀·안전담당 인계',
      handoverNote: classification.recommendedHandoverNote,
      stopWorkFlag,
      beforePhotoDataUrl: beforePhotoUrl || previewDataUrl || undefined,
      source,
    });
    enqueueNexusOfflineMutation({
      kind: 'pipeline_case',
      siteId: created.siteId,
      recordId: created.caseId,
      summary: `${created.locationLabel} · ${created.matchedCaseCode}${created.stopWorkFlag ? ' (작업중지)' : ''}`,
    });
    setFeedbackNotice(
      `3D 구체 포인트 [${created.structuralNodeIndex}] 및 유사사례 [${created.matchedCaseCode}]로 조치·재점검·인계 등록이 완료되었습니다.`,
    );
    setQuickNote('');
    setCustomAction('');
    setStopWorkFlag(false);
    setBeforePhotoUrl('');
    setBeforePhotoName('');
    onCaseCreated?.(created);
  };

  const handleSendHqDirective = (item: NexusPipelineCase) => {
    const directiveNote =
      hqDirectiveByCase[item.caseId]?.trim() ||
      '작업 구역 출입 통제 유지 및 보강 후 조치 완료 사진 재전송 요망';
    const updated = addHqDirectiveToPipelineCase(item.caseId, {
      actorLabel: '본사 CSO·안전보건실',
      note: directiveNote,
    });
    onCaseUpdated?.(updated);
    setHqDirectiveByCase(prev => ({ ...prev, [item.caseId]: '' }));
    setFeedbackNotice(`[본사 긴급 지시 하달] ${item.locationLabel} (${item.matchedCaseCode}) 현장 조치함에 지시가 전달되었습니다.`);
  };

  const renderQuickCaptureForm = () => (
    <>

      {source === 'safety-nexus-quick' && (
        <>
          <div className="nexus-quick-preset-bar" role="group" aria-label="현장 안전관리자 1초 원탭 위험 프리셋">
            <span className="nexus-quick-preset-title">⚡ 현장 1초 원탭 프리셋</span>
            <div className="nexus-quick-preset-chips">
              {NEXUS_QUICK_FIELD_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className="nexus-quick-preset-chip"
                  onClick={() => handleApplyQuickPreset(preset)}
                >
                  <b>{preset.badge}</b>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
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
        </>
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
        <div className="nexus-3axis-field-extras">
          <label className={'nexus-stopwork-toggle' + (stopWorkFlag ? ' is-checked' : '')}>
            <input
              type="checkbox"
              checked={stopWorkFlag}
              onChange={e => setStopWorkFlag(e.target.checked)}
            />
            <span>⛔ 임시통제·작업중지 구역 지정</span>
          </label>
          <label className="nexus-photo-upload-chip">
            <span>📷 조치 전 현장 사진 첨부 {beforePhotoName ? `(${beforePhotoName.slice(0, 16)})` : ''}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="조치 전 현장 점검 사진 첨부"
              onChange={handleBeforePhotoChange}
            />
          </label>
          {beforePhotoUrl && (
            <img src={beforePhotoUrl} alt="조치 전 현장 사진 미리보기" className="nexus-inline-thumb" />
          )}
        </div>
        <button type="button" className="nexus-3axis-submit" onClick={handleRegisterToNexus}>
          30초 조치·재점검·인계 등록 및 구체 환류 ↗
        </button>
        {source === 'safety-inspector' && (
          <div className="nexus-inspector-equip-bar">
            <select
              aria-label="사진점검 연계 현장 선택"
              value={inspectorEqSiteId}
              onChange={e => setInspectorEqSiteId(e.target.value)}
            >
              {managedSites.map(s => (
                <option key={s.siteId} value={s.siteId}>{s.shortLabel}</option>
              ))}
            </select>
            <select
              aria-label="사진점검 연계 건설기계 선택"
              value={inspectorEqType}
              onChange={e => setInspectorEqType(e.target.value as NexusEquipmentType)}
            >
              {NEXUS_EQUIPMENT_TYPE_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="nexus-ceo-studio-btn"
              onClick={handleSendInspectorPhotoToHqEquipment}
            >
              🏗️ 건설기계 사용전 점검 사진으로 본사 직송 ↗
            </button>
          </div>
        )}
      </div>
    </>
  );

  const renderCaseMonitorList = () => (
    <>
      {feedbackNotice && <p role="status" className="nexus-3axis-feedback">{feedbackNotice}</p>}

      {cases.length > 0 ? (
        <div className="nexus-3axis-case-list" aria-label="시정조치·재점검·교대 인계 진행 현황">
          <div className="nexus-case-list-head">
            <strong>실시간 조치 · 재점검 · 교대 인계 파이프라인 ({cases.length}건)</strong>
            <div className="nexus-case-status-filters" role="group" aria-label="조치·인계 상태별 필터">
              {[
                ['all', `전체 (${cases.length})`],
                ['stop_work', `⛔ 작업중지 (${cases.filter(c => c.stopWorkFlag && c.status !== 'closed').length})`],
                ['action_required', `조치진행 (${cases.filter(c => c.status === 'action_required').length})`],
                ['handover_pending', `교대·인계 (${cases.filter(c => c.status === 'handover_pending').length})`],
                ['recheck_pending', `재점검대기 (${cases.filter(c => c.status === 'recheck_pending').length})`],
                ['closed', `종결 (${cases.filter(c => c.status === 'closed').length})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(key as typeof statusFilter)}
                >
                  {label}
                </button>
              ))}
              <button type="button" className="nexus-handover-copy-btn" onClick={handleCopyShiftHandover}>
                📋 교대 인계서 5줄 복사
              </button>
            </div>
          </div>
          {handoverPreviewText && (
            <pre className="nexus-handover-preview" aria-label="교대 인계서 요약 미리보기">
              {handoverPreviewText}
            </pre>
          )}
          <ul>
            {filteredCases.slice(0, 6).map(item => (
              <li key={item.caseId} data-status={item.status} className={item.stopWorkFlag ? 'is-stopwork-item' : undefined}>
                <div className="nexus-3axis-case-row-top">
                  <span>
                    {item.stopWorkFlag && <em className="nexus-stopwork-badge">⛔ 임시통제·작업중지</em>}{' '}
                    <b>[{item.matchedCaseCode} · 구체 #{item.structuralNodeIndex}]</b> {item.locationLabel} · {item.observationNote}
                  </span>
                  <em className={'status-pill status-' + item.status}>{NEXUS_PIPELINE_STATUS_LABELS[item.status]}</em>
                </div>
                {item.hqDirectiveNote && (
                  <p className="nexus-hq-directive-banner">
                    <b>[🏛️ 본사 긴급 지시 · {item.hqDirectiveActor || '본사 CSO'}]</b> {item.hqDirectiveNote}
                  </p>
                )}
                {(item.beforePhotoDataUrl || item.afterPhotoDataUrl) && (
                  <div className="nexus-before-after-thumbs">
                    {item.beforePhotoDataUrl && (
                      <figure>
                        <img src={item.beforePhotoDataUrl} alt="조치 전 사진" />
                        <figcaption>조치 전</figcaption>
                      </figure>
                    )}
                    {item.afterPhotoDataUrl && (
                      <figure>
                        <img src={item.afterPhotoDataUrl} alt="조치 후 재점검 사진" />
                        <figcaption>조치 후</figcaption>
                      </figure>
                    )}
                  </div>
                )}
                <p className="nexus-3axis-case-row-meta">
                  조치: {item.actionTitle} · 담당: {item.assignee} · 기한: {item.dueDate} · 인계: {item.handoverShift}
                  {item.recheckNote ? ` · 최근 확인: ${item.recheckNote}` : ''}
                </p>
                {item.auditTrail && item.auditTrail.length > 0 && (
                  <div className="nexus-audit-trail-strip" aria-label="조치·인계·재점검 감사 타임라인">
                    {item.auditTrail.map((entry, idx) => (
                      <span key={idx} className={'nexus-audit-chip status-' + entry.status}>
                        <b>{NEXUS_PIPELINE_STATUS_LABELS[entry.status]}</b> {entry.note}
                      </span>
                    ))}
                  </div>
                )}
                {isHq && item.status !== 'closed' && (
                  <div className="nexus-case-hq-directive-row">
                    <input
                      type="text"
                      aria-label={`본사 긴급 지시 입력 ${item.matchedCaseCode}`}
                      value={hqDirectiveByCase[item.caseId] ?? ''}
                      maxLength={200}
                      onChange={e =>
                        setHqDirectiveByCase(prev => ({ ...prev, [item.caseId]: e.target.value }))
                      }
                      placeholder="본사 CSO 긴급 시정·통제 지시사항 입력 (현장 조치함에 즉시 전달)"
                    />
                    <button
                      type="button"
                      className="nexus-hq-directive-btn"
                      onClick={() => handleSendHqDirective(item)}
                    >
                      🏛️ 본사 긴급 지시 하달
                    </button>
                  </div>
                )}
                {item.status !== 'closed' && (
                  <div className="nexus-case-evidence-row">
                    <input
                      type="text"
                      aria-label={`조치·재점검 증빙 메모 ${item.matchedCaseCode}`}
                      value={stepEvidenceByCase[item.caseId] ?? ''}
                      maxLength={180}
                      onChange={e =>
                        setStepEvidenceByCase(prev => ({ ...prev, [item.caseId]: e.target.value }))
                      }
                      placeholder="현장 조치·인계·재점검 확인 메모 입력 (예: 타이볼트 12개소 재체결 및 수직도 확인 완료)"
                    />
                    <label className="nexus-photo-upload-chip">
                      <span>📷 조치 후 사진 첨부</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        aria-label={`조치 후 사진 첨부 ${item.matchedCaseCode}`}
                        onChange={e => handleAfterPhotoChange(item.caseId, e)}
                      />
                    </label>
                  </div>
                )}
                <div className="nexus-3axis-case-row-actions">
                  {item.status === 'action_required' && (
                    <button
                      type="button"
                      onClick={() =>
                        onCaseUpdated?.(
                          advanceNexusPipelineCaseStatus(
                            item.caseId,
                            'handover_pending',
                            stepEvidenceByCase[item.caseId],
                            undefined,
                            '현장 안전관리자',
                            afterPhotoByCase[item.caseId],
                          ),
                        )
                      }
                    >
                      교대 인계 대기 전환
                    </button>
                  )}
                  {(item.status === 'action_required' || item.status === 'handover_pending') && (
                    <button
                      type="button"
                      onClick={() =>
                        onCaseUpdated?.(
                          advanceNexusPipelineCaseStatus(
                            item.caseId,
                            'recheck_pending',
                            stepEvidenceByCase[item.caseId],
                            undefined,
                            '현장 안전관리자',
                            afterPhotoByCase[item.caseId],
                          ),
                        )
                      }
                    >
                      조치완료 · 재점검 요청
                    </button>
                  )}
                  {item.status !== 'closed' && (
                    <button
                      type="button"
                      onClick={() =>
                        onCaseUpdated?.(
                          advanceNexusPipelineCaseStatus(
                            item.caseId,
                            'closed',
                            stepEvidenceByCase[item.caseId] || '현장 재점검 확인 종결',
                            undefined,
                            '현장 안전관리자',
                            afterPhotoByCase[item.caseId],
                          ),
                        )
                      }
                    >
                      현장 재점검 확인 · 종결
                    </button>
                  )}
                  {onEscalateToInvestigation && (
                    <button
                      type="button"
                      className="is-escalate"
                      onClick={() => onEscalateToInvestigation(item)}
                    >
                      05 아차사고 원인조사 상신 ↗
                    </button>
                  )}
                  {onDispatchTrainingForCase && (
                    <button
                      type="button"
                      className="is-training"
                      onClick={() => onDispatchTrainingForCase(item)}
                    >
                      04 작업팀 12개국어 교육 발령 ↗
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="nexus-3axis-case-row-meta">
          {isHq ? '전사 미결·작업중지 시정조치 건이 없습니다.' : '등록된 현장 30초 점검·조치 건이 없습니다.'}
        </p>
      )}
    </>
  );

  return (
    <div className="nexus-3axis-bridge" data-source={source}>
      <div className="nexus-3axis-bridge-head">
        <div>
          <span className="nexus-3axis-kicker">
            {isHq
              ? 'HQ COMMAND MONITOR · 전 현장 작업중지·시정조치 관제 및 본사 긴급 지시 하달'
              : 'SLICE 2 · 30초 사진점검 → 3축 자동분류 → 사고사례 매칭 → 조치·인계 환류'}
          </span>
          <h3>
            {isHq
              ? '전 현장 시정조치 · 작업중지(Stop-Work) 통제 현황 및 지시'
              : '골조·형틀·지하 RC 3축 자동 분류 및 구체 시그널 환류'}
          </h3>
        </div>
        <span className="nexus-3axis-confidence">
          {classification.confidenceLabel} · 구체 #{classification.structuralNodeIndex}
        </span>
      </div>

      {isHq ? (
        <>
          {renderCaseMonitorList()}
          <details className="nexus-collapsible-form">
            <summary>+ 본사 대리 30초 현장 점검 등록 열기</summary>
            {renderQuickCaptureForm()}
          </details>
        </>
      ) : (
        <>
          {renderQuickCaptureForm()}
          {renderCaseMonitorList()}
        </>
      )}
    </div>
  );
};
