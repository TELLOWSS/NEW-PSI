import React, { useState } from 'react';

interface FieldContext {
  fieldName: string;
  weather: 'clear' | 'cloudy' | 'rainy' | 'snowy';
  personnel: number;
  timeOfDay: 'morning' | 'lunch' | 'evening' | 'night';
  specialNotes: string;
  savedAt?: string;
}

export const FieldContextInput: React.FC = () => {
  const [context, setContext] = useState<FieldContext>({
    fieldName: '',
    weather: 'clear',
    personnel: 1,
    timeOfDay: 'morning',
    specialNotes: '',
  });
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    const saved: FieldContext = {
      ...context,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem('fieldContext', JSON.stringify(saved));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const weatherOptions: Record<string, string> = {
    clear: '☀️ 맑음',
    cloudy: '⛅ 흐림',
    rainy: '🌧️ 비',
    snowy: '❄️ 눈',
  };

  const timeOptions: Record<string, string> = {
    morning: '🌅 아침',
    lunch: '🌤️ 점심',
    evening: '🌆 저녁',
    night: '🌙 야간',
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in-up">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700">5) 현장 컨텍스트 입력</p>
        <div className="mt-6 space-y-4">
          {/* 공정명 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">공정명</label>
            <input
              type="text"
              value={context.fieldName}
              onChange={(e) => setContext({ ...context, fieldName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-400 outline-none"
              placeholder="예: 철골공사, 콘크리트 타설"
            />
          </div>

          {/* 날씨 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">날씨</label>
            <select
              value={context.weather}
              onChange={(e) => setContext({ ...context, weather: e.target.value as FieldContext['weather'] })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-400 outline-none"
            >
              {Object.entries(weatherOptions).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* 인원 수 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">현장 인원 (명)</label>
            <input
              type="number"
              min="1"
              value={context.personnel}
              onChange={(e) => setContext({ ...context, personnel: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-400 outline-none"
              placeholder="0"
            />
          </div>

          {/* 시간대 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">시간대</label>
            <select
              value={context.timeOfDay}
              onChange={(e) => setContext({ ...context, timeOfDay: e.target.value as FieldContext['timeOfDay'] })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-400 outline-none"
            >
              {Object.entries(timeOptions).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* 특수 상황 기록 */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">특수 상황 기록</label>
            <textarea
              value={context.specialNotes}
              onChange={(e) => setContext({ ...context, specialNotes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-400 outline-none resize-none"
              rows={3}
              placeholder="예: 악천후, 신규 근로자 배치, 장비 고장 등"
            />
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            className={`w-full px-4 py-3 rounded-lg font-black text-white transition-all ${
              isSaved
                ? 'bg-emerald-600 text-emerald-100'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isSaved ? '✓ 저장됨' : '저장'}
          </button>
        </div>

        {context.savedAt && (
          <p className="mt-3 text-[10px] text-slate-600">
            마지막 저장: {new Date(context.savedAt).toLocaleTimeString('ko-KR')}
          </p>
        )}
      </div>
    </div>
  );
};
