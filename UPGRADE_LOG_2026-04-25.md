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

## 2026-04-26 규칙 실시 결과
- 고정 실행 순서(운영 규칙):
  1. `npm run analyze:backfill-readiness`
  2. `npm run analyze:policy-impact:full`
  3. `npm run check:score-consistency:strict8`
  4. `npm run verify:release`
- 실행 상태: 시도함
- 차단 원인: 현재 터미널 환경에서 `npm`/`node` 명령 미인식(`CommandNotFoundException`)
- 조치 사항:
  - 런타임 복구 전까지 규칙 실행은 보류
  - 복구 즉시 동일 순서로 재실행 후 결과를 운영일지/업그레이드 로그에 반영

## 다음 시작 시 우선 확인 순서
1. 본 문서: `UPGRADE_LOG_2026-04-25.md`
2. 세션 체크리스트: `NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md`
3. 상세 이력/배경: `NEXT_SESSION_HANDOFF_2026-04-09.md`

## 다음 세션 첫 작업 권장
- 국적 샘플(태국/베트남/러시아/미얀마) 각 1건으로 리포트 실화면 병기 QA 캡처 체크 수행
- 체크 포인트: 전면(채점근거/코칭/종합진단) + 부록(채점근거/코칭/강점/개선)에서 모국어 병기 일관 노출 확인
