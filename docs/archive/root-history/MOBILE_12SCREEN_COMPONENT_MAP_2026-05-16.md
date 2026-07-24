# 모바일 12화면 컴포넌트 매핑 (2026-05-16)

## 현황
- 기존 pages 17개 파일
- 12화면 IA 정의 완료
- Phase B-1: 화면 라우팅 + 핵심 KPI/CTA 확정 진행중

---

## 12화면 ← → 기존 컴포넌트 매핑

| 번호 | 화면명 | 목적 | 기존 컴포넌트 | 성숙도 | 핵심 KPI | 핵심 CTA | 우선순위 |
|------|--------|------|--------------|--------|----------|---------|----------|
| **1** | 홈 대시보드 | 오늘 위험현황 요약 | Dashboard.tsx | ✅ 기존 | 즉시조치 건수 + 팀 평가 | 경보 확인 | P0 |
| **2** | 경보 알림 | 우선 경보 리스트 | SiteIssueManagement.tsx | ✅ 기존 | 심각도별 경보 개수 | 조치 시작 | P0 |
| **3** | 개인 인지 프로파일 | 개인 벡터 상태 확인 | WorkerManagement.tsx | ✅ 기존 | 5가지 벡터 점수 | 진단 수행 | P1 |
| **4** | 위험인지 진단 | 5/10 문항 진단 | WorkerTraining.tsx | ⚠️ 부분 | 진행 단계(1~4/4) | 다음 양식 | P0 |
| **5** | 현장 컨텍스트 | 공정/기상/밀도/시간 입력 | **신규** FieldContextInput | 🆕 신규 | 공정명 + 시간 + 인원 | 저장 | P2 |
| **6** | 행동 패턴 분석 | 반복/시간대/팀 패턴 | SafetyBehaviorManagement.tsx | ⚠️ 부분 | 상위 3패턴 | 상세보기 | P1 |
| **7** | 위험 예측 | 위험도/근거/우선대상 | PredictiveAnalysis.tsx | ✅ 기존 | 예측 위험도 + 신뢰도 | 예측 갱신 | P0 |
| **8** | 개입 추천 | 즉시/중기/학습 조치 유형 | **신규** InterventionCoaching | 🆕 신규 | TOP 1 조치 + 사유 | 지정 | P2 |
| **9** | 수기 데이터 입력 | 원문 중심 수기 입력 + 판단 태깅 | **신규** JudgmentTaggingInput | 🆕 신규 | 입력 건수 + 완료율 | 입력 계속 | P0 |
| **10** | 태깅 검증 | 자동 QA + 합의 | OcrAnalysis.tsx | ✅ 완성도 높음 | ERROR_TOP5 + ACTION_TOP5 | QA 실행 | P0 |
| **11** | 분석 리포트 | 요약 KPI + 액션 | Reports.tsx | ✅ 기존 | 주간 KPI + 최근 조치 | 리포트 생성 | P0 |
| **12** | 메뉴/설정 | 프로필/환경/권한 | Settings.tsx | ✅ 기존 | 현재 모드/권한 | 설정 변경 | P1 |

---

## 신규 필요 컴포넌트 (🆕)

### 5번: FieldContextInput (현장 컨텍스트)
**파일**: pages/FieldContextInput.tsx
**입력 필드**:
- 공정명 (선택)
- 날씨 (맑음/흐림/비/눈)
- 현장 인원 (수치)
- 시간대 (아침/점심/저녁/야간)
- 특수 상황 기록 (자유 텍스트)

**핵심 CTA**: `저장` → 컨텍스트 스냅샷 생성

---

### 8번: InterventionCoaching (개입 추천)
**파일**: pages/InterventionCoaching.tsx
**출력 카드**:
- 즉시조치 (1순위, 예: 장비 검사, 인원 배치)
- 중기조치 (3~7일, 예: 팀 회의, 프로세스 개선)
- 학습조치 (2주 이상, 예: 교육 프로그램, 의식개선)

**핵심 CTA**: `조치 지정` → 담당자 할당 + 기한 설정

---

### 9번: JudgmentTaggingInput (수기 데이터 입력)
**파일**: pages/JudgmentTaggingInput.tsx
**입력 필드** (psi_judgment_tagging_template_v1.csv 기준):
- recordId (자동 생성)
- rawText (수기 원문 입력)
- riskCategory (선택: 추락/낙하/협착/감전/화상/요통 등)
- riskSubcategory (동적 선택)
- judgmentTags (멀티 선택, codebook 기준)
- recommendedAction (자유 입력)
- consensusStatus (pending → agreed / disputed)

