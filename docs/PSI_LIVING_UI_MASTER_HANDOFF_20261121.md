# NEW-PSI LIVING UI · 통합 설계·구현·검증 인계서

> 기준일: 2026-11-21 (Asia/Seoul) · 상태: **개발 브랜치 작업 중 / 운영 미반영**  
> 대상: **TELLOWSS/NEW-PSI 단독**. SMART TBM과 PSI : ZERO DAY는 별도 제품.  
> 디자인 참조: https://codeandchill.store/templates (아이디어·인터랙션 개념 참고, 소스/에셋 무단 복제 금지)  
> 인계 문서 경로: `docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md`  
> 우선 원칙: **현장 사실 > 사람의 최종 판단 > 증빙·보안 > 업무 완결 > 접근성·성능 > 시각적 연출**

## 0. 반드시 계승할 사용자 정정

- **잘못된 전제 철회:** “현장 관리자는 장갑을 착용한 채 모바일을 사용한다”는 일반화는 근거가 없고 잘못된 설계 가정. 관리자·근로자를 같은 이용자군으로 묶지 않는다.
- 관리자 UX는 실제 업무(현장 점검, 관리자 검토, 기록 수정, 작업 지시/조치 확인, 증빙·보고)의 맥락, 업무 빈도, 기기·장소·권한을 기준으로 판단한다. 장갑 착용 여부 또는 ‘한손 조작’을 임의의 필수 페르소나로 만들지 않는다.
- 근로자 UX는 자기규율 위험성평가와 교육 참여, 쉬운 표현, 모국어를 우선하되 언어·문해력·이용환경은 **현장 관찰·사용성 검증으로 확정**한다.
- 장갑과 관계없는 검수 가능한 인터페이스 지표(터치 목표 크기, 가독성, 오류 복구, 키보드 접근성)는 유지한다. 이는 안전·접근성 기준이지 관리자에 대한 임의 추정이 아니다.
- 화면 전환 애니메이션이 실제 조치, 현장 위험도 변화, 법적 적합성, 보고서 전송 완료인 것처럼 사용자를 오도해서는 안 된다.

## 1. 소스 오브 트루스와 기준 점검

1. GitHub 원격 `main`, 현재 열려 있는 PR·CI·Vercel의 운영 SHA를 작업 시점마다 재조회한다. 회사/집 PC 로컬 파일은 기준이 아니다.
2. 시작 기준 `main` SHA: `8aa4dea89f789d569a715386e1646d848ceb17c1` (2026-11-21 조회). 이것을 미래의 최신 커밋으로 가정하지 않는다.
3. 작업 브랜치: `feat/psi-living-ui-design-foundation-20261121`; 개발·테스트는 여기에 누적하고 사용자 최종 승인 전 `main` 병합/Production 배포 보류.
4. 읽을 파일: `AGENTS.md`, `.agents/skills/psi-ai-company/SKILL.md`, `docs/psi-ai-company/NEW_CHAT_HANDOFF.md`, `docs/PSI_PRODUCT_VALUE_AND_DESIGN_BLUEPRINT_2026-08-21.md`, `docs/PSI_DEVELOPMENT_GUARDRAILS.md`, `docs/NEW-PSI-INSPECTOR-UX-REDESIGN-2026-11-03.md`, `config/psi-oss-candidate-manifest.json`.
5. 기존 코드에서 확인한 기반: React 19 / Vite / TypeScript, `components/Layout.tsx`, `components/Sidebar.tsx`, `components/shell/`, `pages/OperationalApp.tsx`, `styles/psi-platform-field-canvas.css`, `styles/psi-platform-workspaces.css`; OCR, 카메라, 보고서·교육 기능과 회귀 검증 스크립트가 이미 있다.
6. 기존 `FIELD CANVAS`(R66~R78 등), 설정된 모바일 탭·역할별 메뉴를 먼저 재사용한다. 레거시 CSS와 기능을 파악하기 전 전체 리라이트나 중복 디자인 시스템 추가 금지.
7. 공개 원본 템플릿의 인상·패턴과 실제 제품의 도입 권리를 구분한다. 유료 템플릿 소스·이미지·폰트·에셋은 라이선스와 권리를 확인하기 전 이식 금지.

