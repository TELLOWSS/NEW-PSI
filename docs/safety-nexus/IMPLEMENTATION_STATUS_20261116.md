# 통합 시각·업무 기획 구현 현황 — 2026-11-16

이 문서는 `PSI_VISUAL_IDENTITY_MASTER_PLAN_V2.md`의 VI-01~15를 현재 코드와 대조한 인계표다. 전체 기획 완료 또는 운영 검증 완료 선언이 아니다. 로컬 변경을 운영 반영으로 표시하지 않는다.

## 기준과 책임

- 대상: `TELLOWSS/NEW-PSI`, 작업 브랜치 `codex/nexus-accessibility-20261116`.
- 이번 작업 시작 기준 `main`: `8e46c63faf0a9eff0f070fd1c2f85fd980bfe3e0`.
- 총괄의 이번 세션 Vercel 조회: production `dpl_7vj6t2QUJyimdUVMryS6uxUaodsG`, READY, 위 SHA, `new-psi-eta.vercel.app`. 이후 변경의 배포 증거로 재사용하지 않는다.
- CORE 구현, NAVI/LUMI 표현, SAFI 안전 의미, KEEPER 권한 경계, PROOF 회귀 기준을 분리한다. 작업별 실제 자동검사와 별도 검토 결과를 아래에 기록한다.

## 계획 대조표

| ID | 코드상 구현·검토 범위 | 남은 수용 조건 |
|---|---|---|
| VI-01 기준 고정 | v2 기획서에 원본 영상 SHA·시간별 프레임 검토, 기준 소스·캡처 존재. 이번 main/production 재조회 | 새 배포마다 최종 SHA·CI·alias 갱신 |
| VI-02 상태·분모 | `safetyNexusViewModel`은 로드된 기록행 범위, `scopeVerified:false`, `officialReportComparable:false`. 조회중/실패/빈 자료 구분. 중복·충돌 후속조치 집계 보강 | 실제 서버 조회 범위·revision·수신시각과 전체 모집단 연결 |
| VI-03 모션 | CSS/Canvas/WebGL 정지, OS 모션 축소 변경 반영, 몰입 포커스·배경 inert 보강 | 최신 통합 브라우저 재실행, 사람의 모션·스크린리더 확인 |
| VI-04 모바일·빈 상태 | Nexus 핵심 글자·터치·우선목록, 조회 실패를 0으로 표시하지 않는 분기 | 실제 200% 확대·야외 판독·11개 언어·물리 기기 |
| VI-05 우선목록 | 기한초과/미완료/재확인 기한초과 건수에서 같은 기준일·공종·작성기간의 목록 연결 | 실제 전체 긴급위험 큐·다현장 범위. 현재 목록을 전체 긴급위험이라고 부르지 않음 |
| VI-06 근거·복귀 | 원기록 상세 열기, 문항별 조치 이력, Dashboard 공종 전달. 중복 이력 및 충돌 제외 규칙 공유 | 현황판 기간·공종과 Nexus 월·2D 선택 복원 검증, 스크롤 복원 구현. 사건 단위 교육·차기평가 관계의 완전한 연결 |
| VI-07 지표 | 기존 점수 근거·유효 n/N·결측/제외·원자료 버튼 구현. Dashboard/월간보고서 결측 0 보정 | 계획의 6관점과 기존 점수 필드는 다름. 공식 산식·원자료 정의 없이는 임의 매핑 불가. 운영 공식 보고서 대조 |
| VI-08 디자인 시스템 | 기존 상태 배지와 공통 EvidenceScopePanel 도입 | 전체 화면 토큰 적용·밝은 환경·흑백 인쇄·상태별 대비 검수 |
| VI-09 전 제품 적용 | Inspector 통합 조치대장, 교육 환류, 월간보고서의 범위·출처 표시 및 재조회 실패 시 이전자료 보존 구현 | 실제 촬영→조치→재점검→교육 전체 여정, 공유/PDF·인쇄 일치 |
| VI-10 입체 완성 | native WebGL 넓은 궤도·선택·12초 연출, GPU 실패 대체 구현 | 사용자 영상과 질적 비교·실제 연결 ID 대응·미감 판단 V01~V07 |
| VI-11 2D 동등 기능 | 동일 DOM의 목록·근거·행동을 2D/3D에서 재사용, 키보드·모션축소 보강 | 최신 전체 회귀·실제 보조기술·모바일 입력 시험 |
| VI-12 인증 현장 자료 | `tenantNexusSiteRead` 개인 JWT/tenant/site membership read-only 계약, 출처·분모 도구 및 제안 SQL. 서버 기능 기본 OFF | 신뢰할 원기록의 site 소유권·revision reader/writer, 실제 RLS·원자료·보고서·독립 검토. 제안 SQL은 운영 migration 아님 |
| VI-13 현장 검증 | 합성 브라우저 및 모바일 에뮬레이션 도구 존재 | Android/iPhone 물리 기기, 10분 발열·배터리·실제 FPS, 11개 언어 통역, 관리자/초보자 형성 평가 |
| VI-14 회귀·증거 | 이번 변경 관련 단위·브라우저 검사 확장. 필수 전체 `verify:ci`와 회사 브라우저 게이트 유지 | 최종 통합 코드의 실행 결과·산출물·CI 증거 기록 |
| VI-15 출시·롤백 | UI와 3D의 독립 빌드 플래그 추가, 서버 조회 플래그와 분리 | 호출부 통합 및 UI OFF/3D OFF 개발서버 브라우저 검증 완료. 롤백 빌드 검증, 최종 PR CI·배포 SHA·alias 일치. 운영 데이터 활성화는 별도 조건 |

