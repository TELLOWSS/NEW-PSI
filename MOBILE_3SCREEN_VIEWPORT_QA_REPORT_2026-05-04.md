# MOBILE 3SCREEN VIEWPORT QA REPORT (2026-05-04)

- 대상 화면: Dashboard / OcrAnalysis / PredictiveAnalysis(AI 리스크)
- 기준 뷰포트: 320x568 / 360x800 / 375x812 / 390x844
- 기준 문서:
  - [MOBILE_VIEWPORT_QA_CHECKLIST.md](MOBILE_VIEWPORT_QA_CHECKLIST.md)
  - [MOBILE_3SCREEN_DETAILED_SPEC_2026-05-04.md](MOBILE_3SCREEN_DETAILED_SPEC_2026-05-04.md)
  - [MOBILE_3SCREEN_VIEWPORT_QA_FIELD_FORM_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FIELD_FORM_2026-05-04.md)
  - [MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md)

---

## 1) 점검 방식
- 1차: 코드 반영 기준 정적 QA (클래스/레이아웃/CTA 배치/반응형 분기 점검)
- 2차: 실뷰포트 수동 QA (DevTools 4해상도 + 터치 동작 + 콘솔 에러)
- 선행 게이트: 타입/빌드/테스트 자동 검증

본 문서는 1차 정적 QA 결과를 기록하며, 2차 실뷰포트 검증은 다음 세션에서 PASS/FAIL 확정한다.

### 실행 환경 동기화 조치 (2026-05-04)
- 증상: 문서/가상 워크스페이스 반영 대비 로컬 실행 화면에서 변경 미노출
- 원인: 가상 워크스페이스와 로컬 실행 저장소 간 반영 시점 불일치
- 조치: 로컬 실행 저장소(`C:/Users/user/OneDrive/Desktop/개발실/new-psi/NEW-PSI`)에 3개 화면 패치 재적용 완료
  - `pages/Dashboard.tsx`
  - `pages/OcrAnalysis.tsx`
  - `pages/PredictiveAnalysis.tsx`
- 상태: 재현 종료, 현재 로컬 실행 기준으로 모바일 UI 변경 확인 가능한 상태

### 빈 화면 이슈 조치 (2026-05-04)
- 증상: 부트스트랩 화면에서 정지, 앱 본문 미마운트
- 원인: Supabase 환경변수 미설정 시 `lib/supabaseClient.ts`에서 초기화 예외 발생
- 조치:
  - 부트스트랩 진단 메시지 화면 출력 강화
  - `lib/supabaseClient.ts`를 비중단 폴백 구조로 변경(앱 마운트 유지, Supabase 기능만 비활성)
- 상태: 화면 정상 가동 확인(사용자 확인 완료)

### 선행 게이트 실행 결과 (2026-05-04)
- `npm run check:types`: PASS
- `npm run build`: PASS
- `npm test -- --run`: PASS (34/34)
- 비고: 실행 경로는 로컬 미러 저장소(`C:/Users/user/OneDrive/Desktop/개발실/new-psi/NEW-PSI`) 기준

---

## 2) 화면별 1차 정적 QA 결과

### A. Dashboard
- [x] 모바일 액션 버튼 전체폭(`w-full sm:w-auto`) 적용
- [x] 모바일 하단 고정 CTA(`분석 시작`) 추가
- [x] 터치 타겟 최소 높이(44px 이상) 반영
- [ ] 실뷰포트(320/360/375/390) 터치 오동작 최종 확인

### B. OcrAnalysis
- [x] 상단 체크리스트 4항목 추가(가독성 우선)
- [x] 파일 선택 후 모바일 하단 고정 CTA(`분석 시작`) 추가
- [x] 기존 `신규 분석 시작` 버튼과 동시 노출 조건 정리
- [ ] 실뷰포트에서 키보드/권한 팝업 충돌 여부 최종 확인

### C. PredictiveAnalysis(AI 리스크)
- [x] 상단 점수 게이지(78/100 형태 대응 구조) 추가
- [x] 위험 3버킷(Red/Yellow/Green) 카드 추가
- [x] 빠른 액션 3개(경향 분석/개별 점검 영역/AI 인사이트) 추가
- [x] AI 리스크 헤더 카피 정렬(모바일 우선 가독성)
- [ ] 320 폭 1스크롤 내 핵심 정보 노출 최종 확인

---

## 3) 뷰포트별 결과 기록 (2차 실측용)

### 320x568
- 결과: PENDING
- 확인 예정 항목:
  - [ ] Dashboard 하단 고정 CTA와 기존 하단 UI 겹침 없음
  - [ ] OcrAnalysis 고정 CTA + 안내 토스트 동시 노출 시 가림 없음
  - [ ] AI 리스크 게이지/3버킷/액션 1스크롤 가독성 유지

### 360x800
- 결과: PENDING
- 확인 예정 항목:
  - [ ] Dashboard KPI/상단 배지 줄바꿈 가독성
  - [ ] OcrAnalysis 상단 체크리스트 2열 가독성
  - [ ] AI 리스크 요약 카드 탭 반응

### 375x812
- 결과: PENDING
- 확인 예정 항목:
  - [ ] iOS 계열 안전영역(inset)에서 하단 CTA 터치 정상
  - [ ] OcrAnalysis 테이블/카드 가독성 유지
  - [ ] AI 리스크 액션 버튼 오터치 없음

### 390x844
- 결과: PENDING
- 확인 예정 항목:
  - [ ] 카드 간격 확장 상태에서 시각 균형 유지
  - [ ] 하단 고정 CTA shadow/겹침 이슈 없음
  - [ ] 콘솔 에러 0건

---

## 4) 이슈 및 리스크
- 현재는 코드 기준 정적 QA 완료 상태이며 실기기/실뷰포트 캡처 증빙은 미수집.
- 고정 CTA가 있는 2개 화면(Dashboard/OcrAnalysis)은 실제 브라우저 하단 UI와의 중첩 여부를 반드시 실측해야 함.
- 자동 게이트는 통과했으나, 뷰포트/터치/노치 안전영역 이슈는 실측 없이는 최종 PASS 확정 불가.

---

## 5) 다음 세션 실행 순서
1. DevTools 320x568으로 Dashboard/OcrAnalysis/PredictiveAnalysis 순차 점검
2. 360/375/390 반복 점검
3. 콘솔 에러 확인
4. [MOBILE_3SCREEN_VIEWPORT_QA_FIELD_FORM_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FIELD_FORM_2026-05-04.md)에 실측값 입력
5. [MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md) 작성
6. 본 문서의 PENDING을 PASS/FAIL로 확정
7. 운영일지에 최종 결과 반영
