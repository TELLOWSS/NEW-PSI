# 📋 Phase 4: 모바일 신규 화면 완성 (2026-05-23~24)

**목표**: 5번 컨텍스트, 9번 입력 화면 기능 완성  
**담당**: AI Agent  
**예상 소요**: 8시간

---

## 📌 Phase 4 상세 체크리스트

### 4-1. 5번 현장 컨텍스트 화면 (240분)

#### 4-1-1. 파일 생성 또는 확인
**파일**: pages/FieldContextInput.tsx

```bash
# 파일 존재 여부 확인
ls -la pages/FieldContextInput.tsx
```

- [ ] 없으면 신규 생성 (아래 4-1-2 참조)
- [ ] 있으면 기존 내용 검토

#### 4-1-2. 신규 생성 (없을 경우)

```tsx
// pages/FieldContextInput.tsx
import React, { useState, useEffect } from 'react';

interface FieldContext {
  id: string;
  processName: string; // 공정명
  weather: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | null;
  workerCount: number | null; // 현장 인원
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  specialNotes: string;
  savedAt: string | null;
}

export default function FieldContextInput() {
  const [context, setContext] = useState<FieldContext>(() => {
    const saved = localStorage.getItem('psi_field_context_v1');
    return saved ? JSON.parse(saved) : {
      id: `context_${Date.now()}`,
      processName: '',
      weather: null,
      workerCount: null,
      timeOfDay: null,
      specialNotes: '',
      savedAt: null,
    };
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // 필수 필드 검증
  const isFormValid = context.processName.trim() !== '' && context.workerCount !== null;

  const handleSave = async () => {
    if (!isFormValid) {
      setErrorMessage('공정명과 인원은 필수입니다.');
      setErrorMessage('');
      return;
    }

    try {
      setSaveStatus('saving');
      setErrorMessage('');

      // 저장 시뮬레이션 (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));

      const updated = { ...context, savedAt: new Date().toISOString() };
      localStorage.setItem('psi_field_context_v1', JSON.stringify(updated));
      setContext(updated);

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      setErrorMessage('저장에 실패했습니다. 다시 시도해주세요.');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const weatherOptions = [
    { value: 'sunny', label: '☀️ 맑음' },
    { value: 'cloudy', label: '☁️ 흐림' },
    { value: 'rainy', label: '🌧️ 비' },
    { value: 'snowy', label: '❄️ 눈' },
  ];

  const timeOfDayOptions = [
    { value: 'morning', label: '🌅 아침 (6~10시)' },
    { value: 'afternoon', label: '☀️ 점심 (11~14시)' },
    { value: 'evening', label: '🌆 저녁 (15~18시)' },
    { value: 'night', label: '🌙 야간 (19~23시)' },
  ];

  const lastSavedTime = context.savedAt 
    ? new Date(context.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 rounded-2xl border border-teal-300 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/30 dark:to-cyan-900/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-300">📍 현장 컨텍스트</p>
            <p className="mt-1 text-sm font-black text-teal-800 dark:text-teal-100">현재 작업 환경 기록</p>
            {lastSavedTime && (
              <p className="mt-0.5 text-xs font-medium text-teal-700 dark:text-teal-200">
                ✓ 마지막 저장: {lastSavedTime}
              </p>
            )}
          </div>
          <div className={`px-3 py-1.5 rounded-full text-[10px] font-black ${
            saveStatus === 'saving' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
            saveStatus === 'saved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
            saveStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
            'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300'
          }`}>
            {saveStatus === 'saving' ? '저장 중...' :
             saveStatus === 'saved' ? '저장됨' :
             saveStatus === 'error' ? '저장 실패' :
             '준비 완료'}
          </div>
        </div>
      </div>

      {/* 오류 메시지 */}
      {errorMessage && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-xs font-black text-red-700 dark:text-red-300">⚠️ {errorMessage}</p>
        </div>
      )}

      {/* 폼 */}
      <div className="space-y-3">
        {/* 공정명 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            공정명 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={context.processName}
            onChange={(e) => setContext({ ...context, processName: e.target.value })}
            placeholder="예: 철근 배근, 콘크리트 타설"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>

        {/* 날씨 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            날씨
          </label>
          <div className="grid grid-cols-2 gap-2">
            {weatherOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setContext({ ...context, weather: option.value as any })}
                className={`py-2 px-3 rounded-lg text-xs font-black transition-colors ${
                  context.weather === option.value
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 현장 인원 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            현장 인원 <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setContext({ ...context, workerCount: Math.max(0, (context.workerCount || 0) - 1) })}
              className="min-h-[44px] min-w-[44px] rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black"
            >
              −
            </button>
            <input
              type="number"
              value={context.workerCount ?? ''}
              onChange={(e) => setContext({ ...context, workerCount: parseInt(e.target.value) || null })}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-center text-sm font-black text-slate-800 dark:text-slate-200"
            />
            <button
              type="button"
              onClick={() => setContext({ ...context, workerCount: (context.workerCount || 0) + 1 })}
              className="min-h-[44px] min-w-[44px] rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black"
            >
              +
            </button>
          </div>
        </div>

        {/* 시간대 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            시간대
          </label>
          <div className="grid grid-cols-1 gap-2">
            {timeOfDayOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setContext({ ...context, timeOfDay: option.value as any })}
                className={`py-2.5 px-3 rounded-lg text-xs font-black transition-colors text-left ${
                  context.timeOfDay === option.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 특수 상황 메모 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            특수 상황 기록 (선택)
          </label>
          <textarea
            value={context.specialNotes}
            onChange={(e) => setContext({ ...context, specialNotes: e.target.value })}
            placeholder="예: 야간 작업 추가, 신입 근로자 배치"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 resize-none"
            rows={3}
          />
        </div>
      </div>

      {/* CTA 버튼 */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!isFormValid || saveStatus === 'saving'}
        className={`w-full min-h-[44px] rounded-xl font-black text-white transition-all ${
          isFormValid && saveStatus !== 'saving'
            ? 'bg-green-500 hover:bg-green-600 active:scale-95'
            : 'bg-slate-300 cursor-not-allowed opacity-50'
        }`}
      >
        {saveStatus === 'saving' ? '저장 중...' : '저장'}
      </button>
    </div>
  );
}
```

- [ ] 파일 생성 위치: `pages/FieldContextInput.tsx`
- [ ] 라인 수: ~200줄
- [ ] localStorage 키: `psi_field_context_v1`

#### 4-1-3. 라우팅 연결
**파일**: App.tsx 또는 라우팅 설정 파일

- [ ] 경로 추가: `/field-context-input` → FieldContextInput.tsx
- [ ] 네비게이션 메뉴에 "현장 컨텍스트" 추가

#### 4-1-4. 검증
- [ ] 폼 필수값 채우지 않으면 저장 버튼 비활성화
- [ ] 저장 중 상태 표시 (1초 애니메이션)
- [ ] 저장 후 마지막 저장 시각 표시
- [ ] 페이지 새로고침 후 데이터 복원 확인

---

### 4-2. 9번 수기 데이터 입력 화면 (240분)

#### 4-2-1. 파일 생성 또는 확인
**파일**: pages/JudgmentTaggingInput.tsx

```bash
# 파일 존재 여부 확인
ls -la pages/JudgmentTaggingInput.tsx
```

#### 4-2-2. 신규 생성 (없을 경우)

```tsx
// pages/JudgmentTaggingInput.tsx
import React, { useState, useMemo } from 'react';