## VI-12 운영 경계

현재 서버 코드의 `PSI_NEXUS_SITE_READ_ENABLED`는 정확히 문자열 `true`일 때만 조회를 허용한다. 미설정이나 다른 값이면 인증·DB 호출 전 503 `NEXUS_NOT_ACTIVATED`를 반환한다. UI 플래그로 서버 권한을 열 수 없다.

`tenantNexusSiteRead`는 현장 소속을 읽고 staging aggregate를 조회하는 계약이며, 실제 WorkerRecord site 연결을 인증하는 완성본이 아니다. 현장 목록의 `sourceReady:false`, `sourceAvailability:PROPOSAL_ONLY_NOT_ACTIVATED`와 aggregate의 공식 보고서·재점검·작업재개 검증 false를 유지한다. 기존 제안 SQL·합성 PGlite 검사를 운영 정책 검증 완료로 표현하지 않는다.

이 작업에서 운영 DB·Storage·RLS 변경, 실근로자 자료 복제, 사이트 조회 플래그 활성화를 수행하지 않았다.

## VI-13 물리 기기 확인

2026-11-16 이 작업 환경에서 `Get-Command adb`와 통상 SDK 경로 `C:/Users/user/AppData/Local/Android/Sdk/platform-tools/adb.exe`, `C:/Android/platform-tools/adb.exe`를 확인했으나 발견하지 못했다. 이는 모든 연결 기기의 부재를 증명하지 않는다. 실제 기기 연결·조작·온도·배터리 측정을 완료할 근거를 확보하지 못했다.

`verify-safety-nexus-browser.mjs`의 `realDeviceValidated:false` 및 RAF cadence의 “not native GPU FPS” 표시를 유지한다. 통역자 의미 검수·교육 이해확인·사용자 시험은 자동 번역 검사로 대체하지 않는다.

## VI-15 기능별 복귀 방법

`config/nexusFeatureFlags.ts`의 공개 빌드 설정:

| 설정 | 동작 |
|---|---|
| `VITE_PSI_NEXUS_UI_ENABLED=false` | 신규 Nexus 보기 차단, 기존 Dashboard 사용 |
| `VITE_PSI_NEXUS_3D_ENABLED=false` | Nexus 근거·목록은 유지, 입체 렌더 비활성 |
| 두 값 모두 미설정 | 이미 출시된 선택형 보기를 유지 |
| 명시된 값이 `true`가 아닌 오타·빈 값 | 해당 기능 OFF |
| `PSI_NEXUS_SITE_READ_ENABLED` | 위 UI 설정과 독립적인 서버 조회 게이트. 운영 활성화하지 않음 |

