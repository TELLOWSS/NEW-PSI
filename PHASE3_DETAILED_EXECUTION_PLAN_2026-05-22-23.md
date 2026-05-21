# 📋 Phase 3: 모바일 P0 (2/4/8번) 핵심 리모델링 (2026-05-22~23)

**목표**: 사용자 체감 개선 (상단 고정 카드 + 명확한 CTA)  
**담당**: AI Agent  
**예상 소요**: 6시간

---

## 📌 Phase 3 상세 체크리스트

### 3-1. 2번 경보 알림 강화 (120분)

#### 3-1-1. 파일 확인
**파일**: pages/SiteIssueManagement.tsx

- [ ] **핵심 섹션 찾기**
  - 진행도 표시: 라인 406~440 (이미 추가됨, 2026-05-21)
  - 경보 리스트: 라인 440~600 (예상)
  - 상태 요약: 라인 300~406 (예상)

#### 3-1-2. 상단 고정 카드 추가 (sticky)
**위치**: 진행도 표시 위에 추가

```tsx
// 추가할 코드 (라인 ~380):
{issueSummary && issueSummary.pendingCount > 0 && (
  <div className="sticky top-0 z-20 rounded-2xl border border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 p-4 shadow-lg mb-4">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">🔴 즉시 조치 대상</p>
        <p className="mt-1 text-sm font-black text-orange-800 dark:text-orange-100">
          심각도 높음 {issueSummary.pendingCount}건
        </p>
        <p className="mt-0.5 text-xs font-medium text-orange-700 dark:text-orange-200">
          {issueSummary.inProgressCount}건 처리 중, {issueSummary.completedCount}건 완료
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          // 스크롤 다운 또는 조치 화면 이동
          setCurrentPage('intervention-coaching');
        }}
        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm transition-colors"
      >
        조치 시작 →
      </button>
    </div>
  </div>
)}
```

- [ ] 조건: `issueSummary.pendingCount > 0` (미처리 경보 있을 때만)
- [ ] 색상: 🟠 Orange (심각도 강조)
- [ ] 버튼: "조치 시작" → InterventionCoaching 이동

#### 3-1-3. 진행도 색상 분류 명확화
**현재 코드 확인** (라인 406~440)

- [ ] **3가지 상태 색상 추가**
  ```tsx
  // 기존에 추가:
  <div className="grid grid-cols-3 gap-2 sm:gap-3">
    <div className="rounded-lg bg-slate-100 dark:bg-slate-700 p-3 text-center">
      <p className="text-[10px] font-black text-slate-600 dark:text-slate-300">미검토</p>
      <p className="mt-1 text-lg font-black text-slate-700 dark:text-slate-200">{issueSummary.pendingCount}</p>
    </div>
    <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-3 text-center">
      <p className="text-[10px] font-black text-amber-600 dark:text-amber-300">처리중</p>
      <p className="mt-1 text-lg font-black text-amber-700 dark:text-amber-200">{issueSummary.inProgressCount}</p>
    </div>
    <div className="rounded-lg bg-green-100 dark:bg-green-900/40 p-3 text-center">
      <p className="text-[10px] font-black text-green-600 dark:text-green-300">완료</p>
      <p className="mt-1 text-lg font-black text-green-700 dark:text-green-200">{issueSummary.completedCount}</p>
    </div>
  </div>
  ```
  
  - [ ] 미검토: 회색 (😐 중립)
  - [ ] 처리중: 황색 (⚠️ 주의)
  - [ ] 완료: 초록 (✅ 성공)

#### 3-1-4. 검증
- [ ] 상단 고정 카드 sticky 속성 확인 (스크롤 시 고정)
- [ ] 버튼 단락 확인 (44x44px 이상)
- [ ] 색상 대비 WCAG AA 준수

---

### 3-2. 4번 진단 강화 (120분)

#### 3-2-1. 파일 확인
**파일**: pages/WorkerTraining.tsx

- [ ] **구조 파악**
  - 진단 폼: 라인 ? (코드 읽기)
  - 진행 상태: 라인 ? (코드 읽기)
  - CTA 버튼: 라인 ? (코드 읽기)

**검색 명령**:
```bash
grep -n "progress\|completed\|stage\|step" pages/WorkerTraining.tsx | head -20
```