## 2. 제품 지향점: Living Safety Intelligence

사용자 요청은 단순한 “예쁜 사이트”가 아니라 **실제 위험 발견, 확인, 조치, 검증, 교육 환류가 사용 흐름과 화면에 살아 있는 것처럼 이어지는 통합 제품**이다. 시각적 피드백은 실제 업무 상태 또는 사용자의 입력에만 반응한다. 대시보드 수치·상태를 이유 없이 끊임없이 흔들거나, 아직 조치되지 않은 작업을 초록색 ‘해결’처럼 표시하지 않는다.

### 원본 템플릿과 매핑

| 참조 대상 | 원형에서 가져올 설계 개념 | NEW-PSI 적용 범위 | 제한 |
|---|---|---|---|
| Sylva | 레이어·접힘형 메뉴·검색 | PC 운영자 셸 / 내비게이션 | 기존 RBAC 및 메뉴 접근성 유지 |
| Skerry | 작업 보드·모바일 주요 탭 | 담당자·조치·재점검 화면 | 단순 칸반으로 안전 판단 대체 금지 |
| Orvex | 경보 우선순위·처리 큐 | 미조치 위험·현장 현황 | 실제 데이터 기반 경보만 |
| Veyla | 원본과 해석 결과 대조·검증 | OCR/AI 관리자 검수 | AI 자동 승인 금지 |
| Brisko | 단계 연결·상태 이동 | 월간 위험성평가→교육→재확인 | 미완료 분기/수동 승인 표시 |
| Halsa | 기간별 변화와 비교 | 6대 안전인식 지표·보고서 | 근로자 개인 낙인/순위 금지 |
| Strova | 모바일 전용 터치 흐름·완료 반응 | 교육 참여/입력의 모바일 UX | 단순 운동 앱 UI 복제 금지 |
| Vanta | 고급 브랜드 소개 및 영상 | 별도 제품 소개/홍보 화면 | 실무 기본 화면에 과다 시네마틱 금지 |
| Arc, Splay, Upload 등 | 내비게이션 선택·공유·업로드 피드백 | 모바일 메뉴 / 사진 / 보고서 | 파일 수신·저장 완료 상태 정확히 분리 |

## 3. 정보구조·업무별 인수 조건

### A. 공통 플랫폼·PC 운영자
- 기존 사용자 권한 및 메뉴 가시성 유지; 공통 토큰은 기존 `psi-platform-field-canvas` 위에 **선택적으로** 확장.
- 첫 화면은 **현재 상태 → 판단 근거 → 필요한 다음 행동** 순서. 반복 클릭이 필요한 대량 메뉴는 우선 정리하되 작업 경로 삭제 금지.
- 페이지 전환은 짧은 1회성 모션; 실제 데이터 저장/위험 변화와 혼동하지 않는다. 다크모드·인쇄·키보드·모션 감소 환경에서 손실 없어야 한다.
- 모바일 관리자 업무는 사진·미조치 확인·재점검·보고를 우선. 관리자 사용 조건은 사용자 조사 후 검증하며 장갑을 필수 전제로 두지 않는다.

### B. 5단계 자기규율 위험성평가
- 원본 질문 흐름 준수: **위험작업 → 가장 큰 위험요소 → 상/중/하와 이유 → 내가 할 안전조치 → 오늘부터 실천할 행동**.
- 종이 기록·원문 보존·검수·다국어를 유지. 근로자의 응답을 순위표나 벌점으로 가공하지 않는다.
- 모바일에서 한 번에 한 문항 제공은 권장 인터랙션이지만 실제 수기/QR 흐름을 없애지 않는다.
- 11개 이상 언어 출력의 글꼴 깨짐·정확성·줄바꿈을 확인하고, 기계 번역을 모국어 자연스러움 검증 완료로 표시하지 않는다.

### C. OCR·AI와 사진점검
- 원본 이미지와 인식문구를 비교하고 관리자가 수정·승인할 수 있도록 한다.
- ‘AI 제안’, ‘관리자 확인’, ‘확인 불가’를 구분한다.
- 사진 상태를 **촬영/기기저장/전송시도/서버수신/관리자검증**으로 구별한다. 앱을 닫거나 통신이 끊긴 경우에도 거짓 성공 표시 금지.
- 카메라는 단독 독자 제품처럼 흩어지지 않되 기존 별도 진입점, 오프라인 백업·복구, 사용자 동의, 원본 보존을 보장한다.

