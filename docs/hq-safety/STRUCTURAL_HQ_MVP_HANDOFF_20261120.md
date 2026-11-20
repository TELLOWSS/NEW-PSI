# NEW-PSI · HQ-SAFE 골조·형틀 특화 통합 안전관리 1차 구현 인계

작성 기준: 2026-11-20
작업 브랜치: feat/hq-structural-safety-mvp-20261120
제품: TELLOWSS/NEW-PSI (PSI : ZERO DAY / SMART TBM / SMART-SFCS와 별개)

## 본 요청에서 확정한 영역
- 본사 현장점검·행선지 보고
- 사고사례의 기초·지하·지상·옥탑 등 공사구간 / 공종 / 작업별 구조화
- 대표이사 및 본사 주관 교육자료 표준화
- AI 활용 사고조사 및 6하원칙·직접원인·기여요인·근본원인 분리
- 현장 사진점검, 위험성평가, TBM, 조치·재점검·인계 연동 목표
- 골조 특화 공정: 지하 RC 구조물과 일반 형틀 및 지상층 AL폼은 별도 구분

## 실제 변경 파일
- components/hq/StructuralHQWorkbench.tsx — 10개 공정과 위험·확인·증빙 기준정보, 화면 조작, 세션 전용 방문보고·사례등록, 교육 초안, 사고조사 질문 흐름
- components/hq/StructuralHQWorkbench.css — SAFETY NEXUS 톤을 계승하는 반응형 PC·모바일 UI
- pages/SafetyNexus.tsx — 기존 5단계/6대 지표 시제품을 유지하며 새 작업대를 화면 하단에 연결
- tests/hq-structural-workbench.test.ts — 분류 독립성 및 지하 RC 주요 점검 항목의 자동 검사

## 구현된 범위와 경계
구현됨(코드 작성): 공정 분류 탐색, 공사구간(기초·지하·지상·옥탑)과 공정군의 독립 필터, 공정별 위험·점검·증빙 확인, 화면 세션 내 점검 항목 표시, 방문 일정 임시 입력, 사고사례 임시 입력·구간별 분류, 표준 교육자료 텍스트 생성/복사, 정형화된 사고조사 확인질문.

연결하지 않음: 서버 저장, 공동 계정, 현장별 인증 범위, 실제 산재·사고자료, AI 외부 모델 호출, AI 원인 확정, 사고 법정 보고, 교육 승인, PPT 출력, 외부 알림, 기존 근로자 DB 수정.

중요: 비식별·합성 자료만 사용할 수 있는 검토용 시제품. 브라우저 새로고침 시 입력기록이 초기화된다. 점검 체크와 화면 상태는 실제 안전·적합·작업중지/재개 승인 의미가 아니다.

## 다음 개발 단계
1. 본사·현장 역할과 실제 인증 모델 / 데이터 소유권 / 접근통제 설계
2. 방문·점검·사고·교육·조치·재점검의 서버 스키마와 감사로그 설계
3. 산재 신청·승인과 사내 조사·법정 보고상태의 독립 필드 정의
4. 지하 RC 구조물 / 일반 형틀 / AL폼의 공사구간·공종·세부 작업 다차원 분류
5. AI 조사 근거 링크·사실/가설/미확인 구분, 사람 검토·승인, 개인정보 전송 통제
6. PDF/PPT 및 실제 교육 이행 기록, 조치 독립 검증·재확인 기능
7. PC/Android 실기기, 접근성, 보안, 기존 NEW-PSI 회귀 테스트

## 품질 확인 순서
- npm run check:types
- npx vitest run tests/hq-structural-workbench.test.ts
- npm run verify:ci
- node scripts/check-psi-company-ownership.cjs
- node scripts/verify-psi-company-browser.mjs
- GitHub PR CI 및 Vercel Preview의 실제 커밋을 확인

검증을 실제 실행하지 않았으면 완료로 보고하지 않는다. 사용자 최종 승인 전 main 병합·Production 배포 금지.


## 2026-11-20 2차: 사고조사 검토 이력 시제품
구현 파일:
- components/hq/investigationReviewModel.ts — 사고별 독립 검토 초안, 사실 주장(근거번호 의무)/원인 가설/미확인 사항 3분류, 검토 요청 사전조건, 보완 사유, 순차 이력
- components/hq/StructuralHQWorkbench.tsx — 사고 선택 후 증빙항목 입력·참고번호·검토 요청/보완 전환, 항목별 분류 카운트와 변경 이력
- components/hq/StructuralHQWorkbench.css — 작은 화면에서도 동작하는 2단 조사입력·조사목록 UI
- tests/hq-investigation-review.test.ts — 사건 분리, 중복 식별자, 근거누락 차단, 검토 요청 게이트, 수정이력 검증

