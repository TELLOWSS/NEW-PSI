# Google Gemini 기반 PSI 시스템 전체 설계/구현 가이드

---

## 1. 시스템 개요

- **목표**: 근로자 안전교육/위험성평가 기록을 OCR/AI로 자동 분석, 관리자 검수/수정, 2차 AI 재가공, 리포트/통계/이력 관리까지 전 과정을 Google Gemini 기반으로 자동화
- **주요 기술**: React(TypeScript), Vite, Supabase, Google Gemini API, Tailwind CSS, 현대적 반응형 UI
- **주요 기능**: OCR 업로드/분석, AI 인사이트/점수화, 관리자 검수/수정, 2차 AI 재가공, 오류/재시도, 리포트/이력, 통계, 권한/로그, UX 최적화

---

## 2. 전체 폴더/파일 구조

```
src/
  pages/
    OcrAnalysis.tsx         # 메인 분석/관리 페이지
    ...                     # 기타 페이지
  components/
    modals/
      RecordDetailModal.tsx # 상세/검수/수정 모달
    shared/
      ...                   # 공통 UI
  services/
    geminiService.ts        # Gemini API 연동/분석/2차가공
  utils/
    ...                     # 유틸리티
  types.ts                  # 모든 타입/모델 정의
  mockData.ts               # 샘플 데이터
  index.tsx                 # 진입점
  App.tsx                   # 라우팅/전체 레이아웃
  index.html                # HTML 템플릿
  vite.config.ts            # 빌드 설정
  tsconfig.json             # 타입스크립트 설정
  package.json              # 의존성/스크립트
  ...
```

---

## 3. 데이터/타입 설계

- **WorkerRecord**: 근로자별 분석/이력/점수/AI결과/수정/2차가공 상태 등 모든 정보 포함
- **IntegrityStatus**: 확정/검증보류/재교육필요/관리자검토/2차재가공필요 등
- **secondPassStatus**: 2차 재가공 필요(NEEDED)/진행중(IN_PROGRESS)/완료(DONE)
- **AuditTrail/CorrectionHistory/ApprovalHistory**: 모든 변경/승인/수정 이력 기록

---

## 4. 주요 기능/플로우

### 4-1. OCR 업로드/1차 AI 분석
- 파일 업로드 → base64 변환 → Gemini OCR 모델 호출 (`analyzeWorkerRiskAssessment`)
- AI가 점수/강점/약점/인사이트/코칭 등 자동 산출
- 실패 시 오류코드/메시지/재시도 안내

### 4-2. 관리자 검수/수정
- 상세 모달에서 점수/강점/약점/AI 인사이트/수기답변 등 직접 수정
- 수정 이력(correctionHistory) 자동 기록
- 승인/반려/코멘트/사유 필수 입력

### 4-3. 2차 AI 재가공(재분석)
- 1차 분석 후 관리자 수정사항 반영 → Gemini reasoning 모델로 2차 재가공 (`updateAnalysisBasedOnEdits`)
- 2차 재가공 실패 시 `secondPassStatus: 'NEEDED'`로 남아 재시도 버튼 항상 활성화
- 성공 시만 `secondPassStatus: 'DONE'` 및 최종확정 처리

### 4-4. 오류/재시도/강제재분석
- 1차/2차 분석 모두 실패 시, 강제 재분석(Preflight 스킵) 및 반복 재시도 가능
- 오류 유형별 안내/가이드/체크리스트 제공

### 4-5. 리포트/이력/통계
- 근로자별/팀별/기간별 리포트, 점수 변화, 감사이력, 승인/반려/수정 이력 모두 시각화
- 최근 재가공/수정/승인/반려 등 관리자 활동 대시보드 제공

### 4-6. UX/디자인
- Tailwind 기반 현대적 반응형 UI
- 모든 주요 액션(분석/재분석/수정/승인/반려)에 명확한 버튼/상태/피드백
- 실패/진행중/완료 등 상태별 컬러/아이콘/툴팁
- 모바일/PC 완벽 대응

---

## 5. Google Gemini 연동

