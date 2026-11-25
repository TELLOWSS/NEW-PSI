import type { NexusEquipmentPhotoSubmission } from './nexusEquipmentPhotoReport';
import type { NexusExecutiveTrainingCampaign } from './nexusExecutiveTrainingPipeline';
import type {
  NexusAiInvestigationRecord,
  NexusHqVisitPlan,
  NexusSitePortfolioScorecard,
  NexusWorkspaceAuthority,
} from './nexusHqCommandLoop';
import type { NexusPipelineCase } from './nexusQuickPipeline';

export type NexusDecisionPersona = 'executive' | 'site_director' | 'field_manager';
export type NexusDecisionSignalLevel = 'critical' | 'watch' | 'stable';
export type NexusDecisionActionTarget =
  | 'open_ceo_briefing'
  | 'export_pptx'
  | 'open_stopwork'
  | 'open_equip_review'
  | 'open_equip_upload'
  | 'open_visit_ack'
  | 'open_training_qr'
  | 'copy_handover'
  | 'trigger_stopwork';

export interface NexusDecisionBriefAction {
  id: string;
  label: string;
  targetAction: NexusDecisionActionTarget;
  tone: 'primary' | 'danger' | 'neutral';
}

export interface NexusDecisionReason {
  id: string;
  tag: string;
  summary: string;
}

export interface NexusDecisionOutcomeMetric {
  id: string;
  label: string;
  value: string;
  deltaNote: string;
}

export interface NexusDecisionBriefViewModel {
  persona: NexusDecisionPersona;
  personaLabel: string;
  scopeLabel: string;
  signalLevel: NexusDecisionSignalLevel;
  signalLabel: string;
  soWhatHeadline: string;
  soWhatSubline: string;
  whyReasons: readonly NexusDecisionReason[];
  previewPhotoUrl?: string;
  previewPhotoCaption?: string;
  howActions: readonly NexusDecisionBriefAction[];
  outcomeMetrics: readonly NexusDecisionOutcomeMetric[];
  outcomeProofLine: string;
}

export const NEXUS_DECISION_PERSONA_META: Record<
  NexusDecisionPersona,
  { label: string; shortLabel: string; cadenceNote: string }
> = {
  executive: {
    label: '경영진 (대표이사·임원)',
    shortLabel: '경영진',
    cadenceNote: '전사 중지 리스크 · 법적 증빙 완료율 판단',
  },
  site_director: {
    label: '현장소장 (총괄 책임)',
    shortLabel: '현장소장',
    cadenceNote: '작업 전 병목 해제 · 본사 순회·교대 조율',
  },
  field_manager: {
    label: '현장관리자 (실무)',
    shortLabel: '현장관리자',
    cadenceNote: '즉시 사진 보고 · 작업중지 · QR 서명 실행',
  },
};

export const getAllowedDecisionPersonas = (
  workspaceRole: NexusWorkspaceAuthority,
): readonly NexusDecisionPersona[] =>
  workspaceRole === 'hq' ? ['executive', 'site_director'] : ['field_manager', 'site_director'];

const pct = (part: number, total: number): number =>
  total <= 0 ? 100 : Math.round((part / total) * 100);

