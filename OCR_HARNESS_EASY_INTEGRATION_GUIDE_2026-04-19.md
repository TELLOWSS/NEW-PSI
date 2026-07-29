# OCR 100% 실패 원인/해결 + 하네스 엔지니어링 쉬운 접목 가이드

작성일: 2026-04-19

## 1) 이번 장애의 정확한 원인

하네스 업그레이드 이후 `pages/OcrAnalysis.tsx` 내부에 아래 집계 변수가 **중복 선언**되어 있었습니다.

- `failureTrendComparison` (2회 선언)
- `riskIntelligence` (2회 선언)

이 중복 선언으로 프론트 빌드가 깨지고, 결과적으로 OCR 분석 화면 로직이 정상 동작하지 못하는 상태가 되었습니다.

## 2) 적용한 실제 수정

- 파일: `pages/OcrAnalysis.tsx`
- 조치: 중복으로 들어간 이전 선언 블록을 제거하고, 확장 필드(`jobFieldRiskRanking`, `coachingGapCount`)가 포함된 최신 선언 1개만 유지

효과:
- 컴파일/번들 단계에서 발생하던 중복 심볼 에러 제거
- OCR 분석 페이지의 핵심 집계 로직이 단일 소스로 안정화

## 3) 하네스 엔지니어링 접목을 쉽게 유지하는 방법

### A. 선언 충돌 방지 (가장 중요)
1. `useMemo`/`const`를 추가할 때 이름 중복 검색 (`failureTrendComparison`, `riskIntelligence` 등)
2. 동일 목적 집계는 “기존 블록 확장” 방식으로만 수정
3. 복붙 후 임시 블록은 즉시 제거

### B. OCR 실패 원인 추적 최소 루틴
1. 동일 이미지 1건으로 재분석 2~3회
2. `ocrFailureCode`, `ocrErrorMessage` 기록
3. `KEY/NETWORK/QUOTA/UNKNOWN` 비중 확인
4. API status(4xx/5xx)와 payload 오류 여부 확인

### C. 하네스 운영 루틴(간단판)
1. OCR 실패 건 발생
2. 하네스 상태 확인(`workflowState`, `approvalState`)
3. 실패 코드 기준으로 재분석/승인/보류 결정
4. 조치 후 동일 이미지 재검증

## 4) 빠른 점검 체크리스트

- [ ] `npm run build` 성공
- [ ] OCR 분석 페이지 진입 가능
- [ ] 동일 이미지 재분석 시 최소 1회 이상 성공 여부 확인
- [ ] 실패 시 `ocrFailureCode`가 의미 있는 코드로 분류되는지 확인
- [ ] 하네스 승인/검토 상태가 레코드에 반영되는지 확인

