# PSI SAFETY INSPECTOR — 구현 진행현황

기준일 2026-10-19 / 제품 기획 v1.2 / 상태: M1 첫 구현 검증 완료 / PR #29 / Vercel preview READY

## 실제 작업 대상

- GitHub: `TELLOWSS/NEW-PSI`, 기준 main `55d24b45be5675629be01c19140642e41047c0ca`
- 브랜치: `codex/safety-inspector-foundation-20261019`
- Vercel: `new-psi`, 프로젝트 `prj_vtGmKF78CkEuu2PxsR1eIA4ieM17`
- Supabase: PSI-Database / `dpnmslogvwuzmighsgnt`
- 전용 설치 관리자 방식. 기업·소속 계정이 현재 0개임을 읽기 전용으로 확인했으며 임의 계정을 생성하지 않았다.

## 구현한 범위

- 기존 메뉴에 '사진점검 · 개선관리' 추가. 화이트/네이비/청록의 반응형 작업실.
- 점검 생성·저장·최근 요약·페이지 조회. 자동 polling/진입 시 목록 호출 없음.
- 사진 원본 비공개 저장, 서버 SHA-256, 점검·사진 ID 대조, 재시도 시 원본 덮어쓰기 금지.
- ChatGPT 사용자 수동 프롬프트/JSON 가져오기, 엄격한 스키마·모드·ID·해시 검증.
- 관찰·가설·확인질문·권고 분리, 법령 후보 키워드는 검색 힌트로만 표시.
- 분석 결과는 먼저 검토 대기로 저장한다. 기존 검토 승인을 새 분석에 자동 승계하지 않는다.
- 기기 내 Tesseract.js OCR PoC, 네 언어의 같은 출처 worker/WASM/언어팩. 원 인식·정정·검수 분리, 중단·시간 초과 수동 대안.
- 조치담당/기한/개선사진/완료 검토 요청/현장 재점검 확인. 일반 저장으로 완료 상태 위조 차단.
- 검토용 보고서 스냅샷, 안정적 직렬화 해시, 감사자료 JSON, 인쇄/PDF, 과거 스냅샷 조회.
- 법령·제재·사례는 공식 검증 대기. 실제 조문·시행일·처벌액·공식 사례를 임의 생성하지 않음.
- 신규 AI 자동 요청·유료 fallback·SIWC 모두 비활성화.

## 실제 DB 반영 및 검증

`20261019120720_inspector_dedicated_foundation.sql`을 원격 migration history에 맞춰 보관했다. 최초 파일은 CLI `migration new`로 생성했으며 원격 적용 시 발급된 version으로 파일명을 맞췄다.

