# L17 · NEW-PSI 권한·원본 무결성·라이선스/개인정보 보안 감사 (source-only)

> 2026-11-22, Draft PR #237. 이번 감사는 **코드 정책·경계의 정적 검사 + 기존 회귀 보호**이며 모의 침투시험, 라이브 DB RLS 테스트, 법률 검토, 상용 출시 승인이 아닙니다.

## 독립 확인 대상 및 근거
| 분류 | 저장소 현재 근거 | L17 조치·판정 |
|---|---|---|
| 모바일 기기 로컬 점검 | `/field-local/`에서 로그인 없는 IndexedDB 직접 저장, 동일 브라우저 프로필의 다른 사용자가 기록 열람 가능하다고 표시 | `/field-local`, `/field-local/`, `/field-local/index.html`의 `X-Robots-Tag: noindex, nofollow, noarchive` 및 `Referrer-Policy: no-referrer` 설정 추가. **인증/암호화 추가 아님** |
| 분리형 설치형 PWA | `public/field-local-l14.webmanifest`의 `id/scope/start_url=/field-local/`; 수동 오프라인 설치와 제한된 SW 정적 캐시 | 매니페스트 범위, 수동 SW 준비, API/개인 기록 캐싱 회귀를 정적 QA로 감시 |
| 클라우드 공유 회신 | `api/inspection-share.ts`의 토큰 해시·활성/만료 RPC·레이트 제한·요청 검증·사진 해시·응답 `no-store` | 기존 보안 경계 유지 여부 소스 확인. 실제 권한 우회/차단·동시성/원본 변조는 합성·실 서버 독립 검증 별도 |
| 관리자 인증 | `lib/server/admin/auth.ts`의 인증 상태 검사, 로그인 제한과 보안 쿠키 생성·실패 시 차단 | 소스 회귀 감시만 추가; 실시간 인증·Supabase RLS 및 현장별/테넌트별 격리 **미검증** |
| API/전역 헤더 | `vercel.json`의 API `no-store`, 전역 CSP·Permissions Policy | 기존 설정 보존. **CSP `connect-src 'self' https: wss:`는 허용 범위가 넓음**. 사용 도메인 실측·호환성 평가 없이 임의 축소 금지. `unsafe-inline`도 잔여 평가 |
| 제3자 코드·모델·콘텐츠 | `docs/psi-ai-company/OSS_SOURCE_REVIEW_20261026.md`, `config/psi-oss-candidate-manifest.json`의 7개 후보 중 6개 런타임 미도입·Matt Pocock 도메인 스킬 개발 전용 | 7개 소스 명부, 도입 단계·`productionDependency:false`, 패키지 런타임 미의존 게이트 추가. 라이선스 최신/하위 아티팩트 재검토 전 상업 도입 미승인 |
| 호스팅 | `vercel.json` 및 프로젝트 등록부 `new-psi` | Vercel Hobby 상업 사용 적합성/요금제 승인 보류. 성능·기능 성공이 라이선스 승인은 아님 |

## 이번 변경
- 운영용 HTML 직접 점검 경로 3개에 최소 노출 헤더를 추가. 원본·기기 DB·외부 API·인증·데이터 전송·유료 종속성 변경하지 않음.
- `scripts/verify-psi-l17-security.mjs`: 서버·네트워크 없이 실행하는 소스 점검. 헤더, API no-store, 공유 토큰 해시/제한, 설치 PWA 범위, 자동 API 호출 부재, OSS 런타임 후보 미승인을 검사하고 합성 JSON 결과만 보존. 정책상 미검증/광범위 CSP 문제는 **REVIEW**로 명시하며 전체 보안 승인을 주장하지 않음.
- `tests/psiL17SecurityGuard.test.ts` 및 `.github/workflows/verify.yml`: 정적 보안 게이트를 기존 `verify:ci` 뒤 별도 실행; 실패 시 릴리스 검증 FAIL. 기존 감사·검증을 삭제/완화하지 않음.

## 필요한 독립 후속 게이트
- [ ] 최신 L17 HEAD의 릴리스·전사 Chromium·사진점검 모바일 QA 성공 및 합성 보안 검사 산출물 확인
- [ ] 실제 Vercel Preview/Production HTTP 응답의 `Referrer-Policy`·`X-Robots-Tag`·CSP·API `Cache-Control` 검증 (소스 설정과 실 HTTP 응답은 다를 수 있음)
- [ ] Supabase RLS 역할별/현장별/테넌트별 분리, share token 도용·해지·재사용·경쟁 상태, 부적절한 공유와 백업 ZIP 유출 시나리오를 승인된 합성 환경에서 점검
- [ ] 장치 공유/분실·브라우저 삭제 시 IndexedDB 기록 노출·복원·보존기간과 데이터 주체 고지/삭제 정책 수립
- [ ] `connect-src`에 필요한 실제 도메인 및 사유를 수집하고 allowlist 축소를 별도 배포 후보에서 회귀 테스트
- [ ] `unsafe-inline` 제거 가능성·CSP nonce/hash와 외부 폰트/스크립트 로딩의 사업용/개인정보 영향
- [ ] OSS 후보 사용 시점 라이선스/SPDX·NOTICE·모델가중치·그림·음원·프리셋 권리 재조회 및 유료 Vercel 플랜 확인
- [ ] L06 근로자 직접 입력, L08 Android 기록 복구, L10 원어민·A4, L15 실제 200% 확대, L16 저속망/배터리 실측 등 선행 미완료 게이트 유지

**출시 판정:** 개발 브랜치 구현이 완료되어도 L17은 **source-only implemented / 운영 보안 승인 미완료**. 사용자 최종 승인 전 PR Draft, `main`/Production 변경 금지.

**다음:** L17 소스·CI 검증/실 HTTP 헤더 확인 및 실제 API/RLS 경계 점검 → L18 통합 품질·실기기·승인·배포 전 최종 점검.