### D. 개선조치: 작업 현실 반영
- 화면 개념 상태: `발견`, `담당 배정`, `진행`, `조치 대기`, `검증 요청`, `검증 완료`; 이는 **UI 초안**이며 기존 DB/업무 상태와 대조한 후 매핑한다. 임의 마이그레이션 금지.
- **조치 대기**에는 사유, 임시 위험감소조치, 담당자, 재확인 일시/기한, 작업 중지·접근통제 해당 여부를 표시. 대기≠안전 확보, 검증 요청≠완료.
- 즉각 조치가 어려운 자재 대기·설비 정지·타 공정 협의 상황을 모델링한다. 기한 초과/재발/이관이 가려지지 않게 한다.
- 현장 작업중지·재개 및 최종 위험 판단은 AI가 자동 확정하지 않고 권한 있는 사람이 확인한다.

### E. 월간 안전교육·6대 지표·리포트
- 근로자 참여기록→정제→관리자 검증→교육자료 반영→다음 주기 재점검·반복 위험 추적.
- 6대 지표는 위험인지도, 교육이해도, 실천참여도, 보호구/수칙, 소통/보고, 작업중지 감수성. 기간·공종 등의 집계 비교 중심, 개인정보 노출 최소화.
- 교육 영상·사례/국적별 자료·A4·PDF·공유 화면의 글자 잘림, 원본-번역 버전 불일치 여부 검수.
- 보고서 저장/공유는 생성 완료, 내려받기 완료, 외부 발송, 수신 확인을 각각 별도로 표시한다.

### F. 모바일 앱 전환
- 단계 1: 현행 React 반응형 모바일 UX·안정화.
- 단계 2: 필요성 검증 후 PWA/Capacitor 가능성 비교(설치, 오프라인 보관, 카메라·공유 API, 앱 수명주기).
- 단계 3: 필요한 경우 React Native/Expo 검토. 웹 템플릿을 네이티브 앱에 바로 이식할 수 있다는 주장 금지.
- 테스트는 관리자·근로자 권한/언어/현장 환경으로 나누며, 특정 복장/착용물 사용을 임의 전제로 삼지 않는다.

## 4. 완료 상태의 단일 정의

- `NOT_STARTED`: 소스 변경 없음.
- `PLANNED`: 요건·적용 위치·인수 기준 정의.
- `IMPLEMENTED`: 해당 브랜치 코드에 반영, 실제 동작/빌드 검증은 아직 별개.
- `VERIFIED`: 해당 변경의 테스트/빌드/기기 검증 증거 존재; 실패나 미검증 사항은 명시.
- `REVIEWED`: 제품·안전·보안·독립 QA 검토 완료.
- `RELEASED`: 승인된 PR main 병합 + Vercel Production READY + 도메인 alias와 배포 SHA 일치 검증.
- **완료 체크는 `RELEASED` 또는 비배포 산출물의 명시적 인수 시에만.** 코드 파일 존재를 곧바로 완료로 승격하지 않는다.

## 5. 누락 방지 통합 추적표