- 새 테이블 4개: `psi_inspector_inspections/evidence/events/reports`
- 요약 view: `psi_inspector_summary` (`security_invoker=true`, 브라우저 조회 권한 없음)
- 테이블 4개 모두 RLS 및 FORCE RLS, anon/authenticated SELECT 권한 없음.
- 비공개 버킷 `psi-inspector-evidence`, 최대 3MB. 기존 Storage broad policy가 새 버킷을 열지 못하도록 restrictive 정책.
- 실제 원격 DB에서 service_role 생성→수정→감사 2개 revision을 확인하고 트랜잭션 롤백. 시험 레코드 0건 확인.
- 기존 업무 데이터에 backfill/UPDATE/DELETE 없음.
- 보안 advisors 신규 WARN/ERROR 없음. 'RLS enabled no policy' INFO 4건은 서버 전용 deny-by-default 설계와 권한 revoke에 해당한다. [검사 의미](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- 기존 vector/public 및 기존 tenant RPC 경고는 이번 신규 모듈의 회귀와 구분하며 변경하지 않았다.

## 검증 증거

- M1 계약·API·실제 PostgreSQL(PGlite): 최초 33개 통과.
- 전체 테스트: 112개 파일 / 985개 통과(계약·서버·SQL·스냅샷·OCR 중단 시험 포함).
- 추가 snapshot·OCR 시험: 6개 통과.
- 실제 Chromium 클라이언트 업무흐름, 네트워크는 fixture/mock: 사진→OCR→JSON→사실검토→조치→재점검→보고서 통과.
- 실제 브라우저 WASM OCR: 합성 인쇄체 `SAFETY FIRST / CHECK GUARDRAIL` 문자열 인식 확인. 손글씨·실제 현장사진 품질 검증과 구분.
- 390/768/1440px에서 가로 overflow 없음. 실제 Android 실기기와는 구분한다.
- 검토용 PDF: 전역 print 규칙의 root 숨김으로 발생한 빈 출력 문제를 신규 모듈 범위에서 수정. 2쪽 PDF의 본문·미결/법령 대기 문구·해시를 추출하고 첫 페이지 렌더 확인.
- production dependency audit: 0 vulnerabilities (Ajv 8.20.0으로 업데이트 후).
- 실배포 서버의 관리자 로그인→Storage→화면은 Vercel preview 배포 후 별도 확인 대상이며 모의 UI 시험으로 통과 처리하지 않는다.

## 현재 미완료 및 후속

1. 법제처 공식 API 자격/환경, 조문·부칙·시행일 adapter, 적용요건 및 미래 법령.
2. 제재 매핑과 실제 감독·판례 수집, 검증 큐.
3. 개인 승인 계정·현장/협력사 권한·기업형 RLS·전자서명. 현 공유 관리자는 개인 서명이 아니다.
4. 질문별 답변, 개별 관찰 수정/반려, 정식 주석·전후 비교, 재발·재개, 조치 수락.
5. 일일/월간/임원 PDF·DOCX·CSV, 사진 포함 정식 보고서, 최종 발행 승인.
6. 승인 이벤트 PSI 지표 연계·별도 SMART TBM 데이터 계약.
7. 11개 언어, 다국어/필기 정답셋, 20건 이상 실제 현장 검수, 오프라인·대용량·실기기.
8. 기존 Gemini OCR 비용 청구·사용량 계측, 신규 OCR과 기존 지표 정합성 비교 후 전환 결정.
9. Vercel 환경변수 목록 조회는 플러그인 403. 비밀 조회나 우회 설정 없이 차단 상태를 기록했다.

운영 main 병합·도메인 전환은 아직 수행하지 않았다. 첨부 인계자료의 운영 승인·회귀 원칙에 따라 PR과 preview에서 검토 가능한 상태를 먼저 만든다.

## GitHub 및 배포 기록

- 구현 커밋: `e41ef672725141f7fc6a241e5b42ff9bf2995d4c`
- PR: https://github.com/TELLOWSS/NEW-PSI/pull/29 (draft)
- 검증 workflow: https://github.com/TELLOWSS/NEW-PSI/actions/runs/39250945186
- Vercel preview: `dpl_AXgj5aQ69h8EcW9KkHSN4sxHwRCB` (Git 자동 배포, READY)
- 검증 주소: https://new-9qttz9f6n-tellowss-projects.vercel.app
- 대상 commit은 위 구현 커밋, 환경은 preview(target=null), Node 22.x 빌드 성공. GitHub release-verification 성공 확인. 첫 화면과 같은 출처 OCR 라이선스 문서 HTTP 200 및 wasm 허용 CSP 확인.
- 수동 중복 배포 요청 `dpl_FxmPWQJRcdwUziRJXuRYAruzSF4i`는 큐에서 취소해 중복 빌드를 방지했다.
- 최종 로컬 순차 검증: verify:fast / types / 985 tests / dependency audit / production build 모두 exit 0.

이후 상태 문서와 원본 줄바꿈 보존 정리는 문서/형식 변경이며 실제 동작 변경과 구분한다.


## 2026-10-20 후속 보강 — 현장 확인과 장애 복구

- 사진별 AI 질문에 `현장 확인됨 / 확인 결과와 다름 / 아직 확인하지 못함` 및 근거를 기록한다. 답변은 원 질문 번호·문구에 연결되며 임의 승인 필드를 받지 않는다. 기존 답변 필드가 없는 점검도 읽을 수 있다.
- 질문 답변 수정 시 사실 검토를 해제하고, 새 분석을 가져오거나 설명·위치·공종·발생시점을 바꾸면 기존 답변·검토를 다시 받는다. 감사 이력의 이전 기록은 보존된다. 미확인 답변은 검토 수용·조치 확인 이후에도 보고서에 그대로 남는다.
- Storage 업로드 성공 후 DB 응답이 끊긴 경우 같은 사진ID로 비공개 원본을 찾아 서버 SHA-256을 다시 검사해 복구한다. DB 삽입 경합에서 이긴 요청의 원본을 실패한 요청이 삭제하지 않는다. 브라우저 재선택 시 File 객체 대신 점검ID·내용 해시로 재시도 키를 유지한다.
- DB 실패 시 미연결 비공개 원본이 남을 수 있다. 같은 업로드ID 재시도로 복구하며 자동 공개·자동 삭제하지 않는다. 장기 보관/고아 원본 정리는 M7 운영정책과 별도 구현 대상이다. 브라우저 종료 후 재시도ID 보존은 아직 없다.
- 목록은 `created_at + id` 복합 커서로 조회한다. 동일 촬영/생성 시각 경계에서 빠지는 기록과 편집으로 목록 순서가 변할 때의 커서 이동을 방지한다. 커서는 마지막 서버 페이지에서 보관하며 현재 화면의 마지막 행에서 재계산하지 않는다.
- 신규 DB migration, 기존 점검자료 변경, 운영 main 병합은 이번 보강에서 수행하지 않았다.

검증: 112개 파일 / 1,004개 테스트, verify:fast·타입 검사·의존성 감사(취약점 0)·production build 통과. Chromium 138에서 실제 WASM 영어 인쇄체 OCR과 390/768/1440px 업무 흐름, 질문 답변 저장 전 검토 차단, 미확인 답변 PDF 보존, 편집 후 다음 페이지 커서를 확인했다. API 네트워크는 fixture로 실행했으며 실제 관리자→배포 API→Storage 검증과 구분한다.

실제 preview GET `/api/admin/inspector`는 405·Allow POST·private no-store로 신규 서버 라우트 배포를 확인했다. 실제 관리자 로그인 시험은 자격정보 사용에 대한 자동 승인 검토 거부로 미실행/미확인이다. 인증 우회나 보호 설정 변경은 하지 않았다. 기존 관리자 자격정보를 사용하는 실배포 시험에는 명시적 승인이 필요하다.

공식 법령 API 자격·원문/시행일·제재 검증, 현장사진 20건 전문가 검수, 개인 승인·기업/현장 격리는 여전히 미완료다. 이번 결과를 최종제품 출시 완료로 취급하지 않는다.

## 2026-10-20 UI·UX·그래픽 보강 및 승인된 로그인 시험

[경험 설계·검증·로그인 장애 기록](EXPERIENCE_20261020.md)을 추가했다. 자체 SVG 현장 도해·선형 아이콘·검색/필터·다음 행동·단계별 상태·사진 확대·모바일 저장 동선·다크 테마와 보고서 요약을 구현했다. 점검 중에는 소개 영역을 축소한다. 하단 저장 동선은 저장이 필요할 때만 표시하며 기존 모바일 메뉴와 겹치지 않는다.

전체 회귀 114개 파일 / 1,016개 테스트 통과, 의존성 감사 취약점 0. 브라우저는 fixture API와 실제 WASM OCR로 검증하며 실배포 업무 검증으로 대체하지 않는다.

사용자 승인 후 실제 preview 관리자 로그인을 시험했으나 보안 저장소 설정 단계의 503에서 중단했다. Vercel 로그로 구성 오류를 확인했고 DB quota 함수의 rollback 시험은 성공했다. 검증용 실제 점검 생성은 0건이다. 환경변수 목록 조회는 403이며 인증된 CLI가 없어 설정 변경은 수행하지 않았다. 서버 URL alias 및 값 없는 누락 분류 로그를 보강했다. 실제 값·자격정보는 기록하지 않는다.
