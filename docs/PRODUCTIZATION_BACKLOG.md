# NEW-PSI 상품화 단일 백로그

최종 갱신: 2026-06-22

이 문서는 상품화 미진행 사항의 단일 기준이다. 상세 자동 판정은 `artifacts/audit/productization-status.json`과 `productization-status.md`에 생성한다.

## 외부 권한 대기

### [ ] Supabase 관리자 기준 변경 이력 테이블 적용

- 준비 파일: `supabase_survey_risk_baseline_history_migration.sql`
- 현재 상태: 코드·로컬 대체 이력·API 호환 완료, 원격 DB 실행만 미적용
- 차단 조건: Supabase SQL 실행 권한 또는 인증된 MCP/CLI 연결 필요

적용 순서:

1. Supabase SQL Editor에서 마이그레이션 파일 전체 실행
2. `survey_risk_baseline_history` 테이블 생성 확인
3. RLS 활성화 확인
4. `anon`, `authenticated` 권한 철회 및 `service_role`의 `select`, `insert` 권한 확인
5. 관리자 화면에서 기준을 1건 변경
6. `/api/admin/survey-risk-baselines`의 `list-history` 응답이 `historyAvailable: true`인지 확인
7. 변경 전후 등급·근거·작성자·규칙 버전이 서버 재접속 후에도 표시되는지 확인
8. `docs/CODEX_STATE.md`에서 본 항목을 완료 처리

완료 판정 SQL:

```sql
select
  relrowsecurity as rls_enabled
from pg_class
where oid = 'public.survey_risk_baseline_history'::regclass;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'survey_risk_baseline_history'
order by grantee, privilege_type;

select month_key, trade, action, previous_level, next_level,
       source, rule_version, updated_by, changed_at
from public.survey_risk_baseline_history
order by changed_at desc
limit 20;
```

## 출시 전 수정

### [~] P1 `case_id` 기반 보호 폐루프

위험 발견 → 조치 → 리포트 → 교육 → 본인확인·서명 → 재평가가 같은 사건 ID를 공유해야 한다.

실행 순서:

1. 기존 기록을 깨뜨리지 않는 공통 사건 식별자와 상태 정의
2. 조치·리포트·교육·서명·재평가 화면의 읽기 전용 연결 표시
3. 단계별 완료 조건과 담당자·기한·증거 파일 연결
4. 사건 타임라인, 미완료 경고, 기한 초과 알림
5. API·DB 저장과 재접속·권한 격리 회귀검사

현재 상태:

- 공통 `case_id`, 6단계 상태 전이, 단계 건너뛰기 방지 완료
- 예측 위험·보호조치·리포트 PDF·교육 세션·근로자 직접 확인·후속 재평가 연결 완료
- 관리자 대리서명을 근로자 이해 완료로 처리하지 않도록 분리
- 로컬 저장·관리자 API·Supabase 호환 마이그레이션 준비 완료
- 단위·전체·브라우저 검증 완료
- 남은 조건: 원격 Supabase 마이그레이션 적용과 실제 서로 다른 기기의 근로자 서명→관리자 재접속 검증

### [ ] P1 관리자 RBAC·현장/테넌트 격리

`tenant_id`, `site_id`, 인증 사용자 역할을 기준으로 API와 Supabase RLS를 제한한다.

### [~] P1 지표 규칙 버전·단일 계산 기준

점수 일관성 게이트와 일부 규칙 버전은 완료됐다. 화면 전체의 지표 카탈로그와 단일 계산 모듈은 남아 있다.

### [ ] P1 대용량 서버 스트리밍 복원

업로드 세션, 청크 체크포인트, 중단 재개, 원자적 확정과 롤백이 필요하다.

## 품질 개선

### [x] 프로덕션 보안 헤더

CSP, 클릭재킹 방지, MIME 스니핑 방지, Referrer·Permissions·Cross-Origin 정책을 Vercel 공통 응답에 적용했다. 프로덕션 실제 응답 7/7과 CSP 적용 후 핵심 브라우저 흐름 8/8을 확인했다.

### [ ] 현장×월×공종×세부작업 기준 모델

기존 월×공종 데이터와 호환되는 `site_id`, `task_key` 확장 설계가 필요하다.

### [~] 관측성·백업 복구 훈련

Vercel 런타임 로그 확인은 가능하다. 요청 ID, 구조화 오류, 알림, RPO/RTO 복구훈련은 남아 있다.

### [x] 모바일 QA 자동화

320·360·375·390px의 대시보드·모바일 탐색·OCR·선행 위험신호 증거 16종을 2026-06-19 기준으로 재촬영했다. 향후에는 릴리스별 시각 회귀 비교를 추가한다.

## 완료

- [x] 관리자 기준 3문항 빠른 판정
- [x] 이번 달 원클릭 시작과 미등록 공종 우선순위
- [x] 공종별 현장 확인 힌트와 저장 전 근로자 체감 비교
- [x] 인식 차이 방향별 관리자 조치 안내
- [x] 주요 화면 개발자 언어 제거와 자동 언어 감사
- [x] 근로자 리포트 14개 언어 글꼴·모국어 전용 전달본과 자동 언어 감사
- [x] 안전역량인증서 발행번호·평가기간·누적 기록·발행 범위 보강
- [x] 관리자 분석 대상자 목록의 근로자별 통합과 월·기록·점수 변화 표시
- [x] 전월 기준 복사와 월별 진행률
- [x] 판단 근거·작성자·규칙 버전·변경 전후 이력
- [x] 근로자 체감과 관리자 기준의 독립 계산
- [x] GitHub `main`·Vercel 프로덕션 자동 연동
- [x] 전체 운영·개발 의존성 취약점 0건
- [x] 기본 메뉴 접근성과 모바일 390px 검증

## 다음 실행 우선순위

1. 보호 폐루프 원격 Supabase 마이그레이션·다기기 재접속 검증
2. 화면 전체 지표 계산 소유권 목록과 단일 계산 모듈
3. 관리자 RBAC·현장/테넌트 격리 및 Supabase RLS 회귀검사
4. 대용량 서버 스트리밍 복원·중단 재개·원자적 롤백
5. 현장 사용자 관찰로 기준 위험도 등록 시간·완료율·오해율 측정