#### 3-2-2. 상단 카드 추가 - 진행률 표시
```tsx
// 추가할 코드 (페이지 상단 고정):
const [completionStage, setCompletionStage] = useState(2); // 예: 2/4 단계 완료
const totalStages = 4;
const completionPercent = Math.round((completionStage / totalStages) * 100);

// 렌더링:
{completionStage < totalStages && (
  <div className="sticky top-0 z-20 rounded-2xl border border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-4 shadow-lg mb-4">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">📋 진단 진행 상태</p>
        <p className="mt-1 text-sm font-black text-blue-800 dark:text-blue-100">
          완료 단계: {completionStage} / {totalStages}
        </p>
        <div className="mt-2 w-full h-2 bg-blue-200 dark:bg-blue-900/50 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          // 다음 단계로 이동
          setCompletionStage(Math.min(completionStage + 1, totalStages));
        }}
        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-black text-sm transition-colors"
      >
        다음 양식 →
      </button>
    </div>
  </div>
)}
```

- [ ] 조건: `completionStage < totalStages` (진행 중일 때만)
- [ ] 색상: 🔵 Blue (진단)
- [ ] 버튼: "다음 양식" → 다음 입력 필드로 자동 스크롤 또는 페이지 이동

#### 3-2-3. 4단계별 진행 상태 매핑
- [ ] 1단계: 기본 정보 입력
- [ ] 2단계: 위험 요소 선택
- [ ] 3단계: 개입 방법 선택
- [ ] 4단계: 완료 및 승인 대기

#### 3-2-4. CTA 버튼 명확화
```tsx
// 각 단계별 버튼 텍스트:
const getNextCtaLabel = () => {
  switch (completionStage) {
    case 1: return '위험 요소 선택 →';
    case 2: return '개입 방법 선택 →';
    case 3: return '진단 완료 및 승인 대기 →';
    default: return '진단 완료됨';
  }
};
```

- [ ] 각 단계별 명확한 액션 제시

#### 3-2-5. 검증
- [ ] 진행률 바 애니메이션 부드러운지 확인
- [ ] 버튼 클릭 후 단계 증가 확인
- [ ] 마지막 단계에서 버튼 비활성화 또는 텍스트 변경

---

### 3-3. 8번 개입 강화 (120분)

#### 3-3-1. 파일 확인 및 생성
**파일**: pages/InterventionCoaching.tsx (또는 신규)

- [ ] **파일 존재 확인**
  ```bash
  ls -la pages/Intervention* pages/intervention*
  ```

- [ ] 없으면 신규 생성 (아래 3-3-2 참조)

#### 3-3-2. 상단 고정 카드 추가 - TOP1 조치

```tsx
// pages/InterventionCoaching.tsx 상단:
import React, { useState, useMemo } from 'react';
import { Page } from '../types';

interface InterventionItem {
  id: string;
  title: string;
  reason: string;
  type: 'immediate' | 'medium' | 'learning'; // 즉시/중기/학습
  status: 'pending' | 'in-progress' | 'completed';
}

export default function InterventionCoaching() {
  const [interventions, setInterventions] = useState<InterventionItem[]>([
    {
      id: '1',
      title: '장비 검사',
      reason: '안전 점검 기록 누락',
      type: 'immediate',
      status: 'pending',
    },
  ]);

  const topIntervention = useMemo(() => interventions[0], [interventions]);

  const handleInterventionStatusChange = (id: string, status: InterventionItem['status']) => {
    setInterventions(prev => 
      prev.map(item => 
        item.id === id ? { ...item, status } : item
      )
    );
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'immediate': return { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-200', label: '🔴 즉시조치' };
      case 'medium': return { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-200', label: '🟠 중기조치' };
      case 'learning': return { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-200', label: '🟢 학습조치' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', label: '미분류' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '미착수';
      case 'in-progress': return '진행중';
      case 'completed': return '완료';
      default: return '상태 불명';
    }
  };

  const typeColor = getTypeColor(topIntervention.type);
  const statusButtonColor = topIntervention.status === 'pending' 
    ? 'bg-orange-500 hover:bg-orange-600'
    : topIntervention.status === 'in-progress'
      ? 'bg-blue-500 hover:bg-blue-600'
      : 'bg-green-500 hover:bg-green-600';

  return (
    <div className="space-y-4">
      {/* 상단 고정 카드 */}
      <div className="sticky top-0 z-20 rounded-2xl border border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">🎯 즉시 조치 추천</p>
            <p className="mt-1 text-sm font-black text-orange-800 dark:text-orange-100">{topIntervention.title}</p>
            <p className="mt-0.5 text-xs font-medium text-orange-700 dark:text-orange-200">{topIntervention.reason}</p>
            <div className="mt-2">
              <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${typeColor.bg} ${typeColor.text}`}>
                {typeColor.label}
              </span>
              <span className="ml-2 text-xs font-black text-orange-600 dark:text-orange-300">
                현재 상태: {getStatusLabel(topIntervention.status)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              // 상태 순환: pending → in-progress → completed → pending
              const nextStatus: InterventionItem['status'] = 
                topIntervention.status === 'pending' ? 'in-progress' :
                topIntervention.status === 'in-progress' ? 'completed' :
                'pending';
              handleInterventionStatusChange(topIntervention.id, nextStatus);
            }}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl ${statusButtonColor} text-white font-black text-sm transition-colors`}
          >
            {topIntervention.status === 'pending' ? '지정' :
             topIntervention.status === 'in-progress' ? '완료' :
             '다시 시작'} →
          </button>
        </div>
      </div>

      {/* 하단: 나머지 조치 리스트 (옵션) */}
      {interventions.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-300">추가 조치</h3>
          {interventions.slice(1).map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{item.title}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] 위치: pages/InterventionCoaching.tsx (신규 또는 기존 파일 확장)
- [ ] 상태: pending → in-progress → completed 순환
- [ ] 버튼: "지정" → "완료" → "다시 시작"

#### 3-3-3. 즉시/중기/학습 3가지 조치 유형 표시
```tsx
// 추가 섹션 (상단 고정 카드 아래):
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
  {/* 즉시조치 */}
  <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-4">
    <p className="text-xs font-black text-red-600 dark:text-red-300">🔴 즉시조치</p>
    <p className="mt-1 text-sm font-black text-red-700 dark:text-red-200">장비 검사, 인원 배치</p>
    <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">오늘 내</p>
  </div>
  
  {/* 중기조치 */}
  <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-900/20 p-4">
    <p className="text-xs font-black text-orange-600 dark:text-orange-300">🟠 중기조치</p>
    <p className="mt-1 text-sm font-black text-orange-700 dark:text-orange-200">팀 회의, 프로세스 개선</p>
    <p className="mt-0.5 text-[11px] text-orange-600 dark:text-orange-400">3~7일</p>
  </div>
  
  {/* 학습조치 */}
  <div className="rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 p-4">
    <p className="text-xs font-black text-green-600 dark:text-green-300">🟢 학습조치</p>
    <p className="mt-1 text-sm font-black text-green-700 dark:text-green-200">교육 프로그램, 의식개선</p>
    <p className="mt-0.5 text-[11px] text-green-600 dark:text-green-400">2주 이상</p>
  </div>
