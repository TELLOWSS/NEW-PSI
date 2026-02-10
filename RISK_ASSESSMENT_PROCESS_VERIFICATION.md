# 위험성평가 기록지 디지털화 및 월별 프로세스 검증 보고서

## 📋 사용자 요구사항 분석

### **요구사항 #1: 수기 기록지 디지털화 및 2차 재가공 메커니즘**
```
수기로 작성한 위험성평가 기록지 
  ↓ (OCR 분석)
디지털 텍스트화 (handwrittenAnswers 추출)
  ↓ (사용자 오타/수정 편집)
사용자 수정사항 입력
  ↓ (AI 온톨로지 가공)
2차 재가공 분석 (strengths, weakAreas, aiInsights 갱신)
```

### **요구사항 #2: 월별 위험성평가 프로세스**
```
현장 특이사항 파악
  ↓
매월 위험성평가회의 진행
  ↓
위험성평가전파교육 실시
  ↓
다음달 위험성평가 기록지 작성 (새로운 양식/기준 적용)
```

---

## ✅ **구현된 기능 (디지털화 + 재가공)**

### **1단계: 수기 기록지 → 디지털 텍스트화** ✅
**구현 위치**: `OcrAnalysis.tsx` + `geminiService.ts`

**프로세스**:
```tsx
1. 사용자가 위험성평가 이미지 업로드
   ↓
2. analyzeWorkerRiskAssessment() 호출
   - Gemini AI 모델 사용
   - 이미지에서 텍스트 추출
   - JSON 스키마로 파싱
   ↓
3. WorkerRecord 생성
   - originalImage: 원본 이미지 저장
   - handwrittenAnswers: QnA 형식 (questionNumber, answerText, koreanTranslation)
   - fullText: 원문 보존
   - koreanTranslation: 다국어 번역
```

**구현 상태**: ✅ **완전 구현**
- Gemini Flash API 사용
- 다국어 지원 (LANGUAGE_POLICY 적용)
- 3단계 이미지 검증 (형식, 지원, AI호환)
- 진행률 표시 및 중단 기능

---

### **2단계: 사용자 수정** ✅
**구현 위치**: `RecordDetailModal.tsx`

**기능**:
```tsx
1. 상세보기 모달 열기
   ↓
2. 다음 탭에서 수정 가능:
   - [INFO] 탭: 사용자 정보 수정 (국적, 점수, 팀장, 직책 등)
   - [ANALYSIS] 탭: AI 분석 결과 편집
   - [QnA] 탭: 질문별 답변 및 번역 수정
   ↓
3. "변경사항 저장" 버튼으로 임시 저장
```

**구현 상태**: ✅ **완전 구현**
- 모든 필드 편집 가능
- 이미지 재업로드 지원
- 변경사항 감지 (hasChanges 플래그)
- 확인 팝업으로 실수 방지

---

### **3단계: AI 온톨로지 재가공** ✅
**구현 위치**: `RecordDetailModal.tsx` 호출 + `geminiService.ts` updateAnalysisBasedOnEdits`

**프로세스**:
```tsx
const handleReflectChanges = async () => {
    // "수정사항 AI 반영 갱신" 버튼 클릭
    const confirmMsg = `현재 수정된 정보(국적: ${record.nationality}, 
        점수: ${record.safetyScore}점, 팀장: ${record.teamLeader}, 직책: ${record.role})를 
        바탕으로 AI 분석 및 모국어 번역을 새로 생성하시겠습니까?`;
    
    if (confirm(confirmMsg)) {
        const updatedAnalysis = await updateAnalysisBasedOnEdits(record);
        // AI가 수정된 정보 반영하여 새로 생성:
        // - strengths 재분석
        // - weakAreas 재분석
        // - aiInsights 재생성
        // - 모국어 번역 갱신
    }
};
```

**생성되는 것**:
- `strengths`: 수정된 정보 기반 강점 재분석
- `strengths_native`: 모국어 번역
- `weakAreas`: 약점 재분석
- `weakAreas_native`: 모국어 번역
- `aiInsights`: AI 통찰 재생성
- `aiInsights_native`: 모국어 번역
- `koreanTranslation`: 전체 번역 갱신

**구현 상태**: ✅ **완전 구현**
- 수정사항 반영 확인 로직
- AI 재분석 요청
- JSON 파싱 및 필드 매핑
- 사용자 확인 후 저장

---

## 🔴 **미구현된 기능 (월별 프로세스)**

### **프로세스 #1: 매월 위험성평가회의** ❌
**요구사항**: 
- 월별 회의 일정 관리
- 참석자 관리
- 의제 작성

**현재 상태**: **미구현**
- Dashboard에 다음 달 안건 제안만 표시
- 실제 회의 기록/관리 기능 없음

**필요 구현**:
```tsx
interface SafetyMeetingRecord {
    id: string;
    month: string; // "2026년 2월"
    date: string; // 회의 진행 날짜
    attendees: string[]; // 팀장, 안전관리자 등
    agendaItems: MeetingAgenda[];
    decisions: string[];
    focusAreas: string[];
}
```

---

### **프로세스 #2: 위험성평가전파교육** ❌
**요구사항**: 
- 교육 자료 생성
- 교육 이력 관리
- 교육 효과 추적

**현재 상태**: **부분 구현**
- PredictiveAnalysis에서 "TBM 전파 교육 제안" 텍스트만 제공
- 실제 교육 관리 기능 없음

**제공되는 가이드**:
```
"TBM 전파 교육 제안"
 ↓
