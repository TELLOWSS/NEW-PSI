# UPGRADE LOG · 2026-04-25

## 목적
- 금일 업그레이드 사항을 다음 프로그램 시작 시 즉시 파악할 수 있도록 단일 기준 문서로 기록.

## 금일 완료 항목

### 1) 근로자 기록 상세 검증 UI 밀도 개선
- 대상: `components/modals/RecordDetailModal.tsx`
- 개선 요약:
  - 간단 보기/상세 보기 토글 추가 및 기본값을 간단 보기로 설정
  - 모바일은 기본 간단 보기 고정 + `상세 잠깐 보기` 임시 확장 방식 적용
  - 간단 보기 정보량 추가 축소(상태칩 1개, 관리자 판단 카드 중심, 텍스트 길이 단축)
  - 카드 높이/패딩 조정으로 시각 피로도 완화
- 기대 효과:
  - 현장 검수 시 첫 화면 인지 부담 감소
  - 모바일 과밀 정보 노출 방지

### 2) OCR 분석창 선택 기반 운영 기능 추가
- 대상: `pages/OcrAnalysis.tsx`
- 개선 요약:
  - `선택 삭제` 기능 추가 (선택 근로자만 일괄 삭제)
  - `선택만 재분석` 기능 추가 (선택된 근로자 중 재분석 가능 대상만 실행)
  - 선택 건수 배지 추가, 데이터 변경 시 선택 ID 자동 정리
- 기대 효과:
  - 대량 운영 시 불필요한 전체 재분석/개별 삭제 반복 감소
  - 작업자 단위 정밀 조치 속도 향상

### 3) 개인별 국적 모국어 병기 누락 보강
- 대상: `components/ReportTemplate.tsx`
- 개선 요약:
  - 외국인 근로자에서 native 필드 누락 시 병기가 끊기던 경로 보강
  - 채점근거/강점/개선/코칭/종합진단에 국적 기반 fallback 모국어 문구 강제 적용
  - 전면/부록 코칭 모국어 소스 로직 일원화
- 기대 효과:
  - 개인 리포트에서 국적별 모국어+한국어 병기 일관성 확보
  - 과거 데이터(native 일부 누락)에서도 안내 품질 유지

## 확인/검증 결과
- `components/modals/RecordDetailModal.tsx`: 오류 없음
- `pages/OcrAnalysis.tsx`: 오류 없음
- `components/ReportTemplate.tsx`: 오류 없음

## 다음 시작 시 우선 확인 순서
1. 본 문서: `UPGRADE_LOG_2026-04-25.md`
2. 세션 체크리스트: `NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md`
3. 상세 이력/배경: `NEXT_SESSION_HANDOFF_2026-04-09.md`

## 다음 세션 첫 작업 권장
- 국적 샘플(태국/베트남/러시아/미얀마/우즈베키스탄) 각 1건으로 리포트 실화면 병기 QA 캡처 체크 수행
- 체크 포인트: 전면(채점근거/코칭/종합진단) + 부록(채점근거/코칭/강점/개선)에서 모국어 병기 일관 노출 확인

---

## 2026-05-04 현재 계획사항 기록

### 0) 기록 정책
- 본 문서에서는 `커밋사항`을 별도 관리하지 않음(요청 반영: 커밋사항 기록 제외).
- 세션 종료 기록은 `NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md`의 종료 메모 템플릿 기준으로만 작성.

### 1) 모바일 UI/UX 전면 고도화 계획 (목업 기준)
- 정보 구조 고정: 상단 인사/알림 → 핵심 KPI 3개 → 위험 분포 → 최근 리포트 → 하단 고정 CTA.
- 테마 전략: 다크/혼합/라이트 3모드에서 동일 레이아웃 유지(테마만 변경).
- 핵심 화면 우선순위: Dashboard, OCR 분석, AI 리스크 분석 3화면을 1차 고정 트랙으로 운영.

### 2) 실행 단계
1. 컴포넌트 규격 확정 (간격/타이포/카드/버튼/게이지 공통 규격)
2. 핵심 3화면 모바일 퍼스트 리팩터링
3. 320/360/375/390 뷰포트 수동 QA 체크리스트 전수 수행
4. 현장 시나리오(3분 점검 스크립트) 기준 회귀 검증

### 3) 종료 전 필수 기록 항목 (매일)
- 오늘 실행 명령
- 마지막 성공 명령
- 산출물 파일
- OCR_REQUIRED 건수
- 주요 의사결정(유지/변경)
- 다음 세션 첫 작업 1개

### 4) 다음 작업 1순위
- [MOBILE_3SCREEN_VIEWPORT_QA_REPORT_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_REPORT_2026-05-04.md) 기준 320/360/375/390 뷰포트 PASS/FAIL 확정 및 캡처 증빙 수집.

---

## 2026-05-04 추가 진행 요약 (실행 안정화)

### A) 구현/기동 상태
- 모바일 3화면(Dashboard/OcrAnalysis/PredictiveAnalysis) 구현 반영 상태 유지
- 로컬 실행 환경에서 화면 정상 가동 확인 완료

### B) 빈 화면 대응
- 원인: Supabase 환경변수 미설정 시 `lib/supabaseClient.ts` 초기화 예외로 앱 마운트 중단
- 조치: Supabase 클라이언트를 비중단 폴백 구조로 변경해 앱 마운트 유지
- 결과: 환경변수 미설정 환경에서도 UI 기동 가능(해당 기능만 비활성)

### C) QA 문서 상태
- `MOBILE_3SCREEN_VIEWPORT_QA_FIELD_FORM_2026-05-04.md`: 12칸 매트릭스 `C` 선입력 완료
- `MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md`: 임시 판정 `CONDITIONAL PASS` 반영
- `MOBILE_3SCREEN_VIEWPORT_QA_REPORT_2026-05-04.md`: 뷰포트 결과를 `CONDITIONAL PASS(증빙 대기)`로 동기화

### D) 남은 최종 작업
- 320/360/375/390 실뷰포트 캡처 경로를 FIELD_FORM에 입력
- QA REPORT 및 FINALIZATION_TEMPLATE에서 `CONDITIONAL PASS`를 `PASS/FAIL`로 최종 확정

### E) 구조 재편 방향 문서화
- 모바일 우선 IA + PC 후속 재구성 전략 문서를 신규 작성
- 참조: [MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md](MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md)
- 적용 원칙: 모바일은 행동 중심, PC는 운영 중심