Vite 환경변수는 빌드 시점 설정이다. 변경 후 같은 소스를 재빌드·배포해야 하며 즉시 runtime kill switch로 설명하지 않는다. 기록 삭제나 DB rollback은 시각 기능 복귀에 포함하지 않는다. UI OFF·3D OFF 두 빌드의 실제 진입/버튼/근거 확인이 배포 전 필요하다.

## 이번 독립 단위 검증

실행 명령:

```text
npx vitest run tests/nexusFeatureFlags.test.ts tests/tenantNexusSiteRead.test.ts tests/nexusSourceProvenance.test.ts tests/nexusSiteAggregateScope.test.ts tests/nexusReportProvenanceSql.test.ts
```

결과: **5개 파일 48개 테스트 PASS**, 2026-11-16 로컬 실행. 합성 데이터·권한 모형 검사이며 운영 DB 조회, 전체 회귀, 실제 기기 또는 새 production 배포 검증이 아니다. 최종 통합 검증은 총괄이 추가 기록한다.

## 통합 검증·수정 기록

- 전체 `npm run verify:ci`: 247파일, 1,943테스트 PASS. production 의존성 high 이상 취약점 게이트 통과(기존 moderate 5건), 빌드 PASS. 로컬 Node 24.16.0이며 CI 지정 Node 22 결과는 별도로 확인한다.
- `node scripts/verify-psi-company-browser.mjs`: 제품 10흐름 PASS, Nexus 57/57. 이후 현황판 기간/스크롤 복원 변경을 포함한 최종 10흐름 검사를 다시 실행한다.
- `node scripts/verify-nexus-workflows.mjs`: 중복 ID 편집 차단, 몰입 해제 후 원기록 열기, 문항별 목록, 현황판 공종/기간 및 Nexus 작성월/2D 복원, UI OFF/3D OFF PASS. CI 단계에 연결했다.
- `PSI_QA_SCENARIOS=global-register-fields node scripts/verify-inspector-quick.mjs`: 320/390/768/1440, CSV/필터, 재조회 503 후 이전자료 보존 PASS.
- Aside 실제 Chromium 검토: 합성 fixture만 사용하여 390/1440 우선목록·Q2 이력·2D/3D·키보드·중복편집 경고 확인. 물리 기기 시험이 아니다.
- 독립 코드 리뷰 P1 두 건 수정: 몰입 중 배경 inert 해제 후 상세창 열기; 중복 기록 상세 편집 차단 및 App 저장 단계의 중복 ID 덮어쓰기 거부.
- Windows 줄바꿈에 종속된 기존 계약검사 2건을 LF 정규화하도록 수정했다. 검사 내용은 제거하지 않았다.

남은 작업은 자동검사 완료로 대체하지 않는다. 특히 승인된 6관점 산식, 실제 현장 원자료/RLS/공식 보고서 대조, 통역자·실기기·사용자·미감 검수는 미완료다. 현재 구현은 해당 경계를 화면에 표시하며 자동 안전 승인이나 운영 DB 변경을 하지 않는다.

### 최종 후속 검증

- 현황판 클릭 직전 자동 스크롤 위치를 capture 단계에서 저장하도록 보강. 합성 왕복에서 기대 45px/복귀 45px 일치, 공종·기간·Nexus 월·2D 선택 복원 PASS.
- UI OFF와 3D OFF는 별도 production 빌드 및 preview에서 확인했다. 테스트 산출물은 `artifacts/audit/nexus-rollback-*`로 분리하며 배포 빌드에 fixture를 포함하지 않는다.
- 최종 제품 브라우저 재실행도 10/10, Nexus 57/57 PASS. 후속 스크롤 보강은 전용 왕복 검사·타입·빌드를 재검증했다.
- GitHub 검토본: https://github.com/TELLOWSS/NEW-PSI/pull/233 . 원격 CI·배포 결과는 이 PR 최신 HEAD 기준으로 확인한다.

- 개발서버 왕복 재검증에서 Dashboard 최초 마운트의 기존 scroll-to-top이 복원 위치를 덮는 경우를 추가 발견했다. UI 모드가 실제 바뀐 경우만 상단 이동하고, 탐색 시점에 위치를 보존하도록 교정. 최종 통합 스크립트 기대 83px/복귀 83px 및 네 가지 흐름 모두 PASS.
