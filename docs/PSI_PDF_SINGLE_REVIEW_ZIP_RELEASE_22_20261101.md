# NEW-PSI 22차 — 단일 ZIP 다운로드·출력물 재열람 및 Vercel 배포 정합성 (2026-11-01)

## 확인한 기준선
- GitHub `main`: `2cd3021dcff81004e4dd999203e58ff2efe243d8` (21차 PR #197 병합).
- Vercel `new-psi` Production READY: `090f5ddb07e684de7deb7133c6504759f84aa107` (17차). 두 SHA는 다르며 **18~21차 운영 반영 완료를 주장할 수 없다**.
- Vercel 팀 `tellowss-projects`는 Hobby이며 여러 프로젝트가 연결돼 있다. 관련 GitHub status의 `build-rate-limit`은 빌드 빈도 제한을 나타낸다. GitHub 릴리스 CI 통과만으로 Vercel Production READY가 생성되는 것은 아니다.
- 제한을 우회하기 위한 무한 재배포, 프로젝트 복제, 팀 변경 또는 결제 플랜 변경을 자동 실행하지 않는다.

## 22차 변경 — 단일 로컬 다운로드
기존 21차 다운로드는 `saveAs(PDF)`와 `saveAs(JSON)`을 연속 요청하여 모바일 브라우저에서 두 번째 파일이 차단되거나 사용자가 한 파일만 보관하는 상황이 발생할 여지가 있다.

20차 원본/결과물 전 페이지 비교와 21차 **원본+출력 Blob SHA-256 저장 직전 재검증**을 그대로 유지하면서, 한 번의 ZIP 다운로드로 전환한다.

단일 ZIP 구성:
- `PSI_MASKED_REVIEW.pdf`: 실제 출력물과 SHA-256이 일치해야 하는 이미지 기반 가림 PDF.
- `REVIEW_MANIFEST.json`: 원본·출력 SHA-256, 수동 비교 완료 페이지·시각, `disclosureApproved:false`, `independentlyApproved:false` 상태.
- `SHA256SUMS.txt`: 출력 PDF 및 manifest JSON SHA-256.

다운로드 전 검증:
1. 원본·최종 PDF SHA-256이 manifest와 일치해야 한다.
2. 검토 페이지 수·해시·미승인 상태를 검증한다.
3. JSZip으로 ZIP을 생성하고, **생성된 ZIP을 다시 열어 PDF·JSON·SHA256SUMS 3개 엔트리**를 읽고 각 해시·내용을 확인한다.
4. 검증을 통과하면 `saveAs()` 1회만 실행한다. 실패하면 파일은 내보내지 않는다.
5. 다운로드 완료를 시스템에서 확인할 수 없으므로 UI는 **로컬 저장을 요청했다**고 표시한다. 사용자가 모바일 파일 앱에서 ZIP을 풀고 PDF·JSON을 다시 확인해야 한다.

## 시험 및 제한
- Vitest: 원본/사본 변조 시 다운로드 차단, 비교 미완료 차단, 성공 시 단일 ZIP 저장 요청 및 내부 3개 엔트리 구조 확인.
- GitHub 릴리스 타입 검사·단위 테스트·빌드, 회사 전체 7개 브라우저 경로와 21차의 합성 실제 PDF Chromium 검증.
- 실제 스마트폰(Android Chrome/Samsung Internet), 태블릿, Windows PC, 외부 PDF 뷰어에서 ZIP 다운로드·압축 해제·재열람 시험은 아직 수행 전. 저장 공간 부족·자동 다운로드 차단·ZIP 앱 미지원은 실기기 QA 대상.
- ZIP에 PDF 이외의 개인정보 원본을 넣지 않는다. **화면에 검토 중 표시되는 원본 PDF는 여전히 개인정보를 포함할 수 있다.**
- 암호화 ZIP/전자서명/독립 승인/현장별 접근 권한/수신자 반출 이력은 구현된 것이 아니다.
- `main`과 Vercel Production READY 커밋이 일치하지 않으면 배포 완료로 표기하지 않는다.

## Vercel 운영 복구 절차
1. Vercel 팀 Hobby의 빌드 제한·재설정 시점·월 사용량을 대시보드에서 확인한다.
2. 다른 프로젝트와 PR Preview의 불필요한 중복 빌드를 줄일지 **운영자와 결정**한다. 기존 Preview 기능은 임의로 비활성화하지 않는다.
3. 배포가 가능한 때에 검증된 `main` SHA를 대상으로 Production 빌드 **1회**를 시도하고 `READY` 확인 후 운영 도메인 별칭을 확인한다.
4. 운영과 GitHub SHA를 비교하고, 정상 배포 후 실제 PDF 흐름을 안전한 시험 자료로 재현한다. 실패 시 Vercel 원인을 구분하여 재배포 난사 없이 해결한다.