interface TaggingEntry {
  id: string;
  rawText: string;
  riskCategory: string | null;
  judgmentTags: string[];
  recommendedAction: string;
  consensusStatus: 'pending' | 'agreed' | 'disputed';
  createdAt: string;
}

const RISK_CATEGORIES = [
  '추락',
  '낙하물',
  '협착',
  '감전',
  '화상',
  '독성',
  '에르고노믹스',
  '기타',
];

const JUDGMENT_TAGS = [
  '안전 절차 위반',
  '보호장비 미착용',
  '환경 위험',
  '작업 강도 과다',
  '피로 상태',
  '의사소통 부족',
  '감시 부족',
  '교육 부족',
];

export default function JudgmentTaggingInput() {
  const [entries, setEntries] = useState<TaggingEntry[]>(() => {
    const saved = localStorage.getItem('psi_tagging_entries_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [formData, setFormData] = useState({
    rawText: '',
    riskCategory: null as string | null,
    judgmentTags: [] as string[],
    recommendedAction: '',
  });

  // 필수 필드 검증
  const validation = useMemo(() => ({
    rawText: formData.rawText.trim().length > 0,
    riskCategory: formData.riskCategory !== null,
    judgmentTags: formData.judgmentTags.length > 0,
    recommendedAction: formData.recommendedAction.trim().length > 0,
  }), [formData]);

  const isFormValid = Object.values(validation).every(v => v);

  const completionStats = useMemo(() => {
    const total = entries.length;
    const agreed = entries.filter(e => e.consensusStatus === 'agreed').length;
    const disputed = entries.filter(e => e.consensusStatus === 'disputed').length;
    const pending = entries.filter(e => e.consensusStatus === 'pending').length;
    
    return {
      total,
      agreed,
      disputed,
      pending,
      completionPercent: total > 0 ? Math.round((agreed / total) * 100) : 0,
    };
  }, [entries]);

  const handleAddEntry = () => {
    if (!isFormValid) return;

    const newEntry: TaggingEntry = {
      id: `tagging_${Date.now()}`,
      rawText: formData.rawText,
      riskCategory: formData.riskCategory!,
      judgmentTags: formData.judgmentTags,
      recommendedAction: formData.recommendedAction,
      consensusStatus: 'pending',
      createdAt: new Date().toISOString(),
    };

    const updated = [...entries, newEntry];
    setEntries(updated);
    localStorage.setItem('psi_tagging_entries_v1', JSON.stringify(updated));

    // 폼 초기화
    setFormData({
      rawText: '',
      riskCategory: null,
      judgmentTags: [],
      recommendedAction: '',
    });
  };

  const handleTagToggle = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      judgmentTags: prev.judgmentTags.includes(tag)
        ? prev.judgmentTags.filter(t => t !== tag)
        : [...prev.judgmentTags, tag],
    }));
  };

  const handleStatusChange = (entryId: string, status: TaggingEntry['consensusStatus']) => {
    setEntries(prev => 
      prev.map(entry => 
        entry.id === entryId ? { ...entry, consensusStatus: status } : entry
      ).slice(-20) // 최근 20개만 유지
    );
    localStorage.setItem('psi_tagging_entries_v1', JSON.stringify(entries));
  };

  return (
    <div className="space-y-4">
      {/* 진행 상태 카드 */}
      <div className="sticky top-0 z-10 rounded-2xl border border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-600 dark:text-purple-300">✍️ 수기 데이터 입력</p>
            <p className="mt-1 text-sm font-black text-purple-800 dark:text-purple-100">
              누적 {completionStats.total}건 | 검증 완료 {completionStats.agreed}건
            </p>
            <div className="mt-2 w-full h-2 bg-purple-200 dark:bg-purple-900/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${completionStats.completionPercent}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-purple-700 dark:text-purple-300">
              완료율: {completionStats.completionPercent}% | 대기중: {completionStats.pending}건
            </p>
          </div>
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 space-y-3">
        {/* 원문 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            원문 텍스트 <span className="text-red-500">*</span>
            <span className={`float-right text-[10px] ${validation.rawText ? 'text-green-600' : 'text-red-600'}`}>
              {validation.rawText ? '✓' : '필수'}
            </span>
          </label>
          <textarea
            value={formData.rawText}
            onChange={(e) => setFormData({ ...formData, rawText: e.target.value })}
            placeholder="현장 관찰 내용을 자유롭게 입력하세요..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 resize-none"
            rows={3}
          />
        </div>

        {/* 위험 분류 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            위험 분류 <span className="text-red-500">*</span>
            <span className={`float-right text-[10px] ${validation.riskCategory ? 'text-green-600' : 'text-red-600'}`}>
              {validation.riskCategory ? '✓' : '필수'}
            </span>
          </label>
          <select
            value={formData.riskCategory ?? ''}
            onChange={(e) => setFormData({ ...formData, riskCategory: e.target.value || null })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="">-- 선택 --</option>
            {RISK_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* 판단 태그 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            판단 태그 (복수 선택) <span className="text-red-500">*</span>
            <span className={`float-right text-[10px] ${validation.judgmentTags ? 'text-green-600' : 'text-red-600'}`}>
              {validation.judgmentTags ? '✓' : '필수'}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {JUDGMENT_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagToggle(tag)}
                className={`py-2 px-2.5 rounded-lg text-[10px] font-black transition-colors text-left ${
                  formData.judgmentTags.includes(tag)
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
                }`}
              >
                {formData.judgmentTags.includes(tag) ? '✓ ' : ''}{tag}
              </button>
            ))}
          </div>
        </div>

        {/* 권장 조치 */}
        <div>
          <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
            권장 조치 <span className="text-red-500">*</span>
            <span className={`float-right text-[10px] ${validation.recommendedAction ? 'text-green-600' : 'text-red-600'}`}>
              {validation.recommendedAction ? '✓' : '필수'}
            </span>
          </label>
          <textarea
            value={formData.recommendedAction}
            onChange={(e) => setFormData({ ...formData, recommendedAction: e.target.value })}
            placeholder="권장하는 개입 방법을 기술하세요..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 resize-none"
            rows={2}
          />
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleAddEntry}
          disabled={!isFormValid}
          className={`w-full min-h-[44px] rounded-xl font-black text-white transition-all ${
            isFormValid
              ? 'bg-green-500 hover:bg-green-600 active:scale-95'
              : 'bg-slate-300 cursor-not-allowed opacity-50'
          }`}
        >
          입력 완료 →
        </button>
      </div>

      {/* 입력 기록 리스트 */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black text-slate-700 dark:text-slate-300">최근 입력 기록</h3>
          {entries.slice(-5).reverse().map(entry => (
            <div key={entry.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-[11px]">
              <p className="font-black text-slate-800 dark:text-slate-100 truncate">{entry.rawText}</p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">분류: {entry.riskCategory}</p>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {entry.judgmentTags.map(tag => (
                    <span key={tag} className="inline-block px-1.5 py-0.5 rounded bg-indigo-200 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                      {tag}
                    </span>
                  ))}
                </div>
                <select
                  value={entry.consensusStatus}
                  onChange={(e) => handleStatusChange(entry.id, e.target.value as any)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  <option value="pending">대기중</option>
                  <option value="agreed">인정</option>
                  <option value="disputed">분쟁</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] 파일 생성 위치: `pages/JudgmentTaggingInput.tsx`
- [ ] 라인 수: ~250줄
- [ ] localStorage 키: `psi_tagging_entries_v1`

#### 4-2-3. 라우팅 연결
**파일**: App.tsx 또는 라우팅 설정 파일

- [ ] 경로 추가: `/judgment-tagging-input` → JudgmentTaggingInput.tsx
- [ ] 네비게이션 메뉴에 "수기 데이터 입력" 추가

#### 4-2-4. 검증
- [ ] 4개 필수 필드 모두 채워야 "입력 완료" 버튼 활성화
- [ ] 각 필수 필드 옆에 ✓ 또는 필수 표시
- [ ] 입력 후 폼 초기화 확인
- [ ] 입력 기록 최대 20개 유지
- [ ] localStorage 지속성 확인

---

### 4-3. 동선 정렬 (60분)

#### 4-3-1. 네비게이션 메뉴 업데이트
**파일**: 네비게이션 컴포넌트 (예: App.tsx, Navigation.tsx)

- [ ] 12화면 모두 접근 가능하도록 메뉴 구성
  ```
  1. 홈 → /dashboard
  2. 경보 → /site-issue-management
  3. 프로파일 → /worker-management
  4. 진단 → /worker-training
  5. 컨텍스트 → /field-context-input
  6. 패턴 → /safety-behavior-management
  7. 예측 → /predictive-analysis
  8. 개입 → /intervention-coaching
  9. 입력 → /judgment-tagging-input
  10. 검증 → /ocr-analysis
  11. 리포트 → /reports
  12. 설정 → /settings
  ```

#### 4-3-2. Introduction 스크린에서 12화면 진입 확인
**파일**: pages/Introduction.tsx

- [ ] 기존 12개 feature card가 모두 올바른 페이지로 연결되는지 확인
- [ ] 각 카드 클릭 → 해당 화면으로 이동 확인

---

## 🔍 구체적 검증 방법

### Phase 4 완료 시 검증 항목

1. **빌드 검증**
   ```bash
   npm run build 2>&1
   # 예상: ✅ PASS, 0 errors
   ```

2. **5번 컨텍스트 화면**
   - [ ] 필수 필드 2개 (공정명, 인원) 채워야만 저장 버튼 활성화
   - [ ] 저장 중 상태 표시 (1초)
   - [ ] 저장 후 마지막 저장 시각 표시
   - [ ] localStorage 저장 확인
   - [ ] 페이지 새로고침 후 데이터 복원

3. **9번 입력 화면**
   - [ ] 4가지 필수 필드 모두 상태 아이콘 표시 (✓/필수)
   - [ ] 모든 필드 작성 후에만 "입력 완료" 활성화
   - [ ] 입력 후 폼 초기화
   - [ ] 최근 5개 기록 표시
   - [ ] 상태 변경 (대기중/인정/분쟁) 가능
   - [ ] 완료율 바 동적 업데이트

4. **동선 연결**
   - [ ] 각 화면에서 다른 화면으로 이동 가능
   - [ ] 뒤로가기 버튼 작동
   - [ ] 12화면 모두 Introduction에서 접근 가능

---

## 📊 변경 파일 요약

| 파일 | 변경 사항 | 라인 수 |
|------|----------|--------|
| pages/FieldContextInput.tsx | 신규 생성 | 200줄 |
| pages/JudgmentTaggingInput.tsx | 신규 생성 | 250줄 |
| App.tsx (또는 라우팅) | 경로 2개 추가 | 10줄 |
| Navigation.tsx | 메뉴 2개 추가 | 10줄 |

**예상 총 수정**: 470줄

---

## ⏹️ 중단된 경우 재개 방법

**상태 확인**:
- [ ] 4-1 (5번 컨텍스트) 완료?
- [ ] 4-2 (9번 입력) 완료?
- [ ] 4-3 (동선 정렬) 완료?

**미완료 항목부터 재개**

---

**상태**: 📋 대기 중 (Phase 3 완료 후 시작)