**핵심 CTA**: `입력 완료` → CSV 행 추가 + QA 자동 트리거

---

## 라우팅 구조

```
/mobile/
  ├── /dashboard (1번: 홈)
  ├── /alerts (2번: 경보)
  ├── /worker-profile/:workerId (3번: 프로파일)
  ├── /diagnosis/:workerId (4번: 진단)
  ├── /context-input (5번: 컨텍스트)
  ├── /patterns (6번: 패턴)
  ├── /prediction (7번: 예측)
  ├── /intervention (8번: 개입)
  ├── /input-judgment (9번: 입력)
  ├── /validate-tagging (10번: 검증)
  ├── /report (11번: 리포트)
  └── /settings (12번: 설정)
```

---

## 데이터 흐름 스냅샷

```
1번(홈) → 2번(경보) → 3번(프로파일) ⊗ 4번(진단) + 5번(컨텍스트) 
                                     ↓
                            6번(패턴) → 7번(예측) 
                                        ↓
                            8번(개입) ← 9번(입력→태깅) → 10번(검증)
                                        ↑                    ↓
                                        └← CSV 트리거 ← Tagging QA ─→ 11번(리포트)
```

---

## 구현 우선순위 (Phase B)

### B-1 (1-2일): 라우팅 + 기본 레이아웃
```
- 모바일 메뉴/탭 네비게이션 구성 (1-12 번)
- 기본 카드 레이아웃 정의
- 기존 5개 components (Dashboard, SiteIssue, Behavior, Prediction, Reports) 연결
```

### B-2 (3-4일): 신규 3개 컴포넌트 추가
```
- FieldContextInput.tsx 추가 (5번)
- InterventionCoaching.tsx 추가 (8번)
- JudgmentTaggingInput.tsx 추가 (9번) ← 현존 OcrAnalysis와 병렬
```

### B-3 (5일): 데이터 흐름 연결
```
- 9번(입력) → 10번(검증) → 11번(리포트) 파이프라인
- check:judgment-tagging:full 스크립트 웹훅 연동
- 예측(7번) → 개입(8번) 권장 사항 인계
```

---

## 핵심 KPI/CTA 최종 정리

| 번호 | KPI | CTA | 버튼색 | 행동 결과 |
|------|-----|-----|--------|----------|
| 1 | 즉시조치 건수 | `경보 확인` | 🔴 Red | → 2번 |
| 2 | 심각도 TOP3 | `조치 시작` | 🟠 Orange | → 담당자 지정 + 기한 설정 |
| 3 | 벡터 5가 점수 | `진단 수행` | 🔵 Blue | → 4번 |
| 4 | 완료 단계 N/4 | `다음 양식` | 🔵 Blue | → 다음 입력 필드 |
| 5 | 입력값 4개 + 저장여부 | `저장` | 🟢 Green | → 컨텍스트 스냅샷 생성 |
| 6 | TOP3 패턴명 + 빈도 | `상세보기` | 🔵 Blue | → 확대 차트 |
| 7 | 예측 위험도 + 신뢰도 | `예측 갱신` | 🟠 Orange | → 새로운 위험도 계산 |
| 8 | TOP1 조치명 + 사유(2줄) | `지정` | 🟠 Orange | → 8번 화면 |
| 9 | 입력 건수 + 완료율% | `입력 계속` | 🟢 Green | → 다음 입력 필드 |
| 10 | ERROR_TOP5 + ACTION_TOP5 | `QA 실행` | 🟣 Purple | → check:judgment-tagging:full npm 스크립트 트리거 |
| 11 | 주간 KPI(점수/건수/추세) | `리포트 생성` | 🟢 Green | → PDF/CSV 다운로드 |
| 12 | 현재 모드/권한 표시 | `설정 변경` | ⚪ Gray | → 모드 전환 또는 권한 요청 |

---

## 다음 작업 (Phase B-1 진행)

1. ✅ 12화면 컴포넌트 맵 정의 (현재 문서)
2. ⏳ 모바일 라우팅 구조 코드 구현 (App.tsx 수정)
3. ⏳ 기본 메뉴/탭 네비게이션 컴포넌트 작성
4. ⏳ 신규 3개 컴포넌트 스켈레톤 생성 (입력폼 + mock 데이터)

---

## 파일 생성일
- 2026-05-16
- Phase B-1 시작 시점
