# L18 · NEW-PSI Living UI 통합 품질·현장 인수·출시 전 차단 게이트

> 기준 2026-11-22 / 개발 PR #237. 본 문서의 '자동 통과'는 **출시 승인과 다릅니다.** 새 자동화는 생산 배포, 데이터 외부 전송, DB 정책 변경 또는 PR 병합 기능이 없습니다.

## 1. 당일 재확인한 동일 HEAD 증거

- 개발 HEAD `639b8612a9ae65ac610b11bf21bb2287b5475e94`에서 GitHub [릴리스 #44969831755](https://github.com/TELLOWSS/NEW-PSI/actions/runs/44969831755), [전사 Chromium #44969831759](https://github.com/TELLOWSS/NEW-PSI/actions/runs/44969831759), [Inspector 모바일 합성 브라우저 #44969831721](https://github.com/TELLOWSS/NEW-PSI/actions/runs/44969831721) **모두 SUCCESS**. 이는 새로운 L18 커밋까지 포함한 결과가 아니며, 다음 커밋 후 반드시 다시 판정.
- 릴리스 검증에서 L17 `source-only` 보안/OSS 점검 **19/19 PASS**. 실제 RLS 사용자 교차테넌트 인증 시험과 외부 HTTP 응답은 불포함.
- **실 Supabase 추가검토:** 연결된 `PSI-Database` (프로젝트 식별은 GitHub PR 기록 참고)에서 메타데이터 SELECT만 수행. 보안 Advisors 권고 20건(INFO: RLS on/no policy), 5건(WARN: `authenticated` 실행 가능 `SECURITY DEFINER`), 1건(WARN: `public.vector`). 대표 검사한 RLS 미정의 테이블에서는 `anon`·`authenticated` 직접 SELECT 권한 없음. 이 결과는 실제 이용자 교차테넌트 취약점 부재를 보증하지 않으며, 서비스/스키마/GRANT/기능 종속성 확인 전 자동 수정 금지. 상세: [PR 보안 메모](https://github.com/TELLOWSS/NEW-PSI/pull/237#issuecomment-7072027440).
- 사용자의 최종 main 병합/Production 배포 승인은 아직 없음. 운영 SHA는 기존 `main`의 `8aa4dea89f789d569a715386e1646d848ceb17c1`이었음 (추후 반드시 재조회).

## 2. 이번 L18 실제 구현

- `config/psi-living-ui-release-acceptance.json`: 검수 13개를 제품 기능/실기기/모국어·A4/접근성/안전조치/보고/서버 보안·RLS/상용 라이선스/독립 QA/제품 소유자 승인/배포 확인으로 분리. **출시 전 12개 + 배포 후 확인 1개**를 별도 단계로 관리해, 사후 확인을 선행 승인 요구로 만드는 순환 차단 오류를 방지. 전부 **pending**이며 실증 자료 없는 자동 완료 금지.
- `scripts/verify-psi-l18-release-gate.mjs`: GitHub API·현장 개인정보를 읽지 않는 로컬 검증기. 구성 파일 누락·중복·증빙 없는 verified 상태는 실패. 인증 승인의 증거는 독립 검토자·확인 일자·HTTPS 증거 링크를 요구. 실제 증거 링크를 읽고 검증하는 것은 아니므로 마지막 사람 승인/운영 검증을 대체하지 않음.
- `--source-only`: 소스 체크/CI 워크플로 필수 조건을 보존했는지 검사한 후 `source-only.json` 생성.
- `--browser-evidence`: 각 독립 테스트의 CI 합성 JSON 6종을 확인해 전제품 7흐름·교육/OCR/A4/보고·L15 8개 화면·L16 기기 사진 오프라인 복원/재연결 시 API 0·L17 소스 보안 검증을 취합하고 `browser-evidence.json` 생성. 320~1440px 테스트 성공을 실제 200% 확대, Android 실기기 통과로 승격하지 않음.
- `tests/psiL18ReleaseGate.test.ts`의 계약검증과 릴리스/전사 Chromium CI에 **독립 게이트** 추가. 안전·사용자 승인 단계가 **BLOCKED**라 해도 기술 QA는 실패로 오도하지 않으며, 반대로 가짜 기술 증거가 있으면 CI 실패.
- 결과의 `releaseDecision='BLOCKED'`, `releaseAuthorizedByThisJob=false`는 자동 승인 불가를 나타낸다. `mainMerged:null` / `productionReleased:null`은 CI 내부에서 운영 상태를 확인하지 않았다는 뜻이지, 운영 상태를 추측한 값이 아니다. 배포 후 검증은 독립 `postDeployPending`으로 유지하여 승인 전에 완료하라고 요구하지 않는다. 물리 기기/권한/원어민 확인이 불가능해도 자동 결과를 `RELEASED`로 만들지 않는다.

## 3. 차단 상태별 실제 추가 검수

| 우선순위 | 미검증 과제 | 확인 담당 | 통과 근거 |
|---|---|---|---|
| P0 | L06 근로자 Q1~Q5 직접 입력/동의·저장·관리자 원문 검수 | 제품·안전 | 독립 현장 사용자 관찰/로그·권한별 단계 |
| P0 | L08·L14 실 Android Chrome/삼성 인터넷 카메라·PWA·오프라인·저장/ZIP 복구 | 모바일 QA | 기기 모델·OS·브라우저·실제 사진 수동 검수, 개인정보 비노출 |
| P0 | L10 11개 안전언어 원어민 의미 및 A4 실제 종이 출력 | 제품·원어민 | 언어별 수정승인·폰트/A4/교육 내용 적합성 |
| P0 | L17 RLS 테넌트/현장/역할 별 인증, 공유 링크 해지·만료, 서비스 계정, 스토리지 | 보안 | 승인된 테스트 테넌트 2개 이상 계정별 거부/허용 및 변조 방어 |
| P0 | L18 최종 동일 SHA 통합 CI·사람의 리뷰·최종 사용자 승인 | QA·제품 소유자 | 세 워크플로 SUCCESS, 변경 설명/승인증거 |
| P1 | L15 실제 200% 확대, 키보드·스크린리더·다크모드·국문/다국어 줄바꿈 | 접근성 QA | Android/iOS/PC 실제 브라우저 기록 |
| P1 | L16 통신 음영/저속망·배터리/발열/저장공간 스트레스 | 모바일·플랫폼 | 기기·조건별 시나리오·기록 복구율/배터리 사용량 |
| P1 | L09 조치 지연/임시 감소대책/재점검·승인 혼동 여부, L11 지표, L12 PDF·수신 구분 | 안전·QA | 실제 업무 프로세스 사용자 검수 |
| P1 | L17 HTTP 헤더 배포 실측, CSP 도메인·OSS/유료 호스팅 라이선스 승인 | 보안·사업 | 승인된 환경 및 약관·문서 기록 |
| 사후 | L18 운영 병합 후 Production READY/도메인 alias/SHA/오류 검증 | 운영 QA | 사용자 승인 후에만 수행; **현재 pending 정상** |

## 4. 현재 출시 결론과 다음 단계

- **자동 검증:** 커밋별 최신 릴리스·전사·모바일 자동 회귀 SUCCESS가 기술 게이트. 개발 HEAD에 변경이 생기면 이전 성공으로 대체하지 않음.
- **독립 품질:** 합성 데이터만 사용하고 부서·현장 권한 실증은 별개.
- **현장 검증:** 미완료 13개는 pending, 자동으로 승인되거나 결과가 생성될 수 없음.
- **안전:** 현장 위험 제거, 작업중지·작업재개, 조치 완료 여부는 사람이 실제 확인.
- **보안:** 실제 PSI-Database 메타데이터 확인을 실사용 계정·교차테넌트/스토리지 침투 방어가 완료된 것으로 보지 않음.
- **배포:** Draft PR #237, `main` 변경/Production 배포 **사용자 승인 전 금지**.

**다음 한 작업:** L18 최신 HEAD 자동 CI 및 합성 결과 확인·오류 보수 → 실현장 사용자가 가장 큰 차단 조건인 L06 Q1~Q5 직접 제출 흐름 설계/개발(현행 수기·OCR 원본 보존)과 별개로 Android·원어민·RLS/계정·호스팅 실검수 증빙 수집. 부분 구현을 완료로 간주하지 않고 제품 소유자가 최종 인수/배포 여부 결정.
