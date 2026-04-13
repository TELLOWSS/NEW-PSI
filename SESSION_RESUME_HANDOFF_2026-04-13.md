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
- 내보내기 파일명 규칙 표준화
  - 파일: `utils/exportFileNaming.ts`, `components/modals/RecordDetailModal.tsx`, `pages/Reports.tsx`
  - 내용: PDF/ZIP/CSV/JSON 파일명과 ZIP 루트 폴더명을 공통 토큰 규칙(`PSI_{scope}_{YYYYMMDD[_HHMMSS]}`)으로 통일
- 내보내기 payload 메타(source/version/scope) 공통화
  - 파일: `components/modals/RecordDetailModal.tsx`, `pages/Reports.tsx`
  - 내용: 감사/검증 JSON에 `exportMeta` 추가, CSV에도 `exportSource/exportVersion/exportScope` 행(히스토리는 컬럼) 추가
- 내보내기 시각 포맷 ISO/KST 병행 통일
  - 파일: `utils/exportTimestamp.ts`, `components/modals/RecordDetailModal.tsx`, `pages/Reports.tsx`
  - 내용: JSON에 `exportedAt` + `exportedAtKst`를 함께 저장하고 CSV/히스토리 CSV에도 ISO/KST 시각을 병행 기록
- 증빙 패키지 파일명/manifest/readme 생성시각 기준 통일
  - 파일: `utils/exportTimestamp.ts`, `utils/exportFileNaming.ts`, `utils/evidencePackageTemplate.ts`, `utils/evidenceVerificationUtils.ts`, `pages/Reports.tsx`
  - 내용: 내보내기 파일명 날짜/시간 토큰을 KST 기준으로 통일하고 ZIP `manifest.json`/`README.txt`/`evidence_index.csv` 메타에 `generatedAtKst`를 병행 기록
- 배치 검증 완료(릴리스)
  - 실행: `npm run verify:release` (로컬)
  - 결과: `verify:fast` + `vite build` 모두 성공, UI+docs 범위 배치 종료
- Reports 검증 미리보기 시간표시 ISO/KST 병행 통일
  - 파일: `pages/Reports.tsx`
  - 내용: 실패 원인/패키지/히스토리 표의 시각 컬럼을 `ISO / KST` 공통 포맷으로 통일하고 검증 내보내기에 `manifestGeneratedAtKst`를 추가
- ISO/KST 시각 포맷 공용 유틸 추출
  - 파일: `utils/exportTimestamp.ts`, `pages/Reports.tsx`
  - 내용: `formatIsoKstTimestamp`를 공용 유틸로 분리해 Reports 내부 중복 포맷 함수를 제거
- 로컬 복구 메모(재동기화 필요)
  - 내용: 로컬 자동치환 중 `pages/Reports.tsx` 손상으로 `origin/main` 기준 복구 후 `verify:fast` 통과
  - 메모: 워크스페이스 최신 Reports 변경분(검증 시각 표기 통일)은 다음 로컬 동기화 배치에서 안전 방식으로 재적용 필요
- hotspot 문법 사전검사 가드 추가
  - 파일: `scripts/check-hotspot-syntax.cjs`, `package.json`
  - 내용: `verify:fast`에 `check:hotspot`을 추가해 `pages/Reports.tsx`/`utils/exportTimestamp.ts` 구문 손상을 타입검사 전에 조기 차단
- 검증 가이드 업데이트 + 릴리스 재검증
  - 파일: `VERIFICATION.md`
  - 내용: `check:hotspot` 포함 항목과 대용량 TSX 동기화 시 블록 단위 패치 원칙을 문서화
  - 검증: 로컬 `npm run verify:release` 재통과 (`check:context -> check:hotspot -> check:tdz -> check:types -> build`)
- 로컬 Reports 부분 재동기화(안전 최소 반영)
  - 파일: `pages/Reports.tsx`
  - 내용: 증빙 패키지 `generatedAtKst`를 로컬 구버전 Reports의 CSV/manifest 메타에 우선 반영
  - 검증: 로컬 `npm run verify:fast` 통과 (`check:hotspot` 포함)
- 로컬 Reports 재적용 안정화(템플릿 문자열 치환 주의)
  - 파일: `pages/Reports.tsx`
  - 내용: PowerShell 치환 실패로 롤백 후, Python 블록 치환으로 `README` 생성시각 `ISO/KST` + `generatedAtKst` 메타를 재적용
  - 검증: 로컬 `npm run verify:release` 재통과
- hotspot 가드 정책 조정(레거시 1줄 경고 허용)
  - 파일: `scripts/check-hotspot-syntax.cjs`, `VERIFICATION.md`
  - 내용: `Reports`의 `toLocaleString()`은 기본 차단하되, 로컬 구버전 `README 생성시각` 1줄은 경고(WARN)로만 처리
  - 검증: 로컬 `check:hotspot` WARN 1건 상태에서 `verify:fast`/`verify:release` 통과
- hotspot WARN 상한 고정(1건)
  - 파일: `scripts/check-hotspot-syntax.cjs`, `VERIFICATION.md`
  - 내용: 레거시 WARN이 1건을 초과하면 즉시 실패하도록 가드 강화
  - 검증: 로컬 `check:hotspot` WARN 1건 유지 + `verify:fast`/`verify:release` 통과

## 2) 현재 운영 기본 명령
- 빠른 사전확인: `npm run verify:fast`
- 릴리스 전 묶음검증: `npm run verify:release`

## 3) 다음 우선순위
1. `workflow-status` 차단 사유 원문을 서버(`router.ts`)에서도 운영형 문구로 직접 통일
2. Reports/RecordDetail 공통 액션 문구의 축약 기준(짧은 버전/상세 버전) 분리
3. Vercel 인증 복구 후 preflight 재검증 (`vercel pull` -> `vercel build`)

## 4) 재시작 체크리스트
- [x] `npm run verify:fast` 실행
- [ ] 작업 묶음 1개만 선택해서 수정
- [x] 완료 후 `npm run verify:release` 1회
- [ ] 본 문서에 완료 항목 append