구현하지 않음: 실제 사진/진술 원본 첨부, 자료번호의 실재 여부 검증, 로그인한 본사 조사책임자의 승인, 외부 AI 호출, 실제 DB 저장/열람/보고. 화면의 '검토 요청 표시'는 현재 브라우저 세션 내 상태 변화일 뿐 실제 결재나 통지가 아니다.

### 기존 인증·현장 RLS 확인 결과
기존 lib/server/tenantAuth.ts의 기업 역할은 owner/admin/reviewer/viewer이고 사용자 세션을 통해 인증한다. 반면 현장 단위 psi_tenant_sites, psi_tenant_site_memberships, 현장 증빙 RLS 제안은 supabase/proposals 아래 보관된 미운영 SQL이며 실제 전현장 API 격리가 완성되지 않았다. 따라서 이 브랜치에서 기업·현장별 권한을 UI 수치나 임의 필터로 대체하지 않으며, 실제 사고 데이터 서버 저장과 운영 적용을 보류한다.

다음 서버 개발은 (1) 인증된 본사/현장 역할과 업무 권한표, (2) 엄격한 tenant_id + site_id FK·RLS, (3) 사고기록과 근거의 불변 원본 및 버전 기록, (4) 작성자와 검토자 분리, (5) 개인정보 최소화/조회 감사, (6) 합성 2현장 교차접근 차단 테스트를 선행해야 한다.

### CI 관찰 기록 (첫 구현본 HEAD 0ee2d49b)
- tests/hq-structural-workbench.test.ts 포함 1,947개 자동 테스트 통과
- release verification 전체 결과는 실패: npm audit에서 effect <=3.22.0 high(RedOS) 1건, fast-uri/glob/minimatch 등 moderate 5건(6 vulnerabilities) 감지
- 의존성 잠금파일을 임의 수정하거나 audit을 비활성화하여 통과 처리하지 말 것. 별도 재현·패치 버전과 의존성 전파 영향 검토 후 해결
- 위 결과는 첫 구현본 시점이며 2차 최신 커밋의 검증 결과를 별도로 확인해야 함


## 2026-11-20 3차: 운영 미적용 현장별 사고기록 SQL 및 실제 RLS 시뮬레이션
- supabase/proposals/psi_hq_incident_case_staging.sql: 사고 기본기록, 사실/가설/미확인 분류자료, 독립 검토 이력을 append-only 별도 테이블로 정의
- 사고 발생 구간(construction_zone)과 공정(process_code)은 별도 데이터 필드
- 필수 tenant_id+site_id 복합 FK, 기업·현장 활성 소속 모두 필요, owner/admin이라도 담당 현장 없는 경우 접근 금지
- 사건·근거·검토 이력은 인증 사용자 INSERT/SELECT만 허용하고 UPDATE/DELETE 미허용
- 독립 검토자가 사건 작성자와 다른 경우에만 review_observed 이력 생성 가능
- SQL에는 review_completed/공식 승인 상태가 아예 존재하지 않음: 원본 검증·승인 서비스 미구현 상태에서 잘못된 확정 불허
- tests/hqIncidentRlsSql.test.ts: 격리 PGlite로 같은 기업 내 현장 간 읽기/쓰기 차단, 기록 불변, 미출처 사실차단, 독립 검토자, 허위 승인 이벤트 차단 검사

**적용 금지:** 해당 SQL은 이미 운영 중인 migrations에 추가하지 않았음. 기존 psi_tenant_sites 및 psi_tenant_site_memberships 자체가 proposal인 상태이므로 별도 선행 정책·마이그레이션 및 기존자료 재분류 승인 없이는 운영 적용 불가.
**QA:** 2026-11-20 이전 3차 HEAD 9ece715의 RLS 합성 테스트는 PASS. 같은 HEAD 전체 CI는 조사 안내 문구 mismatch 2건으로 FAIL; 이어지는 9067de2 커밋에서 문구 수정. 고위험 npm 의존성 취약점은 별도 해결 전까지 릴리스 차단.

## 2026-11-20 4차: 사고별 개선조치·재점검 세션 시제품

구현 파일:
- components/hq/correctiveActionModel.ts: 조치계획 등록, 임시통제, 이행자료 제출, 재점검 요청, 보완 재제출, 기한경과 미종결 판단의 순수 상태모델
- components/hq/CorrectiveActionWorkbench.tsx: 사고사례 선택→유형·담당 역할·기한 입력→임시통제·이행·재점검·보완 인터랙티브 화면
- components/hq/CorrectiveActionWorkbench.css: 데스크톱 2열, 모바일 1열, 단계별 상태와 이력 표시
- components/hq/StructuralHQWorkbench.tsx/.css: 6번째 탭 '조치·재점검' 진입, 다른 탭 이동 시에도 세션 상태 유지, 6개 타일 3×2 정렬
- tests/hq-corrective-action.test.ts: 상태 전이, 자료번호 누락 차단, 임시통제, 보완, 기한경과 및 완료 미확정 검증