export const buildNexusDecisionBrief = (params: {
  workspaceRole: NexusWorkspaceAuthority;
  persona: NexusDecisionPersona;
  scopeLabel: string;
  pipelineCases: readonly NexusPipelineCase[];
  equipmentReports: readonly NexusEquipmentPhotoSubmission[];
  trainingCampaigns: readonly NexusExecutiveTrainingCampaign[];
  visitPlans: readonly NexusHqVisitPlan[];
  investigations: readonly NexusAiInvestigationRecord[];
  siteMatrix?: readonly NexusSitePortfolioScorecard[];
}): NexusDecisionBriefViewModel => {
  const allowed = getAllowedDecisionPersonas(params.workspaceRole);
  const resolvedPersona: NexusDecisionPersona = allowed.includes(params.persona)
    ? params.persona
    : allowed[0];

  const openCases = params.pipelineCases.filter(c => c.status !== 'closed');
  const closedCases = params.pipelineCases.filter(c => c.status === 'closed');
  const stopWorkCases = openCases.filter(c => Boolean(c.stopWorkFlag));
  const closureRatePct = pct(closedCases.length, params.pipelineCases.length);

  const pendingEquip = params.equipmentReports.filter(e => e.status === 'submitted_to_hq');
  const revisionEquip = params.equipmentReports.filter(e => e.status === 'revision_requested_hq');
  const verifiedOrReportedEquip = params.equipmentReports.filter(
    e => e.status === 'hq_verified_for_ceo' || e.status === 'reported_to_ceo',
  );
  const equipReadyPct = pct(verifiedOrReportedEquip.length, params.equipmentReports.length);

  const pendingApprovals = params.investigations.filter(i => i.status === 'ai_draft_pending_hq');
  const revInvestigations = params.investigations.filter(i => i.status === 'revision_requested');
  const unackedVisits = params.visitPlans.filter(v => !v.fieldAcknowledgedAt);

  const totalTargetWorkers = params.trainingCampaigns.reduce(
    (sum, c) => sum + Math.max(0, Number(c.targetWorkers || 0)),
    0,
  );
  const totalConfirmedWorkers = params.trainingCampaigns.reduce(
    (sum, c) => sum + Math.max(0, Number(c.confirmedSignatures || 0)),
    0,
  );
  const trainingSignPct =
    totalTargetWorkers > 0 ? Math.min(100, Math.round((totalConfirmedWorkers / totalTargetWorkers) * 100)) : 100;

  const sampleEquipPhoto =
    revisionEquip[0] ?? pendingEquip[0] ?? verifiedOrReportedEquip[0] ?? params.equipmentReports[0];

  if (resolvedPersona === 'executive') {
    const criticalSites = (params.siteMatrix ?? []).filter(s => s.urgencyLevel === 'critical');
    const signalLevel: NexusDecisionSignalLevel =
      stopWorkCases.length > 0 || criticalSites.length > 0
        ? 'critical'
        : pendingEquip.length + pendingApprovals.length + openCases.length > 0
          ? 'watch'
          : 'stable';
    const signalLabel =
      signalLevel === 'critical'
        ? '즉시 통제·결재 필요'
        : signalLevel === 'watch'
          ? '본사 검토·승인 대기'
          : '전사 기준 정상 가동';

    const topRiskSite = criticalSites[0] ?? (params.siteMatrix ?? [])[0];
    const reasons: NexusDecisionReason[] = [];
    if (stopWorkCases.length > 0) {
      reasons.push({
        id: 'exec-stopwork',
        tag: `작업중지 ${stopWorkCases.length}건`,
        summary: `${stopWorkCases[0].locationLabel} — ${stopWorkCases[0].observationNote}`.slice(0, 72),
      });
    }
    if (topRiskSite) {
      reasons.push({
        id: 'exec-top-site',
        tag: topRiskSite.shortLabel,
        summary: `미결 조치 ${topRiskSite.openActionsCount}건 · 사고조사 결재 ${topRiskSite.pendingApprovalsCount}건 · 순회 ${topRiskSite.activeVisitsCount}건`,
      });
    }
    if (pendingEquip.length > 0 || pendingApprovals.length > 0) {
      reasons.push({
        id: 'exec-hq-wait',
        tag: '본사 결재 대기',
        summary: `건설기계 사용전 사진 검토 ${pendingEquip.length}건 · 사고조사 승인 대기 ${pendingApprovals.length}건`,
      });
    }
    if (reasons.length === 0) {
      reasons.push({
        id: 'exec-clean',
        tag: '이상 징후 없음',
        summary: '전 현장 작업중지 및 미승인 고위험 작업이 현재 없습니다.',
      });
    }

    return {
      persona: 'executive',
      personaLabel: NEXUS_DECISION_PERSONA_META.executive.label,
      scopeLabel: params.scopeLabel,
      signalLevel,
      signalLabel,
      soWhatHeadline:
        stopWorkCases.length > 0
          ? `전사 작업중지 ${stopWorkCases.length}건 · 본사 결재 대기 ${pendingEquip.length + pendingApprovals.length}건 즉시 확인 필요`
          : pendingEquip.length + pendingApprovals.length + openCases.length > 0
            ? `건설기계 사진 검토 ${pendingEquip.length}건 · 사고조사 승인 ${pendingApprovals.length}건 확인 후 정상 가동`
            : '전 현장 작업중지 없음 · 건설기계·다국어 교육 증빙 기준 정상 가동 중',
      soWhatSubline: `중점 권고: ${criticalSites.length > 0 ? `${criticalSites.map(s => s.shortLabel).join(', ')} 우선 지휘` : '사전 예방 증빙 유지 및 순회 점검'}`,
      whyReasons: reasons.slice(0, 2),
      previewPhotoUrl: sampleEquipPhoto?.photoDataUrl,
      previewPhotoCaption: sampleEquipPhoto
        ? `${sampleEquipPhoto.siteName} · ${sampleEquipPhoto.equipmentLabel}`
        : undefined,
      howActions: [
        {
          id: 'how-exec-briefing',
          label: '대표이사 1장 브리핑 열기',
          targetAction: 'open_ceo_briefing',
          tone: 'primary',
        },
        {
          id: 'how-exec-stopwork',
          label: '긴급 조치·작업중지 지휘',
          targetAction: 'open_stopwork',
          tone: stopWorkCases.length > 0 ? 'danger' : 'neutral',
        },
        {
          id: 'how-exec-pptx',
          label: '경영진 PPTX 저장',
          targetAction: 'export_pptx',
          tone: 'neutral',
        },
      ],
      outcomeMetrics: [
        {
          id: 'out-closure',
          label: '조치 종결률',
          value: `${closureRatePct}%`,
          deltaNote: `종결 ${closedCases.length} / 전체 ${params.pipelineCases.length}건`,
        },
        {
          id: 'out-equip',
          label: '장비 사전검증률',
          value: `${equipReadyPct}%`,
          deltaNote: `적합·보고 ${verifiedOrReportedEquip.length} / ${params.equipmentReports.length}건`,
        },
        {
          id: 'out-train',
          label: '다국어 서명률',
          value: `${trainingSignPct}%`,
          deltaNote:
            totalTargetWorkers > 0
              ? `${totalConfirmedWorkers}/${totalTargetWorkers}명 이수`
              : '대기 교육 없음',
        },
      ],
      outcomeProofLine: `중대재해처벌법 증빙 준비: 건설기계 적합 ${verifiedOrReportedEquip.length}건 · 다국어 자필 서명 ${totalConfirmedWorkers}명 확보`,
    };
  }

  if (resolvedPersona === 'site_director') {
    const signalLevel: NexusDecisionSignalLevel =
      stopWorkCases.length > 0 || revisionEquip.length > 0
        ? 'critical'
        : openCases.length + unackedVisits.length > 0
          ? 'watch'
          : 'stable';
    const signalLabel =
      signalLevel === 'critical'
        ? '작업 전 병목 즉시 해제'
        : signalLevel === 'watch'
          ? '작업 전 최종 점검 필요'
          : '현장 투입 가능 상태';

    const reasons: NexusDecisionReason[] = [];
    if (stopWorkCases.length > 0 || openCases.length > 0) {
      const leadCase = stopWorkCases[0] ?? openCases[0];
      reasons.push({
        id: 'dir-case',
        tag: leadCase.stopWorkFlag ? '작업중지 구간' : '미결 조치',
        summary: `${leadCase.locationLabel} — ${leadCase.actionTitle || leadCase.observationNote}`.slice(0, 72),
      });
    }
    if (revisionEquip.length > 0 || unackedVisits.length > 0) {
      reasons.push({
        id: 'dir-hq',
        tag: revisionEquip.length > 0 ? '본사 사진 보완요청' : '본사 순회 미접수',
        summary:
          revisionEquip.length > 0
            ? `${revisionEquip[0].equipmentLabel}: ${revisionEquip[0].hqReviewNote || '근접 사진 재촬영 요청'}`
            : `${unackedVisits[0].visitDate} ${unackedVisits[0].inspectorRole} 순회 접수 필요`,
      });
    }
    if (reasons.length === 0) {
      reasons.push({
        id: 'dir-clean',
        tag: '작업 전 준비 완료',
        summary: '작업중지 구간 및 본사 보완요청 잔여 건이 없습니다.',
      });
    }

    return {
      persona: 'site_director',
      personaLabel: NEXUS_DECISION_PERSONA_META.site_director.label,
      scopeLabel: params.scopeLabel,
      signalLevel,
      signalLabel,
      soWhatHeadline:
        stopWorkCases.length > 0
          ? `타설·인양 전 작업중지 ${stopWorkCases.length}건 해제 확인 및 보완 ${revisionEquip.length}건 처리 필수`
          : openCases.length + unackedVisits.length + revisionEquip.length > 0
            ? `현장 미결 ${openCases.length}건 · 본사 순회/보완 ${unackedVisits.length + revisionEquip.length}건 확인 후 작업 진행`
            : '오늘 현장 작업 전 병목 없음 · 교대 지시 전파 후 정상 공정 진행',
      soWhatSubline: `소장 확인 포인트: ${stopWorkCases.length > 0 ? '위험구간 선조치 후 작업 재개 승인' : '근로자 서명 및 장비 반입 사진 유지'}`,
      whyReasons: reasons.slice(0, 2),
      previewPhotoUrl: sampleEquipPhoto?.photoDataUrl,
      previewPhotoCaption: sampleEquipPhoto
        ? `${sampleEquipPhoto.equipmentLabel} · ${sampleEquipPhoto.workActivity}`.slice(0, 48)
        : undefined,
      howActions: [
        {
          id: 'how-dir-stopwork',
          label: '작업중지·미결 확인',
          targetAction: 'open_stopwork',
          tone: stopWorkCases.length > 0 ? 'danger' : 'primary',
        },
        {
          id: 'how-dir-visit',
          label: '본사 순회 준비 확인',
          targetAction: 'open_visit_ack',
          tone: unackedVisits.length > 0 ? 'primary' : 'neutral',
        },
        {
          id: 'how-dir-handover',
          label: '교대 지시 5줄 복사',
          targetAction: 'copy_handover',
          tone: 'neutral',
        },
      ],
      outcomeMetrics: [
        {
          id: 'dir-out-close',
          label: '현장 조치 종결',
          value: `${closedCases.length}/${params.pipelineCases.length}건`,
          deltaNote: `종결률 ${closureRatePct}%`,
        },
        {
          id: 'dir-out-eq',
          label: '보완 해결 완료',
          value: `${verifiedOrReportedEquip.length}/${params.equipmentReports.length}건`,
          deltaNote: revisionEquip.length > 0 ? `보완 대기 ${revisionEquip.length}건` : '보완 대기 0건',
        },
        {
          id: 'dir-out-sign',
          label: '모국어 서명 완료',
          value: `${trainingSignPct}%`,
          deltaNote: `${totalConfirmedWorkers}명 서명 확인`,
        },
      ],
      outcomeProofLine: `현장 통제 결과: 미결 잔여 ${openCases.length}건 · 본사 순회 접수 ${params.visitPlans.length - unackedVisits.length}/${params.visitPlans.length}건`,
    };
  }

  // Field Safety Manager ('field_manager')
  const totalRevision = revisionEquip.length + revInvestigations.length;
  const fieldActionNeeded = totalRevision + stopWorkCases.length + unackedVisits.length;
  const signalLevel: NexusDecisionSignalLevel =
    stopWorkCases.length > 0 || totalRevision > 0
      ? 'critical'
      : fieldActionNeeded > 0 || totalConfirmedWorkers < totalTargetWorkers
        ? 'watch'
        : 'stable';
  const signalLabel =
    signalLevel === 'critical'
      ? '현장 즉시 처리 필요'
      : signalLevel === 'watch'
        ? '잔여 서명·점검 확인'
        : '현장 당일 조치 완료';

  const reasons: NexusDecisionReason[] = [];
  if (revisionEquip.length > 0) {
    reasons.push({
      id: 'fld-rev-eq',
      tag: `기계사진 보완 ${revisionEquip.length}건`,
      summary: `${revisionEquip[0].equipmentLabel}: ${revisionEquip[0].hqReviewNote || '본사 보완요청 내용 확인'}`,
    });
  }
  const hqDirectiveCase = openCases.find(c => Boolean(c.hqDirectiveNote));
  if (hqDirectiveCase) {
    reasons.push({
      id: 'fld-dir-case',
      tag: '본사 긴급 지시',
      summary: `${hqDirectiveCase.locationLabel}: ${hqDirectiveCase.hqDirectiveNote}`.slice(0, 72),
    });
  } else if (openCases.length > 0) {
    reasons.push({
      id: 'fld-open-case',
      tag: openCases[0].stopWorkFlag ? '작업중지' : '재점검 대기',
      summary: `${openCases[0].locationLabel} — ${openCases[0].observationNote}`.slice(0, 72),
    });
  }
  if (reasons.length === 0) {
    reasons.push({
      id: 'fld-clean',
      tag: '잔여 보완 없음',
      summary: '본사 반려/긴급 지시 및 미완료 재점검 건이 현재 없습니다.',
    });
  }

  const remainingWorkers = Math.max(0, totalTargetWorkers - totalConfirmedWorkers);

  return {
    persona: 'field_manager',
    personaLabel: NEXUS_DECISION_PERSONA_META.field_manager.label,
    scopeLabel: params.scopeLabel,
    signalLevel,
    signalLabel,
    soWhatHeadline:
      totalRevision > 0 || stopWorkCases.length > 0
        ? `지금 바로 처리: 본사 보완 재촬영 ${totalRevision}건 · 작업중지·미결 ${openCases.length}건 우선 실행`
        : remainingWorkers > 0
          ? `현장 보완 없음 · 잔여 모국어 근로자 서명 ${remainingWorkers}명 수합 필요`
          : '오늘 본사 보완요청 0건 · 모든 현장 점검·교육 증빙 제출 완료',
    soWhatSubline: '이동 중 한손 엄지 바로가기 또는 아래 실행 버튼으로 즉시 전송하세요.',
    whyReasons: reasons.slice(0, 2),
    previewPhotoUrl: sampleEquipPhoto?.photoDataUrl,
    previewPhotoCaption: sampleEquipPhoto
      ? `${sampleEquipPhoto.equipmentLabel} · 최근 촬영`
      : undefined,
    howActions: [
      {
        id: 'how-fld-stopwork',
        label: '⛔ 작업중지 즉시 등록',
        targetAction: 'trigger_stopwork',
        tone: 'danger',
      },
      {
        id: 'how-fld-equip',
        label: revisionEquip.length > 0 ? '📷 보완 사진 재촬영' : '📷 기계사진 본사 전송',
        targetAction: 'open_equip_upload',
        tone: 'primary',
      },
      {
        id: 'how-fld-qr',
        label: '📱 QR 모국어 서명',
        targetAction: 'open_training_qr',
        tone: 'neutral',
      },
    ],
    outcomeMetrics: [
      {
        id: 'fld-out-submit',
        label: '기계사진 전달',
        value: `${params.equipmentReports.length}건`,
        deltaNote: `본사 적합 ${verifiedOrReportedEquip.length}건`,
      },
      {
        id: 'fld-out-sign',
        label: '모국어 서명 수합',
        value: totalTargetWorkers > 0 ? `${totalConfirmedWorkers}/${totalTargetWorkers}명` : `${totalConfirmedWorkers}명`,
        deltaNote: `달성 ${trainingSignPct}%`,
      },
      {
        id: 'fld-out-done',
        label: '점검 종결 완료',
        value: `${closedCases.length}건`,
        deltaNote: `진행 중 ${openCases.length}건`,
      },
    ],
    outcomeProofLine: `현장 실행 결과: 오늘 본사 전송·완료 이력이 실시간 감사 증빙에 자동 적재됩니다.`,
  };
};
