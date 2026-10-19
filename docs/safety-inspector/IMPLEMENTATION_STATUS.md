# PSI SAFETY INSPECTOR — 구현 진행현황

기준일 2026-10-19 / 제품 기획 v1.2 / 상태: M1 첫 구현 검증 완료 / PR·preview 준비

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