실제 서버 데이터/권한/원본 보존/담당자 알림/현장검증/조치 완료/작업재개 승인 기능이 아님. 임시통제 기록 및 이행자료 번호 입력은 현장 이행 사실을 입증하지 않음. 새로고침 시 데이터 소실. 테스트는 합성 사건만 사용.

### 보안 릴리스 차단 근거 및 업데이트 원칙
2026-11-20 이전 release verification에서 Vitest 총 1952건 PASS, npm audit --omit=dev --audit-level=high FAILED(의존성 6건: high 1, moderate 5). 취약 패키지와 현재 lock version:
- effect 3.21.2 (간접 의존성 solapi ^3.19.14): GHSA-7589-6fvf-x4pw, 수정 버전 3.22.1 이상
- fast-uri 3.1.8 (ajv ^3.0.1): 관련 GHSA 다수, 수정 3.1.9 이상
- glob 10.5.0 (rimraf ^10.3.7): GHSA-3g3m-2fjr-6pw4, 14.0.2 이상 필요(주버전 업그레이드 위험)
- minimatch 9.0.9 (glob ^9.0.4): GHSA-g3hv-75wg-m249, 11.0.1 이상 필요(주버전 업그레이드 위험)
상기 설명은 npm 보안 공지에 기반한 업데이트 방향이며, 실제 package-lock.json은 아직 수정되지 않음.

개선 절차: 깨끗한 별도 테스트 환경에서 npm install --package-lock-only 후 lockfile 변경과 라이선스/OSS 심사 확인→npm ci→npm audit --omit=dev --audit-level=high→npm run verify:ci→PC/모바일 Chromium 7흐름→사용자 승인 뒤 배포. rimraf/glob/minimatch 상위 라이브러리의 주버전 호환성 확인 없이 overrides를 강제하지 않음. GitHub 도구만으로 신뢰할 수 있는 npm integrity를 재생성할 수 없으므로 잠금파일을 추측으로 고쳐서 배포하지 않음.

최종 상태는 최신 CI 실행을 별도로 확인해야 하며, main 병합·운영 적용은 계속 보류.


## 2026-11-20 5차: 본사 통합관제 세션 현황판
신규 파일:
- components/hq/hqOverviewModel.ts: 현재 세션 기록만으로 방문 예정, 사고사례, 조사 검토요청, 미종결 개선조치, 기한초과, 재점검 요청을 집계하며 공사구간과 공정군을 각각 조회
- components/hq/HQOverviewDashboard.tsx/.css: 진입 시 첫 화면을 본사 관제 화면으로 구성, KPI 5종, 기초·지하·지상·옥탑 높이별 위험사례 지도, 지하 RC·형틀·지상 골조·가설/장비 공정군별 사례 분포, 업무 화면 바로가기
- tests/hq-overview-model.test.ts: 공사구간 및 공정군의 독립 집계, 사고사례 연계되지 않은 개선조치 제외, 기한 경과, 중복 사고번호 거부, 0건 표시에 대한 조건 확인

기존 변경:
- components/hq/CorrectiveActionWorkbench.tsx: parent-controlled 개선조치 상태 허용. 같은 브라우저 세션 내 조치·재점검 입력을 본사 대시보드로 즉시 환류
- components/hq/StructuralHQWorkbench.tsx/.css: 본사 관제를 기본 진입으로 변경, 7개 업무 타일, 클릭 시 공사구간·공정군 필터 연계
- tests/hq-structural-ui.test.tsx: 본사 대시보드가 포함된 7개 모듈 SSR 회귀 확인

품질·데이터 경계:
- 등록 데이터 0건은 실제 현장 사고/위험이 0이라는 뜻이 아님. 대시보드는 실시간 본사 통계나 안전도 순위가 아니라 브라우저 세션 시연 전용
- 공정별 건수는 근로자 수, 근로시간, 작업량 등의 노출 분모 없는 단순 사고사례 건수
- 행선지와 사고사례는 임의 시연용. 담당자 승인, 실제 증빙 무결성, 회사별 DB·현장 RLS, 개인정보 취급, AI 분석은 아직 연결되지 않음
- 5차 단계에서 신규 API/실 DB 쓰기, 권한 변경, PR 병합, Production 배포 없음
- 배포 차단 중인 npm audit 6건은 lockfile, 상위 라이브러리 영향 확인 없이 강제로 숨기거나 수정하지 않음
- 최신 PR 검증 결과는 각 HEAD에 대해 별도로 확인하고, 확정 결과만 보고
