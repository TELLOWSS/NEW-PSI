# 기존 교육·문자 발송 기록 접근 보완

2026-09-30. 지정된 Supabase 프로젝트에서 `training_access_attempts`의 RLS 미설정, 발송 집계·재시도 뷰의 소유자 권한 실행과 공개 SELECT 권한을 확인했다. 현재 클라이언트는 이 테이블을 직접 사용하지 않으며 발송 기록·집계는 인증된 관리자 서버 API로 조회한다.

`20260930001000_legacy_log_server_boundary.sql`은 교육 접근 기록, 발송 기록, 관련 집계·재시도 뷰에서 PUBLIC/anon/authenticated 권한을 회수한다. 테이블의 RLS를 활성화·강제하고 뷰에 `security_invoker=true`를 설정한다. 기존 service_role 권한과 정책, 자료, 뷰 정의는 유지하며 신규 권한을 부여하지 않는다. 없는 선택적 뷰는 생성하지 않는다.

회귀 검증은 실제 PostgreSQL에서 공개·일반 계정의 조회/등록/수정/삭제 거부, 기존 기록 유지, 서비스 역할의 집계 조회·기록 쓰기, 재적용과 선택적 뷰 누락을 확인했다. 호스팅 DB의 읽기 전용 권한·구문 검증도 통과했다. 이 보완은 기존 기록의 기업별 분리를 제공하지 않는다. 전체 공용 SaaS 출시 차단은 유지한다.

Supabase Security Advisor에서 Errors 0건을 확인했다. Warnings는 9건 남아 있다: 기존 함수 6개의 search_path, public 스키마의 vector 확장, workers의 허용적 RLS 정책, training_audio의 공개 목록 정책이다. 기존 기능 의존성과 실제 권한을 확인한 후 각각 보완해야 하며, 오류 0건을 전체 SaaS 보안 검증 완료로 해석하면 안 된다.

지정된 Supabase 프로젝트에 적용했다. 실행 전 대상 관계 종류와 service_role 조회·쓰기 권한을 확인했다. 실행 후 `supabase/tests/legacy_log_server_boundary.sql`로 공개·일반 계정의 테이블/열 권한 차단, RLS 강제, 뷰 옵션 및 서버 조회 구문의 유효성을 검증한다. 운영 서비스 키는 출력하지 않는다. 실제 관리자 계정의 기능 검증과 남은 보안 Advisor 항목은 별도 확인 대상이다.
