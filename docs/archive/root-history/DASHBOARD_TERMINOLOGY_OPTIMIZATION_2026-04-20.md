# Dashboard 용어 및 정보 구조 최적화 보고서
**작성일**: 2026-04-20  
**분석 대상**: `pages/Dashboard.tsx`, `components/charts/WorkerTrendPanel.tsx`, `pages/PerformanceAnalysis.tsx`

---

## 1. 확인된 용어 일관성 문제

### 1.1 주요 용어 불통일

| 용어 | 현재 표기 | 개선안 | 이유 |
|------|---------|--------|------|
| **직무 분류** | "공종" | "직무 종류" or "담당 분야" | IT 비전공자 이해도 ↑ |
| **개인별 평가 추이** | "개인추이" | "개인별 평가 기록" | 정확성 ↑, 검색 가능성 ↑ |
| **역량 분석 차트** | "레이더" | "5대 영역 평가도" or "역량 분포도" | 기술 용어 제거 |
| **보호 필요 직무** | "취약 공종" | "개선 필요한 분야" | 긍정적 톤 ↑ |
| **비교 대상 범위** | "팀 비교" | "같은 직무의 팀별 비교" | 명확성 ↑ |
| **근로자 검색 범위** | "공종별 또는 팀별" | "직무별 또는 팀별" | 통일성 ↑ |

### 1.2 역할별 용어 표기 불통일

**ComparisonCards의 eyebrow 텍스트**:

```tsx
// 현재 상태
worker:     "지금 비교 중"
executive:  "비교 현황"
default:    "지금 상태"

// 개선안: 모두 "비교 현황" 통일
// (역할별 설명은 description에서 처리)
```

**evidence 카드의 eyebrow 불통일**:

```tsx
// 현재
worker:     "무엇을 보면 되나"
executive:  "경영 근거"
default:    "판단 근거"

// 개선안: "근거" 통일
// (역할별 맥락은 title/description에서 처리)
```

---

## 2. 정보 구조 중복성 분석

### 2.1 ComparisonCards 3-Step 구조 검토

**현재 구조**:
```
[Status Card]  → "비교 중" / "현황" / "상태"
  └─ 선택된 비교 대상 설명

[Evidence Card] → "무엇을 보면 되나" / "근거" / "경영 근거"  
  └─ 비교 기준 및 데이터 해석 안내

[Action Card]  → "다음 행동"
  └─ 추천 액션 및 우선순위
```

**중복성 판단**: ✅ **의도된 설계** (최적화 가능)
- Status ≠ Evidence (상태 != 해석 기준)
- 그러나 사용자 관점에서 **두 카드의 정보 경계가 모호함**

**개선 방향**:
1. **Status Card**: "현재 비교 상태" (간결하게)
2. **Evidence Card**: 제목을 "핵심 판단 요소"로 변경 → 기준 명확화
3. **Action Card**: 유지 (명확함)

### 2.2 정보 반복 지점

| 반복 요소 | 위치 1 | 위치 2 | 개선안 |
|---------|--------|--------|--------|
| **팀 선택 안내** | comparisonCards status | sticky header | 하나로 통합 (sticky header 정보 활용) |
| **국적 기준 설명** | evidence card | teamNationalityDrilldown notice | 명확한 계층 구조로 재편 |
| **점수 등급 설명** | legend (75/60 기준) | multiple places | 단일 설정 UI로 이동 |

---

## 3. 최적화 코드 변경 계획

### 3.1 용어 통일 (roleViewModel.ts 기반)

**적용 범위: 아래 파일 순차 수정**
1. `utils/roleViewModel.ts` - 마스터 설정
2. `pages/Dashboard.tsx` - 메인 UI
3. `components/charts/WorkerTrendPanel.tsx` - 트렌드 패널
4. `pages/PerformanceAnalysis.tsx` - 분석 페이지

**구체적 변경**:

