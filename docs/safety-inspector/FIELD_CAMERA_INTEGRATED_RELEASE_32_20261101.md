# NEW-PSI F01–F10 건설현장 전문 카메라 — 32차 단일 통합 릴리스 후보
**작성일: 2026-11-01 / 운영 배포 및 `main` 병합 보류 / 소스 근거: TELLOWSS/NEW-PSI**

## 1. 이번 차수의 책임 범위
31차까지 GitHub에서 개발·자동검증한 F06 공유 직전 파일 무결성 및 F10 조치기한·임시 안전조치·수동 재점검 이력·인계·보고서 개선사항을 **하나의 `main` 대상 통합 PR**에서 검토할 수 있도록 구성한다. 본 32차는 기존 현장업무의 의미를 바꾸는 새 기능이 아니라 **소스 통합·출시 후보 재현성·품질 관문의 완결**을 위한 작업이다.

**중요:** 단일 통합 PR의 생성은 GitHub `main` 반영 또는 Vercel Production 배포가 아니다. Git 연동의 Preview 빌드 여부는 플랫폼 설정/한도와 별개로 확인해야 한다. 2026-11-01에는 운영 배포 및 병합을 수행하지 않는다.

## 2. 25~31차 원본 개발 이력
| 차수 | PR | 기능 및 책임 | 예상 파일/검증 |
|---|---|---|---|
| 25 | #201 | F06 사진 공유·ZIP 직전 파일 SHA-256 재확인, 모바일 복구 | `fieldPhotoDelivery.ts` 및 브라우저 조작 시험 |
| 26 | #202 | F10 재점검의 상태 불일치·기한 초과·오늘·3일 이내·일정 미정 관리 | `localRecheckQueue.mjs` |
| 27 | #203 | F10 개인정보 최소화 CSV·A4 보고서 | `localRecheckReport.mjs` |
| 28 | #204 | F10 지연 조치 인계 문구·A4 인계표, 사용자 직접 공유 | `localRecheckHandoff.mjs` |
| 29 | #205 | 기한 변경과 임시통제 변경/해제 이유 필수, 기존 v17 이력 | `localFollowupChangeTrace.mjs` |
| 30 | #206 | 기한·임시통제·재점검 타임라인과 선택형 경과 보고서 | `localRecheckProgress.mjs` |
| 31 | #207 | F01~F10 출시 사전 관문, 동시 수정 시 CSV·A4 차단 QA | `check-field-camera-release-preflight-31.mjs` |
| 32 | 통합 PR | 25~31차 전체 코드를 `main`과 비교, 소스 지문/통합 CI 결과/인계 | `check-field-camera-integrated-candidate-32.mjs` |

**현재 소스 준비 상태 (32차 착수 시 read-only 조회):**
- `main` 커밋 `00deacaf92499f2dc644b45945cbdd15ef70b193`.
- 31차 #207 HEAD `a48209ffacfcc75b70fe8f15bff526df960b2819`: 기존 `main`보다 59커밋 앞/0커밋 뒤. 31차 릴리스, 제품 전체, Inspector 모바일 CI 3종 성공.
- Vercel Production 공식 주소 `new-psi-eta.vercel.app`: `READY` 배포 `dpl_Ah1SdUMkGiaVpcVciXty4z8C786G`, Git SHA `090f5ddb07e684de7deb7133c6504759f84aa107`. 조회 시 GitHub `main`은 이 Production보다 41개 커밋 앞.
- 위 버전과 상태는 11월 1일 조회 스냅샷이며 **내일의 GitHub/운영 상태를 예측하지 않는다**.

## 3. 32차 CI 소스 증빙
`node scripts/check-field-camera-integrated-candidate-32.mjs`는 **읽기 전용으로 추적된 GitHub 저장소의 코드/테스트/CI/Vercel 설정**만 읽는다.
- 차수별 구현/시험 파일의 존재, 25~32차 포함, 필수 3개 GitHub Actions와 `npm run verify:ci`, `vercel.json`의 verified-build 경로, 사진·재점검 QA의 등록을 검사한다.
- 통합 검증 소스 파일의 SHA-256을 정렬해 하나의 **sourceFingerprintSha256**으로 집계한다. **소스 지문은 실행 결과/운영 커밋/사진의 법적 진본성 증명으로 사용하지 않는다.**
- `artifacts/audit/field-camera/32-integration-source-manifest.json`에 소스 파일 경로·SHA-256·필수 CI명·미완료 운영 확인 조건을 기록한다. 실제 점검/근로자 입력 자료, 사진, SHA-256 사진 원본 digest, 인증 토큰/환경 변수는 포함하지 않는다.
- `npm run verify:fast` 및 `npm run verify:ci`에 31차 관문과 함께 추가한다. GitHub `PSI release verification`에서 artifact로 보관하되, CI PASS는 오직 소스/가상 재현성의 증명이다.
- `tests/fieldCameraIntegratedCandidate.test.ts`에서 차수 누락, 스크립트/빌드/브라우저 필수 경로 삭제, fingerprint 재현성, **승인·배포/실기기 완료 오표시 거부**를 검증한다.

