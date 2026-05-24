import React, { useMemo, useEffect, useState } from 'react';
import type { WorkerRecord } from '../types';

interface Intervention {
  key?: string;
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
  priority: '즉시' | '고' | '중';
  owner: string;
  workerName: string;
  jobField: string;
  teamLeader?: string;
  riskLabel: string;
  actionTitle: string;
  dueLabel: string;
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
}

export const InterventionCoaching: React.FC<InterventionCoachingProps> = ({ workerRecords = [] }) => {
  const [handoffPlans, setHandoffPlans] = useState<PredictiveHandoffPlan[]>([]);
  const [focusedPlanKey, setFocusedPlanKey] = useState<string | null>(null);
  const [mockInterventions, setMockInterventions] = useState<Intervention[]>([
    {
      key: 'mock-immediate',
      priority: 'immediate',
      title: '장비 안전 점검',
      reason: '최근 1주일 내 3건의 장비 관련 경고 누적',
      timescale: '당일 완료',
      status: 'not-started',
    },
    {
      key: 'mock-medium',
      priority: 'medium',
      title: '팀 회의 개최',
      reason: '팀 내 안전 문화 강화 필요',
      timescale: '3~7일 내',
      status: 'not-started',
    },
    {
      key: 'mock-long-term',
      priority: 'long-term',
      title: '안전 교육 프로그램',
      reason: '새로운 공정 도입으로 지식 향상 필요',
      timescale: '2주 이상',
      status: 'not-started',
    },
  ]);

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

  const interventions = liveInterventions.length > 0 ? liveInterventions : mockInterventions;

  useEffect(() => {
    if (!focusedPlanKey) return;
    const exists = interventions.some((item) => item.key === focusedPlanKey);
    if (!exists) {
      setFocusedPlanKey(null);
    }
  }, [focusedPlanKey, interventions]);

  const getNextStatus = (status?: Intervention['status']): NonNullable<Intervention['status']> => {
    if (status === 'in-progress') return 'completed';
    if (status === 'completed') return 'completed';
    return 'in-progress';
  };

  const handleAssignAction = (intervention: Intervention) => {
    const nextStatus = getNextStatus(intervention.status);

    if (!intervention.key) return;

    if (liveInterventions.length === 0) {
      setMockInterventions((previous) => previous.map((item) => (
        item.key === intervention.key
          ? { ...item, status: nextStatus }
          : item
      )));
      return;
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
    'in-progress': '진행중',
    completed: '완료',
  };

  const statusTone: Record<NonNullable<Intervention['status']>, string> = {
    'not-started': 'bg-slate-100 text-slate-700',
    'in-progress': 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
  };

  const completedCount = interventions.filter((item) => item.status === 'completed').length;
  const activeCount = interventions.filter((item) => item.status && item.status !== 'completed').length;
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
    ? '완료됨'
    : topPriorityIntervention?.status === 'in-progress'
      ? '완료 처리'
      : '지정 및 기한 설정';

  const mobileInterventionBadge =
    interventions.length === 0
      ? { label: '데이터 없음', tone: 'bg-slate-700/40 text-slate-400 border border-slate-600/40' }
      : completedCount === interventions.length
        ? { label: '✅ 전체 완료', tone: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' }
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
            { label: '완료', value: completedCount, tone: completedCount > 0 ? 'text-emerald-300' : 'text-slate-400' },
            { label: '진행중', value: activeCount, tone: activeCount > 0 ? 'text-blue-300' : 'text-slate-400' },
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
            : '예측 전달 데이터가 없어 기본 개입 템플릿을 표시합니다.'}
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

        <p className="mt-3 text-[11px] font-bold text-violet-700">진행 상태: 활성 {activeCount}건 · 완료 {completedCount}건</p>
        {focusedPlanKey && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[10px] font-black text-emerald-700">예측 화면에서 전달된 우선 개입 대상이 강조 표시되었습니다.</p>
          </div>
        )}
        <div className="mt-6 space-y-4">
          {interventions.map((intervention, idx) => (
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
              <button
                onClick={() => handleAssignAction(intervention)}
                disabled={intervention.status === 'completed'}
                className="w-full px-3 py-2 bg-white/40 hover:bg-white/60 rounded-lg font-black text-xs transition-colors"
              >
                {intervention.status === 'completed'
                  ? '완료됨'
                  : intervention.status === 'in-progress'
                    ? '완료 처리'
                    : '지정 및 기한 설정'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InterventionCoaching;