```typescript
// 마스터 용어 정의 (roleViewModel.ts)
export const DASHBOARD_TERMINOLOGY = {
  TRADE: '직무 종류',           // (구) "공종"
  TEAM: '팀',                   // 유지
  NATIONALITY: '국적',          // 유지
  WORKER_TREND: '개인별 평가 기록', // (구) "개인추이"
  RADAR_CHART: '5대 영역 평가도',   // (구) "레이더"
  WEAK_TRADES: '개선 필요한 분야',  // (구) "취약 공종"
};

// ComparisonCards eyebrow 통일
comparisonCards: {
  status: {
    eyebrow: '비교 현황',         // 모든 역할 동일
    description: (audience) => {  // 역할별 설명은 description에서
      if (audience === 'worker') return '...작업조 흐름...';
      if (audience === 'executive') return '...리스크 편차...';
      return '...공종/팀 비교...';
    }
  },
  evidence: {
    eyebrow: '근거',             // 모든 역할 동일
    description: () => '...'     // 역할별 처리
  },
  action: {
    eyebrow: '다음 행동',         // 유지 (명확함)
  }
}
```

### 3.2 정보 계층 구조 재편

**현재**(평면 구조):
```
Dashboard Header
├─ 팀 선택 드롭다운
├─ ComparisonCards (status/evidence/action) ← 중복 정보
├─ TradeQuickAccess
├─ TeamQuickAccess
└─ [차트들]
```

**개선**(계층 구조):
```
Dashboard Header
├─ 팀 선택 드롭다운
└─ Comparison Section (Sticky Header로 통합)
   ├─ [Status 한 줄 요약] (sticky)  ← 간결화
   ├─ ComparisonCards (evidence/action만) ← 중복 제거
   ├─ TradeQuickAccess
   ├─ TeamQuickAccess
   └─ [차트들]
```

---

## 4. 구현 우선순위

### Phase 1 (즉시): 용어 통일
- [ ] `roleViewModel.ts`에 DASHBOARD_TERMINOLOGY 마스터 설정 추가
- [ ] Dashboard.tsx에서 "공종" → "직무 종류" 치환 (주석으로 검색 명시)
- [ ] WorkerTrendPanel.tsx에서 "개인추이" → "개인별 평가 기록"

### Phase 2 (선택): 정보 구조 최적화
- [ ] ComparisonCards의 status 카드 간결화 (description 단순화)
- [ ] evidence 카드의 eyebrow를 "근거"로 통일
- [ ] Sticky header에 상태 정보 통합

### Phase 3 (심화): 검색/필터 최적화
- [ ] Dashboard 검색 필터에 "직무별" 추가
- [ ] TeamQuickAccess에서 이전의 "공종" 표기를 "직무 종류"로 변경

---

## 5. 예상 효과

| 개선 항목 | 효과 | 예상 UX 개선도 |
|----------|------|----------------|
| 용어 통일 | 검색 가능성, 이해도 ↑ | ⭐⭐⭐ (즉시) |
| 정보 계층화 | 스크롤 압박 ↓, 한눈 이해 ↑ | ⭐⭐ (선택) |
| eyebrow 통일 | 학습곡선 ↓, 컨시스턴시 ↑ | ⭐⭐ (선택) |
| 검색 최적화 | 자체 사용성 ↑ | ⭐ (심화) |

---

## 6. 마이그레이션 체크리스트

- [ ] 모든 UI 텍스트에서 "공종" 검색 완료 (Dashboard, WorkerTrendPanel, PerformanceAnalysis)
- [ ] "개인추이" → "개인별 평가 기록" 치환 (라벨, title, description)
- [ ] "레이더" 용어를 "5대 영역 평가도" or "역량 분포도"로 변경
- [ ] ComparisonCards의 3개 eyebrow 통일 확인
- [ ] 역할별 description 검증 (worker/executive/default)
- [ ] QA: 검색 필터에서 新 용어로 필터링 가능 확인
- [ ] QA: 모바일 뷰에서 새 용어 표시 잘림 없음 확인

---

## 결론

**용어 통일을 우선 진행**하면:
- 🎯 구현 시간: ~30분 (검색/치환 중심)
- 📈 UX 개선: **즉각적** (이해도 ↑)
- 🔐 안정성: 높음 (기능 변경 없음, 텍스트만 변경)

**정보 구조 재편**은 향후 ROI 검증 후 선택 진행.
