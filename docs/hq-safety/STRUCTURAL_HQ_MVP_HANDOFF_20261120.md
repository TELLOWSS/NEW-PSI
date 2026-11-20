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