"{nextMonth}은 계절적 요인과 맞물려 추락 및 미끄러짐 사고 위험이 높습니다.
작업 전 안전대 고리 체결 확인을 필수 항목으로 기재하도록 지도하십시오."
```

**필요 구현**:
```tsx
interface SafetyEducationRecord {
    id: string;
    month: string;
    date: string; // 교육 진행 날짜
    topic: string; // "추락 위험" 등
    attendees: string[];
    materials: string; // 교육 자료
    comprehension: 'high' | 'medium' | 'low'; // 이해도
}
```

---

### **프로세스 #3: 다음달 위험성평가 기록지 작성** ❌
**요구사항**:
- 월별 새로운 양식/기준 제공
- 현장 특이사항 반영
- 작성 템플릿 제공

**현재 상태**: **미구현**
- 모든 근로자가 동일한 기록지 형식 사용
- 월별 변화 없음
- 이전달 위험성평가 결과를 다음달 기준에 반영하지 않음

**필요 구현**:
```tsx
interface MonthlyEvaluationTemplate {
    month: string;
    focusAreas: string[]; // 이번달 중점 사항
    seasonalRisks: string[]; // 계절적 위험
    previousMonthFindings: string[]; // 저번달 위험성평가 결과
    guidelineUpdates: string[]; // 변경된 작성 기준
    requiredFields: string[]; // 필수 기입 사항
}
```

---

## 📊 기능별 구현 현황

| 기능 | 상태 | 구현도 | 비고 |
|------|------|--------|------|
| **OCR 텍스트화** | ✅ | 100% | 완전 구현 |
| **사용자 수정 편집** | ✅ | 100% | 완전 구현 |
| **AI 재가공(온톨로지)** | ✅ | 100% | 완전 구현 |
| **데이터 저장** | ✅ | 100% | IndexedDB 사용 |
| **위험성평가회의 관리** | ❌ | 0% | **미구현** |
| **위험성평가전파교육 관리** | ⚠️ | 20% | 가이드만 제공 |
| **월별 템플릿 관리** | ❌ | 0% | **미구현** |
| **프로세스 자동화** | ❌ | 0% | **미구현** |

---

## 💾 데이터 흐름 검증

### **현재 구현된 흐름**:
```
이미지 업로드
  ↓ [analyzeWorkerRiskAssessment]
OCR 분석 → handwrittenAnswers 추출
  ↓ [저장]
WorkerRecord 생성
  ↓ [RecordDetailModal에서 수정]
사용자 수정사항 입력
  ↓ [handleReflectChanges]
updateAnalysisBasedOnEdits 호출
  ↓ [AI 재분석]
strengths, weakAreas, aiInsights 갱신
  ↓ [handleSave]
데이터 저장 (IndexedDB)
```

**검증**: ✅ **이 흐름은 완벽하게 구현됨**

---

### **필요한 월별 프로세스 흐름**:
```
[1월] 위험성평가회의
      ↓ 위험성평가전파교육
      ↓ 2월 기록지 작성 시작
         (1월 결과 반영된 새 템플릿)
      ↓ 근로자들이 수정된 기준으로 작성
      ↓

[2월] OCR 분석 & 재가공
      ↓ 데이터 축적
      ↓

