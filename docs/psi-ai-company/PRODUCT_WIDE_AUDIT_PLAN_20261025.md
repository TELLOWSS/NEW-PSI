# NEW-PSI 전 제품 1차 실사 · 실행 계획 (2026-10-25)

## 검토 범위 및 검증 유형
기준 main: 5ee40d56. GitHub 트리 약 1,119개 항목, 기존 Vitest 1,359개 통과 및 사진점검 Chromium 32시나리오 통과. 파일별 실행 결과를 전부 검사했다는 의미는 아니다. 모든 확인은 합성·읽기 전용을 원칙으로 한다.

| 제품 영역 | 책임 본부 | 현재 직접 확인된 내용 | 우선순위 |
|---|---|---|---|
| 전체 사용자 동선 | product-ux, design | 메뉴 항목은 버전4의 보이는 페이지 구성에 따라 달라짐; 과거 브라우저 검사는 버전3 상태로 테스트해 메뉴를 못 찾음 | P0: 최신 경로 기반 UI QA |
| 대시보드·6대 지표 | safety-ai | 간편/상세 분리, 위험 인지 지표 규칙 2026-09-09 v2; 구형 검사 v1 숫자·버튼 가정 | P0: 실제 출력과 계산 규칙 검증 |
| 사진점검·공유 | product-ux, security | 기존 32개 합성 브라우저 사례 통과, 운영 배포 Ready | P1: 실기기·실사진 별도 검증 |
| 위험성평가·관리자 위험 기준 | safety-ai | 구형 사이드바 숨김 상태에서 기존 테스트 접근 실패 | P0: 위험등급 등록 동선·API fixture 검증 |
| 다국어 개인 보고서 | product-ux | 기존 리포트 QA 메뉴가 숨김 처리되어 접근 실패 | P0: UX 진입·내보내기·다국어 출력 교차검증 |
| 조치·교육 환류 | safety-ai | 구형 대시보드 추천 카드 이동 시 동적 렌더 불안정 | P0: 현 화면 경유/조치·교육 연결 검증 |
| 배포·운영 | platform, qa | GitHub 전체 릴리즈 검증 존재; 기존 전제품 브라우저 통합 검증 부재 | P0: 조직 소유권/전제품 브라우저 CI |
| 개인정보·권한 | security | 아래 Supabase advisors를 읽기 전용으로 확인; 대상 DB의 운영 링크 불명확 | P0: 운영 DB 식별/권한 검토 후 개선 |

## 읽기 전용 Supabase 보안 감리
2026-10-25 Supabase security advisors 조회. 아래는 자동 검출 경고이며, 실제 악용이나 위법이 확정된 결과는 아니다.

- PSI-Database `dpnmslogvwuzmighsgnt`: RLS 활성화·정책 없음 INFO 20개(서버 전용일 수 있음), 공개 스키마 vector 확장 WARN 1개, authenticated 대상 SECURITY DEFINER 함수 실행 WARN 5개.
- 별도 연결 프로젝트 `reyevthxmksdmcomtrhs`: SECURITY DEFINER 뷰 ERROR 3개(`v_sf_*`), mutable search_path WARN 5개.
- 제품 연결 확인과 함수 정의/호출 권한·RLS 사용 목적을 파악하기 전엔 schema/RLS/GRANT를 바꾸지 않는다.
- 공식 검토 문서: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- 공식 검토 문서: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
- 공식 검토 문서: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

## 품질 게이트의 한계
- 부서 책임 배분은 정적 경로 규칙에 의한 메타데이터 매핑이지 AI 직원 6명이 자율로 실행했다는 뜻이 아니다.
- 독립 QA 스크립트 실패는 배포 차단 사유다. 현재 GitHub Branch Protection을 읽을 권한이 없어 Required Checks 강제 여부는 확인하지 못했다.
- 고객·근로자 실데이터를 브라우저 fixture에 넣지 않는다. 운영 개인정보·실제 Android·외부 송신·유료 AI 호출은 해당 별도 승인과 실측 검증이 필요하다.
- 단위테스트와 합성 브라우저에서 통과한 영역만 해당 범위에서 통과로 표기한다.

## 우선 실행 결정
1. 6대 지표 실제 화면/새 계산 규칙 회귀 검사.
2. 현재 메뉴 구성으로 위험성평가·다국어 보고·조치 환류 브라우저 검증 복구.
3. 6개 부서 책임 JSON/체크·브라우저 CI를 PR 게이트로 추가.
4. 검증 실패 시 main 병합을 중단하고 증빙을 보존한다.
5. 운영 DB 식별, Required Checks 강제 설정 확인, 현장 사용자/Android·다국어 UX 실측은 별도 독립 검증 과제로 추적한다.
