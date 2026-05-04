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
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 하단 5탭 active 동기화 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-nav.png

### Dashboard
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 실뷰포트 터치/겹침 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-dashboard.png

### OcrAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 키보드/권한 팝업 충돌 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-ocr.png

### PredictiveAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 1스크롤 가독성 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/320-predictive.png

---

## B) 360x800

### 공통(네비/진입)
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 상단 퀵링크 횡스크롤/탭 오작동 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-nav.png

### Dashboard
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 실제 터치 동작 증빙 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-dashboard.png

### OcrAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 2열 가독성 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-ocr.png

### PredictiveAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 탭 반응 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/360-predictive.png

---

## C) 375x812

### 공통(네비/진입)
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): iOS safe-area + 하단 5탭 가림 여부 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-nav.png

### Dashboard
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, inset 터치 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-dashboard.png

### OcrAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 표/카드 가독성 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-ocr.png

### PredictiveAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 오터치 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/375-predictive.png

---

## D) 390x844

### 공통(네비/진입)
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 기본 진입 `dashboard` 후 1탭 도달 동선 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-nav.png

### Dashboard
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 확장 간격 시각 균형 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-dashboard.png

### OcrAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, shadow/겹침 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-ocr.png

### PredictiveAnalysis
- 결과: CONDITIONAL PASS
- 이슈 요약(없으면 `없음`): 정상 구동 확인, 콘솔 0건 실측 대기
- 캡처 경로: artifacts/mobile-qa/2026-05-04/390-predictive.png

---

## E) 최종 집계
- 전체 결과: CONDITIONAL PASS
- 최종 판정 근거(한 줄): 앱 정상 구동 및 핵심 UI 렌더 확인 완료, 실뷰포트 증빙 캡처 입력 전 단계
- 필수 수정 항목(없으면 `없음`):
  1. 없음(현시점 코드 수정 필요 항목 미확인)
  2. 
  3. 
- 재검증 필요 뷰포트: 320x568 / 360x800 / 375x812 / 390x844 (증빙 캡처 필수)
- 재검증 담당/일정: 현장 실측 담당 지정 후 당일 마감

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