| ID | 모듈/검수 내용 | 현재 상태 (2026-11-21) | 완료 증빙·다음 기준 |
|---|---|---|---|
| L00 | 사용자 정정/페르소나·제품 경계 명시 | PLANNED → 인계서 기록 | 현장 관리자 장갑 가정 제거, 역할 분리 UX 검토 |
| L01 | 기존 코드·디자인·미완료 항목 감사 | IMPLEMENTED(1차 읽기만) | 모든 해당 화면, PR/CI/운영 상태 확인과 영향표 작성 |
| L02 | 공통 모션 기반·페이지 전환 | IMPLEMENTED / QA 대기 | CSS·컴포넌트 연결·회귀 테스트·기기 검증 |
| L03 | PC 사이드바·상단바·검색 | IMPLEMENTED(도크+상단 빠른 메뉴검색) / 전체 QA 대기 | 역할·숨김 동기화/키보드·다크모드/반응형 회귀 및 실기기 확인 |
| L04 | 모바일 관리자 홈·탭·탐색 | IMPLEMENTED(탭 접근권한·현재위치·메뉴 복귀) / QA 대기 | 기존 대시보드 모바일 흐름 재사용, 브라우저·Android·이탈 회귀 검증 필요 |
| L05 | 운영 대시보드 | IMPLEMENTED(기존 집계 기반 우선확인 안내 영역) / QA 대기 | 실제 필터·집계/안전 의미·반응형/Chromium·Android 검증; 기존 차트 유지 |
| L06 | 5문항 자기규율 입력 | PLANNED | 원본 보존·모바일 입력·다국어 검수 |
| L07 | OCR 원문 대조·수정·승인 | PLANNED | AI/관리자 권한 분리, 원본 이력·감사 회귀 |
| L08 | 사진점검 카메라·오프라인·업로드 상태 | PLANNED | 로컬/전송/수신/검증 구분 및 통신 장애 복구 |
| L09 | 조치 배정·대기·진행·재점검 | PLANNED | 임시조치·책임·일시·검증 상태 정확성 |
| L10 | 교육 환류·다국어 전달 | PLANNED | 다음 월 위험 반복 추적 및 인쇄물 검증 |
| L11 | 6대 지표·차트 | PLANNED | 집계의 실데이터 일치·가독성·낙인 방지 |
| L12 | 보고서·공유·다운로드 | PLANNED | 실제 발행/다운로드/외부 수신 상태 분리 |
| L13 | 제품 소개/온보딩 | PLANNED | 홍보 연출 격리·정확한 기능 설명 |
| L14 | PWA/모바일 앱 결정·실행 | PLANNED | 브라우저 vs 설치형 요구·비용·기능 비교 및 기기 확인 |
| L15 | 접근성·다국어·다크/저동작 | PLANNED | 320/360/390/768/1280/1440 등, 200% 확대·키보드 |
| L16 | 오프라인·저속망·성능·배터리 | PLANNED | 외부 폰트/API/서버 호출 증가 없는지 비교 |
| L17 | 권한·데이터무결성·OSS 라이선스 | PLANNED | 실자료 미사용 QA, 보안·법무 승인이 필요한 경계 |
| L18 | 통합 회귀·실기기 QA·승인·운영 배포 | PLANNED | `npm run verify:ci`, 필수 브라우저 QA, PR 리뷰, SHA 대조 |

**주의:** 표의 `IMPLEMENTED`는 **이번 브랜치에서 파일이 생성·변경된 범위**만 의미한다. 실제 브라우저/CI/운영 검증의 PASS가 아니다. 기존 구현의 완성도를 재평가한 표로 오인하지 않는다.

## 6. 이번 작업 변경 이력 · 구현 1차

- 기반 브랜치: `feat/psi-living-ui-design-foundation-20261121` (기준 main `8aa4dea`).
- `styles/psi-living-motion.css`: 독립적으로 범위를 제한한 페이지 이동 모션, 저동작/인쇄 폴백, 새 API/패키지 없이 구현.
- `pages/OperationalApp.tsx`: 관리자 전용 화면에서 CSS 로드. 근로자용 `/saas/education`, 공개 `/product`, 사진점검 독립 진입 등의 엔트리에는 적용하지 않음.
- `components/shell/PageHeader.tsx`: 애니메이션 대상 클래스 추가.
- `components/Layout.tsx`: `PageHeader`에 `key={currentPage}` 부여해 페이지 이동 시에만 재진입 애니메이션 수행.
- `tests/psiLivingMotionContract.test.ts`: 관리 셸 범위·모션 감소·네트워크 자원 불포함·페이지 변경 연결을 검사하는 회귀 테스트 코드 추가.
- **검증상태:** 브랜치 소스 파일 작성 완료. 실제 `npm run verify:ci` 및 Chromium/Android 시각·사용성 확인 전이므로 QA 미검증. `main`/Production 미반영.

### 구현 2차 — L03 PC 접힘형 사이드바 (2026-11-21)