[2월] 위험성평가회의
      ↓ 위험성평가전파교육
      ↓ 3월 기록지 작성 시작
         (2월 결과 반영된 새 템플릿)
```

**검증**: ❌ **이 프로세스는 구현되지 않음**

---

## 🚀 개선 제안

### **단계 1: 위험성평가회의 관리 (P0)**
```tsx
// pages/SafetyMeetings.tsx 추가 필요
interface SafetyMeeting {
    id: string;
    month: string;
    date: string;
    agenda: SafetyMeetingAgenda[];
    decisions: string[];
    nextActions: string[];
}

// 기능:
- 월별 회의 일정 등록
- 의제 관리
- 의사결정 기록
- 다음달 포커스 영역 정의
```

### **단계 2: 위험성평가전파교육 관리 (P0)**
```tsx
// pages/SafetyEducation.tsx 추가 필요
interface SafetyEducation {
    id: string;
    month: string;
    date: string;
    topic: string;
    attendees: string[];
    materials: EducationMaterial[];
    effectivenessScore: number;
}

// 기능:
- 회의 후 교육 계획 수립
- 교육 자료 생성 (AI)
- 교육 진행 기록
- 교육 효과 평가
```

### **단계 3: 월별 템플릿 관리 (P1)**
```tsx
// types.ts에 추가
interface MonthlyTemplate {
    month: string;
    focusAreas: string[]; // 위험성평가회의 결정사항
    seasonalRisks: string[]; // 계절 위험
    requiredFields: string[]; // 필수 작성 항목
    guidelines: string[]; // 작성 기준
}

// pages/OcrAnalysis.tsx에서 
// 템플릿 기반 기록지 제공
```

### **단계 4: 프로세스 자동화 (P2)**
```tsx
// Dashboard에 월별 체크리스트 추가
- [1월] 위험성평가회의 진행 여부
- [1월] 전파교육 진행 여부
- [2월] 새 템플릿 적용 여부
- [2월] 기록지 작성 시작
```

---

## ✨ 종합 평가

### **현재 상태**
- ✅ **수기 기록지 → 디지털화**: **100% 완벽 구현**
  - OCR 분석
  - 다국어 지원
  - 이미지 검증

- ✅ **사용자 수정 및 재가공**: **100% 완벽 구현**
  - 상세 편집 인터페이스
  - AI 온톨로지 재분석
  - 모국어 번역 갱신

- ❌ **월별 프로세스**: **0% 미구현**
  - 위험성평가회의 기능 없음
  - 전파교육 관리 없음
  - 월별 템플릿 자동화 없음

### **시스템 용도**
**현재 PSI 시스템은:**
- ✅ 개별 근로자의 위험성평가 기록지를 **디지털화**하고 **분석**하는 데 완벽
- ✅ 오타/수정사항을 **2차 가공**하여 정확도 높임
- ❌ 현장의 월별 **관리 프로세스**를 자동화하지는 못함

### **권장사항**
1. **현재 기능으로는**: 개별 근로자 기록지 작성 → OCR → 수정 → 재분석의 **스탠드얼론 워크플로우**에 적합
2. **프로세스 통합을 원한다면**: 위험성평가회의 → 교육 → 템플릿 → 작성의 **월별 순환 프로세스** 추가 필요

---

## 🎯 결론

### **사용자 질문에 대한 답변**

**Q1: "디지털 텍스트화 및 2차 재가공 메커니즘이 구현되어 있는가?"**
- **A: ✅ YES - 완벽하게 구현됨**
  - 수기 기록지이미지 → OCR 분석 → handwrittenAnswers 추출 ✅
  - 사용자 수정 입력 ✅
  - updateAnalysisBasedOnEdits로 AI 재분석 ✅
  - strengths, weakAreas, aiInsights 갱신 ✅

**Q2: "월별 위험성평가 프로세스가 자동화되어 있는가?"**
- **A: ❌ NO - 미구현 상태**
  - 월별 위험성평가회의 관리 ❌
  - 위험성평가전파교육 관리 ⚠️ (가이드만 제공)
  - 다음달 기록지 템플릿 자동 생성 ❌

**개선 우선순위:**
1. 위험성평가회의 모듈 추가 (P0)
2. 위험성평가전파교육 모듈 추가 (P0)
3. 월별 템플릿 자동화 (P1)

