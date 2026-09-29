# 관리자 API 통합

Vercel에 배포되는 진입점은 `api/admin.ts`, `api/gateway.ts`,
`api/saas/access.ts`, `api/training/submit-signature.ts`의 4개다.
관리자 기능 구현은 `lib/server/admin/`에 있고 별도 함수로 배포되지 않는다.

기존 `/api/admin/auth`, `/api/admin/record-master` 등 주소는
`vercel.json`의 `/api/admin/:endpoint` rewrite로 유지된다.
통합 진입점의 직접 호출은 `/api/admin?endpoint=record-master` 형식이다.
`endpoint`는 허용 목록에 있는 단일 문자열만 받는다. 기존 본문과 쿼리의
`action`은 업무 기능 선택에 사용하므로 라우팅 값으로 재사용하지 않는다.
알 수 없거나 중복된 endpoint는 404로 거절하며 관리자 응답은 캐시하지 않는다.

각 기능의 HTTP 메서드 검사, 관리자 인증, 요청·응답 형식은 기존 핸들러에서
유지된다. 인증 상태·로그인·로그아웃은 auth 핸들러의 기존 계약을 따른다.
이 통합은 기업별 데이터 격리를 완료하지 않으며 shared-saas 배포 차단은 유지된다.

폐기 예정인 `/api/admin/update-training-targets`도 training 핸들러로 전달하며
본문 action이 없으면 `update-targets`를 기본값으로 사용한다. 명시적 본문 action은
현재 training 계약대로 유지한다. 이 주소는 추가 함수 파일을 만들지 않는다.

관리자 실행시간은 10초, OCR/AI gateway는 기존 240초 설정을 유지한다.
근로자 서명 제출과 SaaS 인증 진입점도 분리한다. 관리자 모듈의 DB 클라이언트는
인증 통과 후 초기화하여 연결 설정 오류가 auth 모듈의 로딩을 막지 않게 한다.

`tests/adminConsolidation.test.ts`는 비인증 요청의 DB 접근 차단,
쿠키 인증·로그아웃, 잘못된 라우팅 값, 구 교육 주소, 메서드 검사,
shared-saas 차단 및 배포 진입점 개수·실행시간을 검증한다.
기존 관리자 기능 테스트도 이동한 모듈을 대상으로 계속 실행한다.