- `components/Sidebar.tsx`: PC 전용 `allowCollapse` 옵션, 아이콘 도크(76px)/전체 메뉴(248px) 전환. 현행 역할별 메뉴 접근 제한·사용자 숨김/정렬·현재 페이지 강조를 유지.
- `components/Layout.tsx`: 데스크톱 사이드바에만 `allowCollapse` 전달. 모바일 오버레이와 모바일 하단 탐색에는 접힘 로직 미적용.
- `styles/psi-living-motion.css`: 너비 이동 1회 모션, `prefers-reduced-motion`에서 애니메이션 중단.
- 접힌 상태에서도 각 메뉴에 `title`/접근성 이름을 제공. 메뉴 편집 진입 시 전체 메뉴를 다시 펼침.
- `tests/psiSidebarDockContract.test.ts`: 모바일 분리, 메뉴 권한·편집 경로, 접근성 레이블 및 저동작 CSS의 소스 계약 검사.
- **QA 제한:** 파일 작성/브랜치 변경은 확인. CI·브라우저·실기기 모양과 기능의 최종 검증 전. L03은 전체 완료가 아닌 부분 구현이며, 검색·상단바 UX는 별도 과제.

**PR:** https://github.com/TELLOWSS/NEW-PSI/pull/237 (Draft, 운영 병합 금지).  
**1차 CI 이력:** HEAD `baa9eade`에 대한 `npm run verify:ci` 검사 성공(릴리스 워크플로), cross-department 브라우저 검사는 조회 당시 진행 중. **2차 변경을 포함한 최신 HEAD에 대한 검사 결과가 별도로 필요**하다. 중간 커밋의 성공을 현재 HEAD의 성공으로 대체하지 않는다.

### 구현 3차 — L03 상단바 메뉴 빠른 찾기 (2026-11-22)

- 기존 인계서 원칙과 GitHub `main` `8aa4dea`, Draft PR #237을 실제 재확인. 이전 2차 HEAD `3eabe178`에 대한 `PSI release verification`, `PSI company-wide cross-department verification` 모두 CI SUCCESS 확인. 그 결과를 **이번 새 HEAD의 검증 성공으로 재사용하지 않는다**.
- Vercel의 최신 확인 Production READY 커밋은 `8aa4dea89f789d569a715386e1646d848ceb17c1` (배포 `dpl_HYUrvRfaqfqLmKdDNpQ8MATxhquw`). Living UI 브랜치는 운영 미반영.
- `components/Sidebar.tsx`: `getSidebarVisibleMenuItems`를 추출해 사용자에게 표시되는 메뉴 목록을 검색과 사이드바가 **동일한 필터**로 계산. 기존 역할 허용, 운영 모드, 숨김/순서 설정을 존중.
- `components/shell/NavigationQuickFind.tsx`: 로컬 메뉴 검색 창. 한글 메뉴/분야 입력, 위/아래 화살표 선택, Enter 이동, Esc 종료, 포커스 복귀·Tab 포커스 순환, Ctrl/⌘+K 호출(입력 필드에서는 가로채지 않음). 모바일 전체 메뉴가 열린 경우 단축키 차단. 실근로자 기록·사진·위험 데이터 검색이 아니며 네트워크·저장소 호출 없음.
- `components/shell/TopBar.tsx`: PC/모바일 상단바 검색 진입점 추가.
- `components/Layout.tsx`: 실제 접근 가능한 메뉴만 검색 후보로 제공하고 기존 `handlePageChange` 동작(스크롤 보존 등) 사용.
- `tests/psiNavigationQuickFind.test.ts`: 역할/숨김 분리, 한글 검색, 이벤트 및 데이터 경계 소스 계약 테스트.
- **현재 판정:** 소스 IMPLEMENTED. 새 HEAD의 CI·Chromium·모바일 실기기 UX 검증 전이며 L03 `VERIFIED`·`RELEASED`가 아님. `main` 병합/Production 배포는 승인 전 보류.

**다음 실행:** 최신 HEAD의 `npm run verify:ci` 및 7개 업무 흐름·대시보드 반응형/저동작 QA 확인. UI가 변경된 PC/모바일 메뉴검색의 실제 포커스·검색·숨김·키보드 동작을 브라우저에서 검증한 후 L04 모바일 관리자 홈·탭 탐색 구조 개선에 착수. 개발 외부 서비스를 호출하거나 독립 앱을 무단 통합하지 않는다.

