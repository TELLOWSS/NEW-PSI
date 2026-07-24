# 📋 Phase 2: PC Dashboard 사용자 진입점 단순화 (2026-05-22)

**목표**: PC Dashboard 복잡도 낮추기 (기본 모드 추가, 고급 모드 토글)  
**담당**: AI Agent  
**예상 소요**: 4시간

---

## 📌 Phase 2 상세 체크리스트

### 2-1. 기본 모드 (Default) 추가 (120분)

#### 2-1-1. 상태 관리 추가
**파일**: pages/Dashboard.tsx

- [ ] **새 상태 변수 추가** (라인 찾기: `const [dashboardViewMode, ...]` 근처)
  ```typescript
  // 추가할 코드:
  const [dashboardUIMode, setDashboardUIMode] = useState<'basic' | 'advanced'>(() => {
    const saved = localStorage.getItem('psi_dashboard_ui_mode_v1');
    return saved === 'advanced' ? 'advanced' : 'basic';
  });
  ```
  
  - [ ] 위치: useEffect/useState 블록 (라인 ~500)
  - [ ] 기존 상태와 충돌 없는지 확인
  
- [ ] **토글 함수 추가**
  ```typescript
  const handleDashboardUIModeChange = (mode: 'basic' | 'advanced') => {
    setDashboardUIMode(mode);
    localStorage.setItem('psi_dashboard_ui_mode_v1', mode);
    
    trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
      control: 'ui_mode_toggle',
      nextMode: mode,
      audienceView,
      viewMode: dashboardViewMode,
    });
  };
  ```
  
  - [ ] 위치: 기존 핸들러 함수 근처 (라인 ~1500)
  - [ ] trackUIViewMetric 호출 문법 확인

#### 2-1-2. UI 조건 분기 추가
**파일**: pages/Dashboard.tsx (반환문 수정)

- [ ] **기본 모드 렌더링 조건 추가** (라인 2200~3500)
  ```typescript
  // 현재:
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 ...">
    {/* 모든 차트 표시 */}
  </div>
  
  // 변경:
  {dashboardUIMode === 'basic' ? (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 ...">
      {/* 단순화된 3개 섹션만 */}
    </div>
  ) : (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 ...">
      {/* 전체 섹션 */}
    </div>
  )}
  ```
  
  - [ ] 기본 모드 구성: 설문/국적/취약/동향 4개 차트만
  - [ ] 고급 모드 구성: 현재 대로 (Harness 포함 전체)

#### 2-1-3. 토글 UI 추가
**파일**: pages/Dashboard.tsx (상단 헤더 영역)

