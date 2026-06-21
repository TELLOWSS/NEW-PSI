import React, { useMemo, useEffect, useState } from 'react';
import type { Page, WorkerRecord } from '../types';
import { postAdminJson } from '../utils/adminApiClient';
import { loadSafetyCasesFromServer, saveSafetyCaseToServer } from '../services/safetyCaseService';
import {
  completeSafetyCaseStage,
  getNextSafetyCaseStage,
  isSafetyCaseOverdue,
  markSafetyCaseActionStarted,
  readSafetyCases,
  SAFETY_CASE_FOCUS_KEY,
  SAFETY_CASE_STAGE_LABELS,
  SAFETY_CASE_STAGE_ORDER,
  SAFETY_CASE_TRAINING_HANDOFF_KEY,
  SAFETY_CASE_UPDATED_EVENT,
  type SafetyCaseRecord,
  type SafetyCaseStage,
  upsertSafetyCase,
  writeSafetyCases,
} from '../utils/safetyCase';

interface Intervention {
  key?: string;
  caseId?: string;
  priority: 'immediate' | 'medium' | 'long-term';
  title: string;
  reason: string;
  timescale: string;
  assignee?: string;
  status?: 'not-started' | 'in-progress' | 'completed';
  workerName?: string;
  jobField?: string;
}

type PredictiveHandoffPlan = {
  key: string;
  caseId?: string;
  sourceRecordId?: string;
  workerId?: string;
  priority: '즉시' | '고' | '중';
  owner: string;
  workerName: string;
  jobField: string;
  teamLeader?: string;
  riskLabel: string;
  actionTitle: string;
  dueLabel: string;
  dueAt?: string;
  status: 'not-started' | 'in-progress' | 'completed';
  checkItems: string[];
};

type PredictiveHandoffPayload = {
  generatedAt: string;
  topRiskLabel: string;
  plans: PredictiveHandoffPlan[];
};

const PREDICTIVE_INTERVENTION_HANDOFF_KEY = 'psi_predictive_intervention_handoff_v1';
const PREDICTIVE_INTERVENTION_HANDOFF_EVENT = 'psi-predictive-intervention-updated';
const INTERVENTION_FOCUS_PLAN_KEY = 'psi_intervention_focus_plan_key_v1';
const INTERVENTION_FOCUS_EVENT = 'psi-intervention-focus-updated';

interface InterventionCoachingProps {
  workerRecords?: WorkerRecord[];
  onNavigateToPage?: (page: Page) => void;
}