</div>
```

#### 3-3-4. 검증
- [ ] 상단 고정 카드에서 TOP1 조치 표시 확인
- [ ] 버튼 색상 변경 확인 (지정/완료/다시시작)
- [ ] 상태 전환 부드럽게 작동 확인

---

## 🔍 구체적 검증 방법

### Phase 3 완료 시 검증 항목

1. **빌드 검증**
   ```bash
   npm run build 2>&1
   # 예상: ✅ PASS, 0 errors
   ```

2. **2번 경보 화면** (모바일 뷰 375px)
   - [ ] 상단 고정 카드 표시
   - [ ] 심각도 3가지 색상 구분 명확
   - [ ] "조치 시작" 버튼 44x44px 이상
   - [ ] 스크롤 시 카드 상단에 고정

3. **4번 진단 화면** (모바일 뷰 375px)
   - [ ] 상단 카드에 "2/4" 진행률 표시
   - [ ] 진행률 바 애니메이션 부드러움
   - [ ] "다음 양식" 버튼 활성/비활성 상태 명확

4. **8번 개입 화면** (모바일 뷰 375px)
   - [ ] 상단 고정 카드에 조치명 표시
   - [ ] 3가지 유형(빨강/주황/초록) 명확히 구분
   - [ ] 상태 버튼 색상 변경 확인
   - [ ] 상태 순환 (미착수 → 진행중 → 완료 → 미착수)

---

## 📊 변경 파일 요약

| 파일 | 변경 사항 | 라인 수 |
|------|----------|--------|
| pages/SiteIssueManagement.tsx | 상단 고정 카드 + 색상 | 30~50줄 |
| pages/WorkerTraining.tsx | 상단 카드 + 진행률 바 | 40~60줄 |
| pages/InterventionCoaching.tsx | 신규 생성 또는 확장 | 150~200줄 |

**예상 총 수정**: 220~310줄

---

## ⏹️ 중단된 경우 재개 방법

**상태 확인**:
- [ ] 3-1-1 (파일 확인) 완료?
- [ ] 3-1-2 (상단 카드) 완료?
- [ ] 3-1-3 (색상 분류) 완료?
- [ ] 3-2 (4번 진단) 완료?
- [ ] 3-3 (8번 개입) 완료?

**미완료 항목부터 재개**

---

**상태**: 📋 대기 중 (Phase 2 완료 후 시작)