- [ ] **모드 선택 버튼 추가** (라인 ~2350)
  ```tsx
  {!isImmediateOperationalMode && (
    <div className="mb-3 sm:mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-200">대시보드 모드</p>
        <p className="mt-1 text-xs font-medium text-slate-200">
          {dashboardUIMode === 'basic'
            ? '기본 모드: 새 사용자 중심 간단한 구성'
            : '고급 모드: 숙련자/관리자 중심 전체 기능'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {['basic', 'advanced'].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => handleDashboardUIModeChange(mode as 'basic' | 'advanced')}
            className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${
              dashboardUIMode === mode
                ? 'bg-white text-slate-900'
                : 'bg-white/10 text-slate-100 hover:bg-white/20'
            }`}
          >
            {mode === 'basic' ? '🟢 기본 모드' : '⚙️ 고급 모드'}
          </button>
        ))}
      </div>
    </div>
  )}
  ```
  
  - [ ] 위치: 기존 "역할별 보기" 토글 바로 아래
  - [ ] 조건: PC 뷰 (640px+)에서만 표시

### 2-2. KPI 카드 재정렬 (60분)

#### 2-2-1. KPI 카드 순서 확인
**파일**: pages/Dashboard.tsx (라인 2400~2600)

- [ ] **현재 순서 파악**
  - 라인 ~2410: "현장 안전 지수" (평균 점수)
  - 라인 ~2430: "활동 중인 근로자" (근로자 수)
  - 라인 ~2450: "위험도 모니터링" (고위험)
  
- [ ] **목표 순서 결정** (목업 기반)
  - 순서 1: 위험도 (빨강)
  - 순서 2: 전조신호 (주황)
  - 순서 3: 개입우선순위 (파랑)
  - 순서 4: 개입완료율 (초록) - 선택

#### 2-2-2. 색상 매핑 정의
- [ ] **위험도**: 현재 "위험도 모니터링" 섹션 활용
- [ ] **전조신호**: 현재 "현장 안전 지수" 또는 새 로직 추가
- [ ] **개입우선순위**: 현재 "활동 중인 근로자" 재명명 또는 새 계산
- [ ] **개입완료율**: 기존 "승인 대기" 수정 또는 새 로직

#### 2-2-3. 카드 색상 업데이트
**파일**: pages/Dashboard.tsx

- [ ] **카드 색상 일관성** (아래 예시)
  ```tsx
  // 위험도 (Red) - Line ~2450
  const riskCardColor = 'bg-red-900/20 border-red-300/20';
  const riskIconColor = 'text-red-400';
  
  // 전조신호 (Orange) - Line ~2410
  const alertCardColor = 'bg-orange-900/20 border-orange-300/20';
  const alertIconColor = 'text-orange-400';
  
  // 개입우선순위 (Blue) - Line ~2430
  const priorityCardColor = 'bg-blue-900/20 border-blue-300/20';
  const priorityIconColor = 'text-blue-400';
  
  // 개입완료율 (Green) - 추가
  const completionCardColor = 'bg-green-900/20 border-green-300/20';
  const completionIconColor = 'text-green-400';
  ```
  
  - [ ] 각 카드 className 업데이트

### 2-3. 차트 배치 최적화 (60분)

#### 2-3-1. 기본 모드 차트 선택 (라인 3000~3500)
- [ ] 포함할 차트 (4개)
  1. 설문 기반 핵심 지표
  2. 국적별 근로자 현황
  3. 근로자 주요 취약 분야
  4. 최근 안전 점검 동향 (도넛)

#### 2-3-2. 고급 모드 차트 유지 (현재 대로)
- [ ] Harness 섹션 포함
- [ ] 공종 집중도 테이블
- [ ] 드릴다운 기능

#### 2-3-3. 반응형 레이아웃 확인
**파일**: pages/Dashboard.tsx

- [ ] **기본 모드 그리드 구성**
  ```tsx
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {/* 각 차트 */}
  </div>
  ```
  
  - [ ] 모바일 (320px): 1열
  - [ ] 태블릿 (768px): 2열
  - [ ] PC (1024px): 3열 또는 2열

---

## 🔍 구체적 검증 방법

### Phase 2 완료 시 검증 항목

1. **빌드 검증**
   ```bash
   npm run build 2>&1 | tail -5
   # 예상: ✅ PASS, 0 errors, < 8초
   ```

2. **기본 모드 렌더링 확인** (브라우저)
   - [ ] PC 화면에서 모드 토글 버튼 표시
   - [ ] "🟢 기본 모드" 클릭 → 차트 4개만 표시
   - [ ] "⚙️ 고급 모드" 클릭 → 전체 차트 표시
   - [ ] 페이지 새로고침 후 이전 모드 유지 확인

3. **색상 일관성** (모바일 및 PC)
   - [ ] 빨강/주황/파랑/초록 4색 명확히 구분
   - [ ] 다크 모드에서도 색상 대비 충분

4. **LocalStorage 확인** (브라우저 DevTools)
   ```javascript
   // Console에서 실행:
   localStorage.getItem('psi_dashboard_ui_mode_v1')
   // 예상: 'basic' 또는 'advanced'
   ```

---

## 📊 변경 파일 요약

| 파일 | 라인 | 변경 사항 |
|------|------|----------|
| pages/Dashboard.tsx | ~500 | 상태 변수 추가 |
| pages/Dashboard.tsx | ~1500 | 토글 함수 추가 |
| pages/Dashboard.tsx | ~2350 | 토글 UI 추가 |
| pages/Dashboard.tsx | 2400~2600 | KPI 카드 순서/색상 |
| pages/Dashboard.tsx | 3000~3500 | 차트 조건 분기 |

**예상 수정 줄 수**: 200~300줄

---

## ⏹️ 중단된 경우 재개 방법

**상태 확인**:
- [ ] 2-1-1 (상태 관리) 완료?
- [ ] 2-1-2 (UI 조건) 완료?
- [ ] 2-1-3 (토글 UI) 완료?
- [ ] 2-2 (KPI 순서) 완료?
- [ ] 2-3 (차트 배치) 완료?

**미완료 항목부터 재개**

---

**상태**: 📋 대기 중 (Phase 1 완료 후 시작)
