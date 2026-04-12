# SESSION RESUME HANDOFF (2026-04-13)

## 1) 이번 세션 누적 완료
- Reports 런타임 오류(TDZ) 수정
  - 파일: `pages/Reports.tsx`
  - 내용: `useEffect` 의존성에서 선언 전 참조 제거 (`availableFailureReasons`, `availablePackages` 기반으로 보정)
- Dashboard drill-down 후속 마감 보정
  - 파일: `pages/Dashboard.tsx`
  - 내용: `trade-hotspot` 비교를 `normalizeDashboardTrade` 기준으로 통일
- 토큰 절약형 검증 흐름 고정
  - 파일: `package.json`, `scripts/check-tdz-useeffect-order.cjs`, `VERIFICATION.md`
  - 스크립트: `check:tdz`, `check:types`, `verify:fast`, `verify:release`
- workflow-status 액션/차단 사유 문구 통일 보강(내보내기 정합)
  - 파일: `components/modals/RecordDetailModal.tsx`
  - 내용: 감사 JSON/CSV 내보내기에 액션 라벨 + 정규화된 차단 사유(`normalizeHarnessTransitionReason`) 반영
- workflow-status 차단 사유 서버 원문 운영형 문구 통일
  - 파일: `lib/server/harness/router.ts`
  - 내용: 상태/액션 차단 메시지를 한국어 운영형 라벨 기준으로 생성하도록 보강
- 저장소 컨텍스트 사전점검 자동화 추가
  - 파일: `scripts/check-repo-context.cjs`, `package.json`, `VERIFICATION.md`
  - 내용: `check:context`를 `verify:fast` 선행 단계로 추가해 경로 불일치(예: 서버 하네스 경로 누락) 시 작업 범위를 먼저 고정
- 액션/차단 사유 문구 공통 포맷 잠금(UI+CSV)
  - 파일: `utils/harnessTransitionNarratives.ts`, `components/modals/RecordDetailModal.tsx`
  - 내용: `formatHarnessTransitionStatusText` 공통 포맷 함수를 추가하고 Record Detail UI/감사 CSV가 동일 문구를 사용하도록 통일
- Reports Action Readiness 상세 라인 공통 포맷 적용
  - 파일: `pages/Reports.tsx`
  - 내용: Action Readiness 카드에 액션별 상태 라인을 추가하고 `formatHarnessTransitionStatusText` 기준으로 문구를 통일
- 감사 내보내기 CSV/JSON 필드명 한글 라벨 병행 통일
  - 파일: `utils/auditExportLabels.ts`, `components/modals/RecordDetailModal.tsx`, `pages/Reports.tsx`
  - 내용: section/item 코드에 대응하는 한글 라벨(`sectionLabel`, `itemLabel`)을 CSV에 추가하고 JSON에도 라벨 가이드를 포함

## 2) 현재 운영 기본 명령
- 빠른 사전확인: `npm run verify:fast`
- 릴리스 전 묶음검증: `npm run verify:release`

## 3) 다음 우선순위
1. `workflow-status` 차단 사유 원문을 서버(`router.ts`)에서도 운영형 문구로 직접 통일
2. Reports/RecordDetail 공통 액션 문구의 축약 기준(짧은 버전/상세 버전) 분리
3. Vercel 인증 복구 후 preflight 재검증 (`vercel pull` -> `vercel build`)

## 4) 재시작 체크리스트
- [ ] `npm run verify:fast` 실행
- [ ] 작업 묶음 1개만 선택해서 수정
- [ ] 완료 후 `npm run verify:release` 1회
- [ ] 본 문서에 완료 항목 append