### 구현 4차 — L04 모바일 관리자 하단 탐색 정확성·접근성 (2026-11-22)

- **전제 검증:** `main` `8aa4dea89f789d569a715386e1646d848ceb17c1`, Draft PR #237, 이전 HEAD `d85b9e39da0cf17a25f8bb4e27fd1f4729a853ec`의 릴리스/부서별 Chromium CI 둘 다 SUCCESS. Vercel Production READY 최신 확인 배포는 기존 main SHA `8aa4dea...`.
- **현행 재활용:** `pages/Dashboard.tsx`에는 이미 `현장 모바일 실행 흐름`과 업무 바로가기가 구현되어 있다. 별도 중복 홈/바로가기 패널을 추가하지 않는다.
- **결함:** 종전 `components/Layout.tsx`의 모바일 탭 판별은 운영 모드와 숨김만 확인했고 역할·메뉴 카탈로그 통합 기준을 사용하지 않았다. `dashboard`/기타 화면으로 강제 fallback이 있어 숨겨진 대상을 호출할 수 있었다. 그룹에 속하지 않는 화면은 잘못 ‘홈’이 선택됐다. '더보기'를 열 때 초점 복귀를 위한 기존 `handleOpenMobileMenu` 대신 `setIsMobileMenuOpen(true)`를 직접 사용했다.
- **수정:** `utils/mobileNavigationUtils.ts`의 `resolveMobileNavigation`은 기존 Sidebar와 빠른 메뉴검색 공통 `getSidebarVisibleMenuItems`의 결과만 전달받아 탭을 결정한다. 가려진 페이지로의 임의 fallback 금지; 표시 가능한 대상이 없는 탭은 숨김; ‘더보기’는 라우트가 아닌 전체 메뉴 열기 전용.
- `components/Layout.tsx`: 기존 탭 분류(홈/위험분석/계도/교육자료/더보기)를 보존하면서 진입 페이지와 활성 상태를 공통 판정으로 동기화. 보이지 않는 메뉴의 단추는 표시하지 않음. 더보기 탭은 `aria-current=page`를 위조하지 않고 `data-active`로만 표현. 기존 모바일 전체 메뉴의 초점 복귀 경로 사용.
- `styles/psi-living-motion.css`: 선택된 탭에 짧은 청록색 강조 마커, 기존 다크/라이트 브랜드 토큰·키보드 포커스 상태 활용. 점검 업무 수치의 허위 실시간 이펙트 없음.
- `tests/psiMobileNavigationL04.test.ts`: 관리자 표시 메뉴 동기화, 대시보드 숨김 시 우회 금지, OCR 보호 경계, 전체 메뉴에서 연 화면의 활성 표시, 빈 탭 제거, 정확한 더보기 접근성 계약.
- **기존 사진점검 보호:** `safety-inspector` 진입 시 모바일 하단바를 숨기는 기존 단독점검 화면 정책을 변경하지 않는다. 원본·카메라·오프라인 저장 및 조치 의미 수정 없음.
- **현재 상태:** 소스 구현 완료, 최신 HEAD `verify:ci`·제품 브라우저 QA 및 실제 Android에서 탭 전환/스크롤/저장 중 화면 이탈 검증 필요. `VERIFIED`/운영 `RELEASED` 처리 금지. 코드 변경 후 운영 `main` 병합·Vercel Production은 사용자 승인 전 보류.

**후속:** L04의 모바일 실제 UX·현장 대시보드 경로·사진점검 복귀 동작을 검증하고, 이어 L05 실제 데이터 기반 운영 대시보드 컴포넌트를 현재 구조와 비교해 개선한다. 현장 관리자가 장갑을 낀다는 가정을 하지 않는다.

### 구현 5차 — L05 기존 운영 대시보드의 근거·다음 행동 연결 (2026-11-22)

