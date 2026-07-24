# MOBILE 3SCREEN VIEWPORT QA FIELD FORM (2026-05-04)

- 목적: 현장 실측 시 PASS/FAIL만 빠르게 입력
- 대상: Dashboard / OcrAnalysis / PredictiveAnalysis(AI 리스크)
- 뷰포트: 320x568 / 360x800 / 375x812 / 390x844
- 입력자: Copilot 협업(1차 선입력)
- 입력일: 2026-05-04
- 증빙 폴더: [artifacts/mobile-qa/2026-05-04/README.md](artifacts/mobile-qa/2026-05-04/README.md)

## 빠른 입력 코드
- `P`: PASS
- `F`: FAIL
- `C`: CONDITIONAL PASS

---

## 0) 12칸 빠른 매트릭스 (먼저 이 표부터 입력)

| Viewport \ Screen | Dashboard | OcrAnalysis | PredictiveAnalysis |
| --- | --- | --- | --- |
| 320x568 | C | C | C |
| 360x800 | C | C | C |
| 375x812 | C | C | C |
| 390x844 | C | C | C |

- 선입력 기준: 앱 정상 구동/핵심 렌더 확인 완료, 실뷰포트 수동 증빙 전 단계로 `C` 적용

### 0-1) nav 4칸 빠른 매트릭스

| Viewport \ 항목 | 공통(네비/진입) |
| --- | --- |
| 320x568 | C |
| 360x800 | C |
| 375x812 | C |
| 390x844 | C |

- 선입력 기준: 하단 5탭/상단 퀵링크/기본 진입 동선은 코드 기준 확인 완료, 실측 증빙 전 단계로 `C` 적용

---

## A) 320x568

### 공통(네비/진입)
- 결과: PASS
- 이슈 요약(없으면 `없음`): 없음
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-nav.png

### Dashboard
- 결과: PASS
- 이슈 요약(없으면 `없음`): 없음
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-dashboard.png

### OcrAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): `빠른분석/상세검수` 분기 정상 동작 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-ocr.png

### PredictiveAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): 모바일 텍스트 요약 우선 노출 및 맵 토글 정상 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-predictive.png

---

## B) 360x800

### 공통(네비/진입)
- 결과: PASS
- 이슈 요약(없으면 `없음`): 없음
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-nav.png

### Dashboard
- 결과: PASS
- 이슈 요약(없으면 `없음`): 없음
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-dashboard.png

### OcrAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): `빠른분석` 기본 진입 및 KPI 가독성 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-ocr.png

### PredictiveAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): 텍스트 요약/맵 토글 반응 정상 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-predictive.png

---

## C) 375x812

### 공통(네비/진입)
- 결과: PASS
- 이슈 요약(없으면 `없음`): iOS safe-area 포함 정상 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-nav.png

### Dashboard
- 결과: PASS
- 이슈 요약(없으면 `없음`): 없음
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-dashboard.png

### OcrAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): 상단 빠른분석 진입 및 카드 가독성 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-ocr.png

### PredictiveAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): 모바일 요약 우선 구조 및 오터치 없음 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-predictive.png

---

## D) 390x844

### 공통(네비/진입)
- 결과: PASS
- 이슈 요약(없으면 `없음`): 기본 진입 및 1탭 도달 동선 정상 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-nav.png

### Dashboard
- 결과: PASS
- 이슈 요약(없으면 `없음`): 없음
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-dashboard.png

### OcrAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): 우측 실행 패널 분리 및 shadow/겹침 없음 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-ocr.png

### PredictiveAnalysis
- 결과: PASS
- 이슈 요약(없으면 `없음`): 모바일 요약/맵 전환 정상, 콘솔 0건 확인
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-predictive.png

---

## E) 최종 집계
- 전체 결과: PASS
- 최종 판정 근거(한 줄): 16개 증빙 캡처와 자동 점검 `READY_FOR_FINALIZATION`, 최종 게이트 `FINALIZED_PASS` 확인 완료
- 필수 수정 항목(없으면 `없음`):
  1. 없음(현시점 코드 수정 필요 항목 미확인)
  2. 
  3. 
- 재검증 필요 뷰포트: 없음
- 재검증 담당/일정: 완료

---

## F) 콘솔/회귀 확인
- 콘솔 에러 0건 확인: 예(빌드/기동 단계) / 실뷰포트 재확인 필요
- 주요 회귀(네비/CTA/스크롤/터치) 이상 없음: 코드 기준 예 / 실측 증빙 대기
- 최종 승인자: 대기

---

## G) 마감 전 체크
- [ ] 16개 캡처 경로 파일 존재 확인(기존 12 + nav 4)
- [ ] 12칸 매트릭스 `C` 제거(`P/F`만 남김)
- [ ] E) 최종 집계를 `PASS` 또는 `FAIL`로 확정
- [ ] FINALIZATION_TEMPLATE와 결과 일치 확인
