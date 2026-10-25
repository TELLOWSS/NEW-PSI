# ATLAS — NEW-PSI 오픈소스 상업화 검토 (2026-10-26)

## 조사 사실
유튜브 https://www.youtube.com/watch?v=kvJ_j4EyrIs 본문·자막은 현재 확보하지 못했으므로 영상 속 10개 오픈소스는 **미확인**. 관련성 없는 GitHub TOP 10 기사 목록과 혼동하지 않고, 정확한 upstream URL/LICENSE/SBOM을 확인하기 전엔 코드 복제·패키지 설치를 하지 않는다.

GitHub `TELLOWSS/NEW-PSI`는 **public** 저장소이며 루트 `LICENSE`가 없다. 무단 사용 허가를 뜻하지는 않지만 소스 열람·복제가 가능한 공개 상태. 코드 소유권·특허·비공개 대상은 권리자와 별도 검토한다. 임의로 루트 라이선스를 부여하거나 저장소 공개 설정은 바꾸지 않는다.

Vercel Hobby 무료 플랜은 공식 약관상 개인·비상업적 사용만 허용된다. NEW-PSI/Inspector의 유료 상업 운영 전 Pro 이상 또는 상업화 가능 호스팅을 확인해야 한다. 오픈소스 허용 조건과 호스팅 약관은 별개다.

## 설치 패키지 최초 선언 분석
`package-lock.json`에는 `node_modules/` 선언 379개가 있다. 집계: MIT 283, ISC 36, Apache-2.0 24, BSD-3-Clause 14, MPL-2.0 12, BlueOak-1.0.0 4, CC-BY-4.0 1, (MIT OR GPL-3.0-or-later) 1, (MIT AND Zlib) 1, 0BSD 1, MIT AND ISC 1, BSD-2-Clause 1.

- MPL-2.0: `lightningcss`와 11개 플랫폼별 실행파일. **소스파일 단위** 의무가 있는 약한 카피레프트이며 최종 배포 형태/원본 수정 여부에 따른 법률 검토 필요.
- CC-BY-4.0: `caniuse-lite`(표시·출처 의무 점검).
- 이중 라이선스: `jszip` `(MIT OR GPL-3.0-or-later)`. MIT 선택 가능성은 있지만 실제 저작권·LICENSE 원문을 확인해 기록할 필요.
- 이미 쓰는 React, PDF.js, Tesseract.js 등 여러 라이브러리는 package lock 상 MIT/Apache 등 상업 이용을 일반적으로 허용하는 라이선스로 선언된다. 실제 포함되는 폰트·훈련데이터·콘텐츠·음향·모델은 각기 별도 권리.

## 추가한 자동 검사
`scripts/verify-oss-licenses.mjs`는 잠금파일 메타데이터만 오프라인 검사한다. 비승인 라이선스·표시 누락·새 MPL/CC-BY 패키지·기존 특수 라이선스 버전 변경은 실패, 이미 존재하는 13개는 **상업 사용 승인 아님** 경고를 표시한다. `npm run verify:fast` 앞부분에서 실행되며 출시 검증에 통합. 이 검사는 원본 저작권·라이선스 파일과 재배포 고지 의무의 완전한 확인, 특허/상표, 모델/학습데이터 사용권, SBOM 취약점 검토를 대신하지 않는다.

## 10개 오픈소스 도입 승인 기준
정확한 저장소 → 고정 tag/commit → LICENSE/NOTICE/ASSETS → 공급망 취약점 → 기능 중복/필요성 → Vercel·Android/가성비 → 신규 비용 → 법적 의무 → 유일한 신규 PR+회귀검증 순으로 도입. 근로자에게 관리자 프로그램 공유 없음. 협력사 산업안전보건관리비·SMART TBM·PSI ZERO DAY 분리 유지.

공식 참조: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository ; https://choosealicense.com/licenses/ ; https://vercel.com/legal/terms