- **기준 재조회:** GitHub `main` SHA `8aa4dea89f789d569a715386e1646d848ceb17c1`, Draft PR #237 HEAD `3eb6f437f31e7ee5bc38f21c287ad524a8da0c40` 확인. 해당 이전 HEAD의 `PSI release verification`(#44940642605) 및 `PSI company-wide cross-department verification`(#44940642677) 모두 SUCCESS. Vercel Production READY 배포 `dpl_HYUrvRfaqfqLmKdDNpQ8MATxhquw`은 기존 main `8aa4dea` 기준. **이번 신규 코드 HEAD의 검증은 별개**이다.
- **기존 대시보드 보호:** `pages/Dashboard.tsx`는 기본 `PrecisionOperationsBoard`와 상세 분석 콘솔을 이미 제공하고 있다. 수치·기간·공종 필터, 우선순위 목록, 6단계 업무 흐름, AI 설명, 차트 등을 삭제하거나 구조 개편하지 않는다. 사용자 승인 없이 기본 대시보드 대수술 금지 원칙 준수.
- **데이터 근거:** 기존 `components/dashboard/PrecisionOperationsBoard.tsx`의 `filteredRecords`, `statusCounts`, `sourceReviewCount`, `periodScopeLabel`, `tradeFilter`, `latestRecordLabel`만 사용한다. 서버 요청, 외부 API, 통신 폴링, 임의 데이터, 신규 DB 필드 없음. 수치에 사용한 기간·공종·조회 기록 수·원문 확인 신호·최근 기록일을 함께 보여준다.
- **핵심 로직:** `utils/operationsDecisionFocus.ts`가 선택 범위 기록 없음→보호 우선→관리자 검토 대기→원문 확인→분석 진행→후속 교육 환류의 우선순위를 구분한다. 상태는 **관리자에게 다음 확인 행동을 제안**할 뿐 실제 현장 위험 해소·작업중지/재개·AI 자동 승인 아님. 선택 기록 0건에서 ‘현장 안전’ 결론을 금지.
- **화면:** `components/dashboard/OperationsDecisionFocus.tsx`를 새 컴포넌트로 만들고 기존 대시보드 첫 단락과 3단계 업무 경로 사이에 붙였다. 선택 상태, 설명, 기간/공종/건수 등 증거 범위, 검토/조치/교육 원래 화면으로 이동하는 버튼을 표시한다.
- **디자인:** `styles/psi-living-motion.css`에 운영자 셸 내에서만 적용되는 반응형 패널, 브랜드 토큰·키보드 포커스·`prefers-reduced-motion`·인쇄 폴백을 적용했다.
- **회귀:** `tests/psiOperationsDecisionFocus.test.ts`는 기록 없음/보호 우선/검토대기/OCR 원문/분석 진행/교육 연결, 근거 필터 연동, 외부 호출·개인정보 저장소 불변 계약을 검사한다.
- **실제 합성 브라우저 회귀:** `scripts/verify-psi-current-metrics-ui.mjs`의 기존 기본/상세/모바일 관제 시나리오에 L05 DOM 렌더링, 기간 '전체' 전환 시 3건 합성 기록 반영, 390px 너비 가로 스크롤 검사 및 합성 스크린샷 `living-l05-basic-dashboard-mobile.png`을 연결. 기존 실제 근로자 데이터 사용 없음.
- **실패/수정 이력:** 최초 L05 통합 HEAD `e6baf062`의 `PSI release verification` (#44947084821)에서 `OperationsDecisionFocus.tsx` props rest를 `OperationsDecisionFocusInput`으로 추론하지 못해 TS2345 실패. 필수 5개 숫자를 명시적으로 전달하는 코드로 수정(`4823c611`). 이후 브라우저 실검증 보강(`c9d565b9`). 최초 실패를 PASS로 기록하지 않음.
- **현재 판정:** 새 코드가 개발 브랜치에 반영된 `IMPLEMENTED` 단계. GitHub Actions 최신 SHA의 `verify:ci`, 브라우저 실제 확인, Android/Samsung Internet 확인을 실행·기록해야 `VERIFIED` 처리 가능. 상용 안전판정이나 현장 배포 완료로 오인하지 않는다.

**다음:** 최신 HEAD 릴리스/전사 Chromium 회귀 확인 → 대시보드 360/390/768/1280px·다크·저동작에서 집계 필터 변화와 CTA 이동 재검증 → L06 근로자 5문항 자기규율 입력과 관리자 검증 경로의 디자인·다국어 감사. L04 실기기 검증 잔여 병행. main 병합/Production 배포는 사용자 최종 승인 전 보류.

## 7. 역할별 검수 책임(독립 자동 에이전트 실행 주장 아님)

- ATLAS: 범위·상태·커밋·PR·배포 게이트.
- NAVI: 관리자와 근로자의 실제 업무, 메뉴/용어, 5문항 이해성.
- LUMI: 브랜드·모션·다크·반응형·실기기 시각 검수.
- CORE: React·CSS·상태 변경·오프라인·성능·CI.
- SAFI: 위험성평가/교육/조치 대기/완료 판정의 안전 의미.
- KEEPER: 원본·개인정보·공유·현장별 권한·OSS 라이선스.
- PROOF: 변경자의 자체 주장과 별개인 테스트/시각·성능·회귀 증거.

## 8. 작업 재개 순서 — 매번 동일하게

1. GitHub 연결 상태를 확인하고 `main`의 최신 SHA, 이 작업 브랜치의 HEAD, 열려 있는 PR/CI, Vercel Production SHA·도메인을 **새로 조회**한다.
2. `AGENTS.md` 및 이 문서를 읽고 `L00~L18` 중 가장 앞의 **검증 대기/실행 가능한** 항목을 선정한다. 그 이전 항목이 막혔으면 원인을 기록하고 다른 독립 항목을 진행한다.
3. 실제 현재 소스와 기존 구현을 대조해 중복 구현을 피한다. 변경 전에 범위/수용 기준/잠재 회귀를 정한다.
4. 소규모 변경→타입·해당 단위 테스트→전체 `npm run verify:ci`→관련 브라우저 QA 순서. 실패하면 해당 실패를 재현 가능하게 기록하고 PASS 처리하지 않는다.
5. 변경 파일, 커밋 SHA, 검사 실행 결과, 스크린샷·로그(합성 자료만), 실패 및 미검증을 표의 해당 ID에 기록한다.
6. 개인정보·DB·유료 호출·외부 발송·작업중지/재개·배포·OSS 소스는 별도 승인 게이트를 지킨다.
7. `main` 병합/운영 배포 전에 독립 QA 및 사용자 승인 조건을 재확인한다.
8. **다음 한 작업**을 인계서에 적고 종료한다. 채팅이 길어져도 코드와 이 문서가 연속성을 보증하도록 한다.

## 9. 다음 착수 과제

**L05 최신 HEAD CI·브라우저/실기기 검증 → L06 근로자 5문항 입력·관리자 검증 UX 확인.**
- 이 PR의 테스트가 동작하는지 `npm run verify:ci`, 브라우저의 실제 페이지 전환·키보드 탐색·다크/저동작·320~1440px 검증.
- 신규 CSS와 기존 R70~R78 CSS 중복/우선순위 점검; 이상 시 회귀 수정.
- 다음 범위는 `components/Sidebar.tsx`, `components/shell/TopBar.tsx`, `components/Layout.tsx`, 운영자 전용 CSS. **기존 기능/권한/순서·숨김 설정을 바꾸기 전 사용자 영향 검토.**
- 사진점검의 FIELD CANVAS 기존 설계와 충돌 없는 통합 디자인으로 계속 진행.

## 10. 새 채팅에서 사용할 재개 문장

```text
NEW-PSI Living UI 고도화 이어서 진행. GitHub TELLOWSS/NEW-PSI의
AGENTS.md 및 docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md를 먼저 읽어.
main과 feat/psi-living-ui-design-foundation-20261121 브랜치의 HEAD,
열린 PR/CI/Vercel 현재 운영 SHA를 실제 재조회해.
사용자 정정: 관리자의 장갑 착용을 전제로 UX를 일반화하지 말 것.
L00~L18 추적표에서 미검증·미완료 항목을 먼저 확인한 후
해당 항목을 소스에 실제 구현하고 독립 검증 증거·실패·다음 작업을 인계서에 갱신해.
SMART TBM과 ZERO DAY는 제외. main 병합·Production 배포는 최종 승인 전 보류.
```
