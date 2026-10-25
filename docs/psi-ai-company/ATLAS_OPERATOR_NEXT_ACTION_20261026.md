# ATLAS · 관리자 첫 행동 명확화 / 중복 UI 조정 (2026-10-26)

## 기존 기능 검증
NEW-PSI `IntegratedWorkBoard`에는 상단 AI 분석 바로가기, 7단계 업무 카드, 교육 환류 허브, 그리고 A4/개인 리포트/월간 계도 작은 버튼이 있다. 교육 카드 아래에도 개인 리포트/A4의 **동일 목적지 바로가기**가 중복 표시돼 불필요한 화면 밀도를 만든다. 기존 심사자료나 보고서를 삭제하지 않고 **중복 아래쪽 바로가기 2개만 제거**, 원래 카드와 교육 환류 허브는 유지.

`utils/operationsBoard.ts`는 기존 `hasValidSafetyScore` 자체 구현이 `Number(null)`, `Number('')`, `Number('0')`를 0으로 변환하여 잘못된 보호 우선 점수 신호가 생길 수 있었다. PR #83의 미병합 제안과 같은 실제 오류이므로 현재 운영 `coreMetrics.hasValidSafetyScore`를 직접 재사용하도록 고정한다. 자동 중지·재개 판정은 추가하지 않는다.

## 실제 코드
- `utils/operatorNextTask.ts`가 최신 유효 위험성평가 레코드만 토대로 ① 빈 자료 입력 → ② 기록된 작업중지 신호 근거 확인 → ③ 보호우선 근거 검토 → ④ 검토 대기 → ⑤ 유효 점수 없음 → ⑥ 교육 환류 흐름을 제안한다.
- `IntegratedWorkBoard` 상단에 **현재 확인할 한 가지 작업 + 사진점검·재점검 바로가기**. 인간 검토·서버 별도 저장소·제한된 입력 경로에 대한 경계 안내.
- 교육 환류의 A4/리포트 소형 카드 그대로 유지, 카드 아래 동일 목적의 중복 텍스트 버튼만 제거.
- `utils/operationsBoard.ts`가 점수 결측·빈 문자열·숫자문자열(0)에서 가짜 0을 만들지 않도록 동일 핵심 공식 계산을 사용.
- `tests/operationsBoard.test.ts` 및 `tests/operatorNextTask.test.ts`: 결측/0/100·최신 누락·고위험 자가진술·중지 신호·검토 대기·업무 동선 중복.

## 경계/QA
- 본 프로그램은 안전관리자/운영자 전용. 근로자 QR 입력 화면은 별개이며 운영자 프로그램 배포를 뜻하지 않는다.
- 협력사 산업안전보건관리비, 안전시설·신호수 인건비 독립 관리 제품/SMART TBM/ZERO DAY 변경 없음.
- 미병합 PR #83의 일부 아이디어(보호 우선 점수 보호)는 **이 PR에서 별도 구현**, PR #83 전체 내용의 승인/병합과 동일하지 않음. 오래된 로드맵 스냅샷·조직 현황 PR은 별도 검토.
- PR head verify:ci + PSI 7개 합성 Playwright + 같은 SHA Vercel Preview READY → main 병합 → Production READY 및 운영 도메인 alias SHA 확인. 실제 Android 실사용·현장 안전 승인 검증은 별개.