## 4. 이번 통합 PR의 병합 원칙 (오늘 실행 금지)
1. **32차 최종 통합 PR** 하나의 변경 목록에서 25~32차 전체를 검토한다. 이것은 25차부터의 변경을 모두 포함하므로 201~207번 PR들을 개별적으로 `main`에 병합하지 않는다.
2. 11월 2일 별도의 배포 재개 지시가 있을 때 `main` SHA와 통합 PR HEAD/비교 상태, CI 3종과 32차 소스 지문을 **최신 기준으로 다시 확인**한다. `main`에 다른 변경이 생기면 무조건 병합하지 않고 재베이스/재검증한다.
3. GitHub branch protection과 Vercel 프로젝트/요금제 배포 한도, 자동 배포 연결을 다시 확인한다. `main` 푸시가 Production 배포를 유발하는 경우 **한 번의 병합만 수행**하여 반복 Production 빌드를 피한다.
4. 사용자 승인·실제 기기 점검 기록 별도 안전 보관·롤백 후보 확인 후에만 Production을 목표로 한 작업을 진행한다. 서비스에 문제가 있으면 GitHub merge가 통과해도 **배포 성공으로 보고하지 않는다.**
5. 공식 Production alias의 실제 커밋 SHA, READY, 주요 페이지 접근·F01~F10 기능 및 기존 기록 보존을 사후 확인한다. Preview의 통과나 Vercel READY만으로 실제 현장 시험을 대체하지 않는다.
6. 최종 통합 PR이 실제 병합된 뒤 선행 스택 #201~#207은 병합 여부를 재확인하고 **중복 main 적용을 방지**하도록 정리한다. 원본의 조사/감사 참조는 보존한다.

## 5. GO / NO-GO 목록

| 단계 | GO 기준 | 미충족 시 |
|---|---|---|
| 소스 출처 | GitHub 현재 main SHA와 후보 HEAD, PR diff, 브랜치 직계 확인 | NO-GO |
| 소스 지문 | 32차 manifest 생성·각 소스의 SHA-256·재현성 검증 | NO-GO |
| 자동검증 | 최신 후보 SHA에 릴리스·회사 전체·Inspector 모바일 QA **3종 모두 SUCCESS** | NO-GO |
| 백업/복구 | v17, 이전 포맷 손상/위조 거부, 실제 기기의 중요한 기록 백업과 복원 가능성 검토 | 미확인 내용 NO-GO 또는 운영 제한 |
| 기기 | Android Chrome·Samsung Internet의 촬영·임시조치·재점검·인계·CSV·A4 파일 저장, 저장소 청소·오프라인 복구 | 실제 현장 실증 완료 주장 금지 |
| 정보 보호 | 기본값에 이름·사진/상세 사유 미포함, 내보내기 전 저장된 이력 대조 | NO-GO |
| Vercel 준비 | 배포 제한/권한/프로젝트, 이전 READY 롤백 가능성 조회 | NO-GO |
| Production 증명 | 공식 alias의 Git commit과 대상 Production 배포 커밋 일치, 실제 접근 검사 | 완료 판정 불가 |

## 6. 출시 승인과 사람의 작업
- 자동검증 성공 ≠ 안전관리자 현장 확인 ≠ 작업 재개 승인.
- `verified`와 `temporary_checked`는 사람/점검자의 기록일 뿐, 플랫폼이 위험이 해소되었다고 확정할 수 없다.
- 현재 관리자 확인/현장 담당 수신/제3자 안전 승인/실제 스마트폰 실증은 **미완료**다.
- **2026-11-01: `main` 병합, 운영 배포, 승인 없이 Preview/Production 재배포 강제, Vercel 요금제 변경, 실제 현장 개인정보 외부 전송은 하지 않는다.**