export const InterventionCoaching: React.FC<InterventionCoachingProps> = ({ workerRecords = [], onNavigateToPage }) => {
  const [handoffPlans, setHandoffPlans] = useState<PredictiveHandoffPlan[]>([]);
  const [focusedPlanKey, setFocusedPlanKey] = useState<string | null>(null);
  const [safetyCases, setSafetyCases] = useState<SafetyCaseRecord[]>([]);
  const [caseNotice, setCaseNotice] = useState('');

  useEffect(() => {
    const readHandoff = () => {
      try {
        const raw = localStorage.getItem(PREDICTIVE_INTERVENTION_HANDOFF_KEY);
        if (!raw) {
          setHandoffPlans([]);
          return;
        }
        const parsed = JSON.parse(raw) as PredictiveHandoffPayload;
        setHandoffPlans(Array.isArray(parsed?.plans) ? parsed.plans : []);
      } catch {
        setHandoffPlans([]);
      }
    };

    readHandoff();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PREDICTIVE_INTERVENTION_HANDOFF_KEY) {
        readHandoff();
      }
    };
    const onHandoffUpdated = () => readHandoff();
    window.addEventListener('storage', onStorage);
    window.addEventListener(PREDICTIVE_INTERVENTION_HANDOFF_EVENT, onHandoffUpdated);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PREDICTIVE_INTERVENTION_HANDOFF_EVENT, onHandoffUpdated);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const readCases = () => setSafetyCases(readSafetyCases());
    const refreshCases = () => {
      readCases();
      void loadSafetyCasesFromServer()
        .then((response) => {
          if (!active || !response.schemaReady || !Array.isArray(response.items)) return;
          const local = readSafetyCases();
          const merged = new Map(local.map((record) => [record.caseId, record]));
          response.items.forEach((serverRecord) => {
            const localRecord = merged.get(serverRecord.caseId);
            const serverTime = new Date(serverRecord.updatedAt).getTime();
            const localTime = localRecord ? new Date(localRecord.updatedAt).getTime() : 0;
            if (!localRecord || serverTime >= localTime) merged.set(serverRecord.caseId, serverRecord);
          });
          const next = Array.from(merged.values()).sort((left, right) => (
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          ));
          writeSafetyCases(next);
          setSafetyCases(next);
        })
        .catch(() => {
          // 원격 스키마 적용 전에도 로컬 보호사건 흐름은 유지한다.
        });
    };
    refreshCases();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'psi_safety_cases_v1') readCases();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshCases();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAFETY_CASE_UPDATED_EVENT, readCases);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SAFETY_CASE_UPDATED_EVENT, readCases);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const readFocusedPlanKey = () => {
      try {
        const key = localStorage.getItem(INTERVENTION_FOCUS_PLAN_KEY);
        setFocusedPlanKey(key && key.trim().length > 0 ? key.trim() : null);
      } catch {
        setFocusedPlanKey(null);
      }
    };

    readFocusedPlanKey();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === INTERVENTION_FOCUS_PLAN_KEY) {
        readFocusedPlanKey();
      }
    };
    const onFocusUpdated = () => readFocusedPlanKey();
    window.addEventListener('storage', onStorage);
    window.addEventListener(INTERVENTION_FOCUS_EVENT, onFocusUpdated);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(INTERVENTION_FOCUS_EVENT, onFocusUpdated);
    };
  }, []);

  const liveInterventions = useMemo<Intervention[]>(() => {
    if (handoffPlans.length === 0) return [];
    return handoffPlans.slice(0, 5).map((plan) => ({
      key: plan.key,
      caseId: plan.caseId,
      priority: plan.priority === '즉시' ? 'immediate' : plan.priority === '고' ? 'medium' : 'long-term',
      title: plan.actionTitle,
      reason: `${plan.workerName} · ${plan.jobField} · ${plan.riskLabel}`,
      timescale: plan.dueLabel,
      assignee: plan.owner,
      status: plan.status,
      workerName: plan.workerName,
      jobField: plan.jobField,
    }));
  }, [handoffPlans]);

  const interventions = liveInterventions;
  const caseById = useMemo(
    () => new Map(safetyCases.map((record) => [record.caseId, record])),
    [safetyCases],
  );

  useEffect(() => {
    if (!focusedPlanKey) return;
    const exists = interventions.some((item) => item.key === focusedPlanKey);
    if (!exists) {
      setFocusedPlanKey(null);
    }
  }, [focusedPlanKey, interventions]);

  useEffect(() => {
    const reassessmentCandidates = safetyCases.filter((record) => record.status === 'awaiting-reassessment');
    if (reassessmentCandidates.length === 0 || workerRecords.length === 0) return;

    reassessmentCandidates.forEach((caseRecord) => {
      const acknowledgedAt = caseRecord.completedStages.acknowledgement;
      if (!acknowledgedAt) return;
      const acknowledgedTime = new Date(acknowledgedAt).getTime();
      const matchingRecords = workerRecords
        .filter((workerRecord) => {
          const recordIdentity = String(
            workerRecord.worker_uuid
            || workerRecord.workerUuid
            || workerRecord.employeeId
            || workerRecord.id
            || '',
          ).trim();
          if (caseRecord.workerId && recordIdentity === caseRecord.workerId) return true;
          return workerRecord.name.trim() === caseRecord.workerName.trim()
            && workerRecord.jobField.trim() === caseRecord.jobField.trim();
        })
        .filter((workerRecord) => {
          const assessedTime = new Date(workerRecord.date).getTime();
          return Number.isFinite(assessedTime) && assessedTime > acknowledgedTime;
        })
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

      const reassessment = matchingRecords[0];
      if (!reassessment) return;

      const next = completeSafetyCaseStage(
        caseRecord,
        'reassessment',
        'PSI 후속 평가',
        `${reassessment.date} 재평가 기록을 연결했습니다.`,
        { evidenceId: reassessment.id },
      );
      setSafetyCases(upsertSafetyCase(next));
      void saveSafetyCaseToServer(next).catch(() => {
        // 원격 스키마 적용 전에도 로컬 보호사건 흐름은 유지한다.
      });
    });
  }, [safetyCases, workerRecords]);

  const getNextStatus = (status?: Intervention['status']): NonNullable<Intervention['status']> => {
    if (status === 'in-progress') return 'completed';
    if (status === 'completed') return 'completed';
    return 'in-progress';
  };

  const handleAssignAction = (intervention: Intervention) => {
    const nextStatus = getNextStatus(intervention.status);

    if (!intervention.key) return;

    const linkedCase = intervention.caseId ? caseById.get(intervention.caseId) : undefined;
    if (linkedCase) {
      const nextCase = nextStatus === 'completed'
        ? completeSafetyCaseStage(linkedCase, 'action', '현장 관리자', `${intervention.title} 조치를 완료했습니다.`)
        : markSafetyCaseActionStarted(linkedCase, '현장 관리자', `${intervention.title} 조치를 시작했습니다.`);
      setSafetyCases(upsertSafetyCase(nextCase));
      setCaseNotice(`${nextCase.caseId} · ${nextStatus === 'completed' ? '보호조치 완료' : '보호조치 시작'}`);
      void saveSafetyCaseToServer(nextCase).catch(() => {
        // 원격 스키마 적용 전에도 로컬 폐루프는 유지한다.
      });
    }

    setHandoffPlans((previous) => {
      const nextPlans = previous.map((plan) =>
        plan.key === intervention.key
          ? { ...plan, status: nextStatus }
          : plan,
      );

      try {
        const raw = localStorage.getItem(PREDICTIVE_INTERVENTION_HANDOFF_KEY);
        const parsed = raw ? JSON.parse(raw) as PredictiveHandoffPayload : null;
        const payload: PredictiveHandoffPayload = {
          generatedAt: new Date().toISOString(),
          topRiskLabel: parsed?.topRiskLabel || '위험 인계',
          plans: nextPlans,
        };
        localStorage.setItem(PREDICTIVE_INTERVENTION_HANDOFF_KEY, JSON.stringify(payload));
        window.dispatchEvent(new Event(PREDICTIVE_INTERVENTION_HANDOFF_EVENT));
      } catch {
        // ignore storage failures
      }

      return nextPlans;
    });

    void postAdminJson<{ ok: boolean }>(
      '/api/admin/predictive-plan-status',
      {
        action: 'upsert',
        payload: {
          boardScope: 'intervention-coaching',
          planKey: intervention.key,
          caseId: intervention.caseId || null,
          status: nextStatus,
          updatedBy: '현장 관리자',
          workerName: intervention.workerName,
          jobField: intervention.jobField,
          actionTitle: intervention.title,
          dueLabel: intervention.timescale,
        },
      },
      { fallbackMessage: '보호조치 상태 저장 확인 필요' },
    ).catch(() => {
      // 서버 스키마 적용 전에는 로컬 사건 이력을 유지한다.
    });
  };

  const openLinkedReport = (record: SafetyCaseRecord) => {
    localStorage.setItem(SAFETY_CASE_FOCUS_KEY, record.caseId);
    setCaseNotice(`${record.caseId} 리포트 연결 대상으로 이동합니다.`);
    onNavigateToPage?.('reports');
  };

  const openLinkedTraining = (record: SafetyCaseRecord) => {
    localStorage.setItem(SAFETY_CASE_FOCUS_KEY, record.caseId);
    localStorage.setItem(SAFETY_CASE_TRAINING_HANDOFF_KEY, JSON.stringify({
      caseId: record.caseId,
      workerId: record.workerId || '',
      workerName: record.workerName,
      jobField: record.jobField,
      riskLabel: record.riskLabel,
      actionTitle: record.actionTitle,
      createdAt: new Date().toISOString(),
    }));
    setCaseNotice(`${record.caseId} 교육자료 작성 화면으로 이동합니다.`);
    onNavigateToPage?.('admin-training');
  };

  const priorityColors: Record<string, string> = {
    immediate: 'bg-red-100 border-red-300 text-red-800',
    medium: 'bg-amber-100 border-amber-300 text-amber-800',
    'long-term': 'bg-blue-100 border-blue-300 text-blue-800',
  };

  const priorityLabels: Record<string, string> = {
    immediate: '🔴 즉시조치 (당일)',
    medium: '🟠 중기조치 (3~7일)',
    'long-term': '🔵 학습조치 (2주+)',
  };

  const statusLabels: Record<NonNullable<Intervention['status']>, string> = {
    'not-started': '미착수',
    'in-progress': '보호조치 중',
    completed: '보호조치 완료',
  };

  const statusTone: Record<NonNullable<Intervention['status']>, string> = {
    'not-started': 'bg-slate-100 text-slate-700',
    'in-progress': 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
  };

  const completedCount = interventions.filter((item) => item.status === 'completed').length;
  const activeCount = interventions.filter((item) => item.status && item.status !== 'completed').length;
  const linkedCaseCount = interventions.filter((item) => item.caseId && caseById.has(item.caseId)).length;
  const closedCaseCount = interventions.filter((item) => (
    item.caseId ? caseById.get(item.caseId)?.status === 'closed' : false
  )).length;
  const topPriorityIntervention = useMemo(() => {
    const rank: Record<Intervention['priority'], number> = {
      immediate: 0,
      medium: 1,
      'long-term': 2,
    };

    const sorted = [...interventions].sort((a, b) => {
      const rankDiff = rank[a.priority] - rank[b.priority];
      if (rankDiff !== 0) return rankDiff;
      return 0;
    });

    return sorted.find((item) => item.status !== 'completed') || sorted[0] || null;
  }, [interventions]);

  const topPriorityActionLabel = topPriorityIntervention?.status === 'completed'
    ? '보호조치 완료'
    : topPriorityIntervention?.status === 'in-progress'
      ? '완료 처리'
      : '지정 및 기한 설정';

  const mobileInterventionBadge =
    interventions.length === 0
      ? { label: '데이터 없음', tone: 'bg-slate-700/40 text-slate-400 border border-slate-600/40' }
      : linkedCaseCount > 0 && closedCaseCount === linkedCaseCount
        ? { label: '✅ 보호 완료', tone: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' }
        : completedCount > 0
          ? { label: '🔄 후속 진행중', tone: 'bg-violet-500/20 text-violet-200 border border-violet-400/40' }
        : activeCount > 0
          ? { label: '🔵 진행중', tone: 'bg-blue-500/20 text-blue-200 border border-blue-400/40' }
          : { label: '🔴 대기중', tone: 'bg-rose-500/20 text-rose-200 border border-rose-400/40' };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in-up">
      {/* ── 8번 화면: 개입 추천 (모바일 전용) ── */}
      <div className="sm:hidden mb-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-300">8) 개입 추천</p>
            <h2 className="mt-1 text-lg font-black">코칭 개입 관리</h2>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${mobileInterventionBadge.tone}`}>{mobileInterventionBadge.label}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[
            { label: '예측 전달', value: liveInterventions.length, tone: liveInterventions.length > 0 ? 'text-indigo-300' : 'text-slate-400' },
            { label: '조치완료', value: completedCount, tone: completedCount > 0 ? 'text-emerald-300' : 'text-slate-400' },
            { label: '조치중', value: activeCount, tone: activeCount > 0 ? 'text-blue-300' : 'text-slate-400' },
            { label: '전체', value: interventions.length, tone: 'text-slate-300' },
          ].map((chip) => (
            <div key={chip.label} className="rounded-xl border border-slate-700 bg-slate-900/60 px-1.5 py-2 text-center">
              <p className="text-[9px] font-black text-slate-500">{chip.label}</p>
              <p className={`text-sm font-black ${chip.tone}`}>{chip.value}</p>
            </div>
          ))}
        </div>
        {topPriorityIntervention && (
          <div className="mt-3 rounded-xl border border-violet-700/40 bg-violet-900/30 px-3 py-2">
            <p className="text-[9px] font-black text-violet-300">즉시조치 TOP1</p>
            <p className="mt-1 text-xs font-black text-white truncate">{topPriorityIntervention.title}</p>
          </div>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => topPriorityIntervention && handleAssignAction(topPriorityIntervention)}
            disabled={!topPriorityIntervention || topPriorityIntervention.status === 'completed'}
            className="w-full min-h-[44px] rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {topPriorityActionLabel}
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">8) 개입 추천</p>
        <p className="mt-2 text-[11px] font-bold text-violet-700">
          {liveInterventions.length > 0
            ? `7번 예측 화면에서 전달된 ${liveInterventions.length}건을 우선순위대로 표시합니다.`
            : '7번 예측 화면에서 우선 개입 대상을 전달하면 이곳에 조치 카드가 생성됩니다.'}
        </p>

        {topPriorityIntervention && (
          <div className="mt-4 md:hidden sticky top-2 z-20 rounded-2xl border border-violet-200 bg-white/95 backdrop-blur px-3 py-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">8) 즉시조치 TOP1</p>
            <p className="mt-1 text-sm font-black text-slate-900">{topPriorityIntervention.title}</p>
            <p className="mt-1 text-[11px] font-bold text-slate-600">상태: {topPriorityIntervention.status ? statusLabels[topPriorityIntervention.status] : '대기'} · 완료 {completedCount}/{interventions.length}</p>
            <button
              onClick={() => handleAssignAction(topPriorityIntervention)}
              disabled={!topPriorityIntervention.key || topPriorityIntervention.status === 'completed'}
              className="mt-2 w-full rounded-xl bg-violet-600 px-3 py-2 text-[12px] font-black text-white transition-colors hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {topPriorityActionLabel}
            </button>
          </div>
        )}

        <p className="mt-3 text-[11px] font-bold text-violet-700">보호조치 상태: 진행 {activeCount}건 · 조치완료 {completedCount}건 · 전체 보호완료 {closedCaseCount}건</p>
        {caseNotice && (
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700">
            {caseNotice}
          </div>
        )}
        {focusedPlanKey && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[10px] font-black text-emerald-700">예측 화면에서 전달된 우선 개입 대상이 강조 표시되었습니다.</p>
          </div>
        )}
        <div className="mt-6 space-y-4">
          {interventions.length === 0 && (
            <div className="rounded-xl border border-dashed border-violet-200 bg-white/70 px-4 py-5 text-center">
              <p className="text-sm font-black text-slate-800">예측 전달 대기 중</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                선행 위험신호 화면에서 우선 개입 대상을 선택하면 담당자, 기한, 조치 카드가 이곳에 표시됩니다.
              </p>
            </div>
          )}
          {interventions.map((intervention, idx) => {
            const linkedCase = intervention.caseId ? caseById.get(intervention.caseId) : undefined;
            const nextStage = linkedCase ? getNextSafetyCaseStage(linkedCase) : null;
            const overdue = linkedCase ? isSafetyCaseOverdue(linkedCase) : false;
            return (
            <div
              key={intervention.key || idx}
              className={`rounded-xl border-2 px-4 py-3 ${priorityColors[intervention.priority]} ${focusedPlanKey && intervention.key === focusedPlanKey ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-black">{priorityLabels[intervention.priority]}</h3>
                {intervention.status && (
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black ${statusTone[intervention.status]}`}>
                    {statusLabels[intervention.status]}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold mb-1">{intervention.title}</p>
              <p className="text-[11px] font-medium opacity-90 mb-2">{intervention.reason}</p>
              <p className="text-[10px] font-semibold opacity-75 mb-1">기한: {intervention.timescale}</p>
              {intervention.assignee && (
                <p className="text-[10px] font-semibold opacity-75 mb-3">담당: {intervention.assignee}</p>
              )}
              {linkedCase && (
                <div className="mb-3 rounded-xl border border-white/70 bg-white/70 px-3 py-3 text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black text-indigo-700">{linkedCase.caseId}</p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${overdue ? 'bg-rose-100 text-rose-700' : linkedCase.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {overdue ? '기한 초과' : linkedCase.status === 'closed' ? '보호 완료' : nextStage ? `${SAFETY_CASE_STAGE_LABELS[nextStage]} 대기` : '진행 중'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                    {SAFETY_CASE_STAGE_ORDER.map((stage) => {
                      const done = Boolean(linkedCase.completedStages[stage]);
                      return (
                        <div key={stage} className={`rounded-lg border px-1.5 py-2 text-center text-[9px] font-black ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400'}`}>
                          <span className="block">{done ? '✓' : '○'}</span>
                          <span className="mt-0.5 block">{SAFETY_CASE_STAGE_LABELS[stage]}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {linkedCase.status === 'awaiting-report' && (
                      <button type="button" onClick={() => openLinkedReport(linkedCase)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 hover:bg-indigo-50">
                        리포트 연결하기
                      </button>
                    )}
                    {linkedCase.status === 'awaiting-training' && (
                      <button type="button" onClick={() => openLinkedTraining(linkedCase)} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-[11px] font-black text-violet-700 hover:bg-violet-50">
                        교육 연결하기
                      </button>
                    )}
                    {linkedCase.status === 'awaiting-acknowledgement' && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black leading-5 text-amber-700">
                        근로자가 교육 내용을 직접 확인하고 서명하면 자동으로 완료됩니다.
                      </div>
                    )}
                    {linkedCase.status === 'awaiting-reassessment' && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black leading-5 text-emerald-700">
                        근로자의 다음 평가 기록이 등록되면 자동으로 개선 여부를 연결합니다.
                      </div>
                    )}
                  </div>
                </div>
              )}
              <button
                onClick={() => handleAssignAction(intervention)}
                disabled={intervention.status === 'completed'}
                className="w-full px-3 py-2 bg-white/40 hover:bg-white/60 rounded-lg font-black text-xs transition-colors"
              >
                {intervention.status === 'completed'
                  ? '보호조치 완료'
                  : intervention.status === 'in-progress'
                    ? '완료 처리'
                    : '지정 및 기한 설정'}
              </button>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default InterventionCoaching;
