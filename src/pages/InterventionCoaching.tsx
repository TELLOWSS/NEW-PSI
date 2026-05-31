import React, { useMemo } from 'react';
import type { WorkerRecord } from '../../types';

interface Intervention {
  priority: 'immediate' | 'medium' | 'long-term';
  title: string;
  reason: string;
  timescale: string;
  assignee?: string;
}

interface InterventionCoachingProps {
  workerRecords?: WorkerRecord[];
}

export const InterventionCoaching: React.FC<InterventionCoachingProps> = ({ workerRecords = [] }) => {
  const mockInterventions: Intervention[] = useMemo(() => [
    {
      priority: 'immediate',
      title: '장비 안전 점검',
      reason: '최근 1주일 내 3건의 장비 관련 경고 누적',
      timescale: '당일 완료',
    },
    {
      priority: 'medium',
      title: '팀 회의 개최',
      reason: '팀 내 안전 문화 강화 필요',
      timescale: '3~7일 내',
    },
    {
      priority: 'long-term',
      title: '안전 교육 프로그램',
      reason: '새로운 공정 도입으로 지식 향상 필요',
      timescale: '2주 이상',
    },
  ], []);

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

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in-up">
      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">8) 개입 추천</p>
        <div className="mt-6 space-y-4">
          {mockInterventions.map((intervention, idx) => (
            <div
              key={idx}
              className={`rounded-xl border-2 px-4 py-3 ${priorityColors[intervention.priority]}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-black">{priorityLabels[intervention.priority]}</h3>
              </div>
              <p className="text-xs font-bold mb-1">{intervention.title}</p>
              <p className="text-[11px] font-medium opacity-90 mb-2">{intervention.reason}</p>
              <p className="text-[10px] font-semibold opacity-75 mb-3">기한: {intervention.timescale}</p>
              <button
                className="w-full px-3 py-2 bg-white/40 hover:bg-white/60 rounded-lg font-black text-xs transition-colors"
              >
                지정 및 기한 설정
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