- **OCR 분석**: 이미지 → Gemini OCR 모델 → 텍스트/점수/강점/약점/인사이트 등 파싱
- **2차 재가공**: 관리자 수정본/원본 비교 → Gemini reasoning 모델 → 점수/강점/약점/코칭 등 재산출
- **Best Practice/RAG**: 벡터 유사도 기반 우수사례 추천(embedding + RAG)
- **API 키/쿼터 관리**: 할당량 초과/429 등 자동 감지 및 쿨다운/재시도

---

## 6. 주요 컴포넌트/로직 예시

### 6-1. OCR 분석/재분석
```ts
// services/geminiService.ts
export async function analyzeWorkerRiskAssessment(imageSource, mimeType, filenameHint) {
  // Gemini OCR 모델 호출, 실패시 오류코드/메시지 반환
}
export async function updateAnalysisBasedOnEdits(record) {
  // 관리자 수정본/원본 비교 → Gemini reasoning 모델 호출
}
```

### 6-2. 2차 재가공 상태 관리
```ts
// types.ts
export interface WorkerRecord {
  // ...기존 필드
  secondPassStatus?: 'NEEDED' | 'IN_PROGRESS' | 'DONE';
}
```
```tsx
// OcrAnalysis.tsx
if (2차 재가공 실패) {
  onUpdateRecord({ ...record, secondPassStatus: 'NEEDED' });
}
if (2차 재가공 성공) {
  onUpdateRecord({ ...record, secondPassStatus: 'DONE' });
}
```

### 6-3. UI 버튼/상태 표시
```tsx
// 2차 재가공 버튼
<Button
  disabled={record.secondPassStatus === 'DONE'}
  color={record.secondPassStatus === 'NEEDED' ? 'rose' : 'emerald'}
>
  {record.secondPassStatus === 'NEEDED' ? '2차 재가공 필요 - 재시도' : '2차 재가공 완료'}
</Button>
```

---

## 7. 전체 UX 흐름

1. 파일 업로드 → Gemini OCR 분석 → 1차 결과 표시
2. 관리자 검수/수정 → 수정본 저장/이력 기록
3. 2차 재가공(수정본 반영) → Gemini reasoning 분석
4. 2차 재가공 실패 시, '2차 재가공 필요'로 상태 표시 및 재시도 버튼 활성화
5. 2차 재가공 성공 시, 'DONE'으로 상태 표시 및 최종확정
6. 모든 이력/상태/점수/AI결과/수정/승인/반려/감사 등 DB/이력에 저장
7. 리포트/통계/이력/활동 대시보드에서 전체 현황 시각화

---

## 8. 디자인/브랜드

- Tailwind 기반, 현대적/가독성 높은 컬러/폰트/버튼/카드/모달
- 상태별 컬러(성공: emerald, 실패: rose, 진행: amber)
- 모바일/PC 완벽 대응, 접근성/반응성 최적화
- 관리자/근로자/팀장 등 역할별 UX 차별화 가능

---

## 9. 배포/운영

- Vercel/Netlify 등으로 손쉽게 배포
- Supabase로 DB/인증/저장소 관리
- Gemini API 키/쿼터 관리 및 보안
- 환경설정(점수 기준, 배치 단위, 승인 정책 등) UI 제공

---

## 10. 확장/유지보수

- 모든 주요 로직/컴포넌트/타입 분리, 유지보수 용이
- Gemini API 버전/모델 교체 용이
- 추가 AI 기능(음성합성, 챗봇, 예측 등) 손쉽게 확장 가능

---

## 11. 샘플 코드/설정/문서

- types.ts, geminiService.ts, OcrAnalysis.tsx, RecordDetailModal.tsx 등 주요 파일 전체 예시/주석 포함
- README.md에 전체 구조/설치/운영/확장법 상세 기술

---

이 설계/구현 가이드만 있으면, Google Gemini 기반으로 PSI 시스템을 완전히 복제/업그레이드할 수 있습니다.
실제 코드/설정/디자인/UX/AI 연동까지 모두 포함되어 있으니, 추가로 필요한 세부 구현/샘플/문서가 있으면 언제든 요청해 주세요!
