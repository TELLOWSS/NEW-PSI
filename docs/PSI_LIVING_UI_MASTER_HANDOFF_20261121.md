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
| L06 | 5문항 자기규율 입력·검토 | IMPLEMENTED(기존 OCR 관리자 검토의 Q1~Q5 내비게이터) / 근로자 직접 입력 PLANNED / QA 대기 | 원본 편집·모국어 보존, 직접 제출 인증·저장·동의 설계 분리, 모바일 실기기 미검증 |
| L07 | OCR 원문 대조·수정·승인 | IMPLEMENTED(원본/인식/해석/미저장 상태 안내와 사진 포커스) / QA 대기 | 기존 승인·이력 불변, 신뢰도·문서 종류·다국어/320–390px 확인 및 Android 실기기 미검증 |
| L08 | 사진점검 카메라·오프라인·업로드 상태 | IMPLEMENTED(`/camera` 브라우저 사진함 저장·공유·수신·검수 표시) / QA 대기 | FieldCamera 한정, 실기기/저장실패/독립 점검앱 연계·오프라인 복구 미검증 |
| L09 | 조치 배정·대기·진행·재점검 | IMPLEMENTED(`/field-local/` F10 기존 대장의 최우선 다음확인·기록 재조회 이동 UI) / QA 대기 | 실시간 현장·수신 여부는 미확인, Android 실기기·오프라인 복구·모든 조치 유형 회귀 대기 |
| L10 | 교육 환류·다국어 전달 | IMPLEMENTED(교육 환류센터 6단계 근거 상태/언어별 A4 검수 이동) / QA 대기 | 외국어 자연스러움·A4 실물·교육 배포·서명/출석·Android 실기기 미검증 |
| L11 | 6대 지표·차트 | IMPLEMENTED(기존 평가점수 6항목 유효분모·차트 결측 0점 대체 제거·공종/팀 익명·유효점수 적용) / QA 대기 | 기획상 6대 안전인식 관점과 현행 점수 산식은 별도, 모바일·현장데이터·장기표본 QA 대기 |
| L12 | 보고서·공유·다운로드 | IMPLEMENTED(보고서 6단계 작성·저장요청·발송·수신·검증·승인 구분 및 공유창 상태) / QA 대기 | 파일 기기 보존/실제 상대방 수신·전자서명/실기기 검수 미확인 |
| L13 | 제품 소개/온보딩 | IMPLEMENTED(소개 첫 화면 실제 5단계 메뉴·근거 한계·Q1~Q5/6점수 구분, 결측점수 오분류 방지) / QA 대기 | 홍보 시연·실제 발행/수신 구분 필요, Android·음성/다국어·200% 확대 QA 대기 |
| L14 | PWA/모바일 앱 결정·실행 | IMPLEMENTED(기기점검 설치형 파일럿) / Android QA 대기 | 전용 manifest·실제 PNG·명시적 설치·SW 캐시와 회귀 테스트, 모바일 실제 설치·저장복원 및 비용 승인 잔여 |
| L15 | 접근성·다국어·다크/저동작 | IMPLEMENTED(관리자 메뉴·검색·viewport 부분 보강) / 전체 QA 대기 | 320~1440px 합성 Chromium·Tab/ShiftTab·다크/저동작·포커스 복귀 테스트 추가, 실제 200% 확대·원어민/스크린리더/Android 미검증 |
| L16 | 오프라인·저속망·성능·배터리 | IMPLEMENTED(브라우저 연결 신호·합성 재연결 QA) / 실기기·계측 대기 | 느린 문서 요청 지연·오프라인 재진입·사진 저장 재조회·재연결 후 API 미발송, 배터리·실제 3G 측정은 별도 |
| L17 | 권한·데이터무결성·OSS 라이선스 | IMPLEMENTED(source-only 헤더·OSS·보안 경계 자동감사) / 운영 보안 미승인 | 기기 점검 noindex/no-referrer 및 공유·관리자 인증/OSS 회귀 감시; 라이브 DB RLS·실 HTTP 헤더·라이선스 최신성 확인 잔여 |
| L18 | 통합 회귀·실기기 QA·승인·운영 배포 | IMPLEMENTED(독립 통합 출시 차단 게이트) / 실사용·사용자 승인·배포 대기 | 13개 필수 현장·보안·승인 증빙 pending; 자동 CI 7흐름+L15/16/17 증거를 한곳에 집계하고 승인 없이 RELEASED 금지 |

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

### 구현 6차 — L06 Q1~Q5 원문·해석 확인 보조 (2026-11-22)

- **최신 기준 재확인:** GitHub `main` `8aa4dea89f789d569a715386e1646d848ceb17c1` 유지, PR #237 Draft, 이전 L05 HEAD `7cd28d99b01b81cd0102dcd7f22c7e69f7463509`의 릴리스 #44947297252 및 부서별 Chromium #44947297229 모두 SUCCESS. Vercel 최신 Production READY 또한 기존 `main` `8aa4dea`. 이 사실은 **L06 신규 HEAD의 검증 PASS를 뜻하지 않음**.
- **실제 경로 감사:** `pages/WorkerTraining.tsx`와 `pages/WorkerTenantEducation.tsx`는 교육 열람·서명에 관한 근로자 화면이며 Q1~Q5 위험성평가 직접 작성·제출 화면이 아니다. `pages/FieldContextInput.tsx`는 공정·날씨 등 현장 컨텍스트이며 개인 Q1~Q5 입력이 아니다. 현재 Q1~Q5는 `config/psiFormMaster.ts` 단일 정의, 종이 기록·OCR·`components/modals/RecordDetailModal.tsx` 관리자 수정·검수 경로에서 사용한다.
- **이번 범위(기존 실기능 개선):** 근로자 직접 제출 폼과 개인정보 수집·임시 저장·인증·제출 API를 검증되지 않은 상태에서 신규 개설하거나 교육 서명을 제출로 오인하지 않는다. 대신 기존 관리자 OCR 원문/해석 비교 섹션에 빠른 문항 이동·원문/해석 확보 상태를 추가한다.
- `utils/psiFiveQuestionReview.ts`: `PSI_FORM_QUESTIONS`에서 Q1~Q5 순서·근로자 의도 문구를 재사용한다. OCR 원문이 없고 번역만 있는 경우 `translation-only`, 원문만 있으면 `source-only`, 둘 다 있으면 `comparison-ready`로 표시한다. '확보'는 승인 아님. 구형 비번호 항목은 해당 순번이 비어 있는 때만 대조하며, 기존 배열을 변형·보정·정렬하지 않는다.
- `components/assessment/PsiFiveQuestionReviewNavigator.tsx`: Q1~Q5 각 원문 확보 현황과 작성 의도, 5문항 이동 버튼(현재 소스에 있는 문항만 활성), 확인 상태와 최종 저장/승인/위험 해소의 차이를 분명히 안내. 한국어 기준 안내일 뿐 모국어 번역 검증 완료라고 주장하지 않음.
- `components/modals/RecordDetailModal.tsx`: 기존 `activeTab === 'qna'`의 원문/한국어 해석/모국어 번역 편집 UI를 그대로 사용하면서 내비게이터를 배치하고 해당 원문 입력 요소에만 식별자를 추가해 키보드 초점으로 이동한다. 기존 `handleAnswerChange`, 관리자 승인 게이트, 원본 이미지/증빙 저장은 불변.
- `tests/psiFiveQuestionReviewL06.test.ts`: 5문항 마스터 동일성·문항 순서·번역 단독 상태·옛 OCR 번호 없는 답변·원본 배열 불변·모국어 상태·실제 편집칸 연결·네트워크/저장소 호출 없는 소스 계약 검증.
- **남은 L06 본체:** 근로자 직접 5문항 자기작성 UX(언어별 실제 번역·접근성·개인정보 동의·중간저장/복구·확정 제출·관리자 검증·기존 기록지 동등성)는 **미구현/기획·수용 기준 검토 중**이다. 본 단계의 관리자 내비게이터를 실제 근로자 입력이나 '5문항 작성 완료'라고 과장하지 않는다.
- **현재 상태:** 신규 코드 브랜치 IMPLEMENTED, 새 HEAD의 `verify:ci` 및 Chromium 렌더링·작동/Android 실기기 확인은 별도 수행·기록 전. 모든 위험등급 판단과 원문/모국어 관리 판단은 원래 승인 경계를 유지. main/Production 배포 금지 유지.

**다음:** 최신 L06 HEAD 자동검증 결과·모바일 RecordDetailModal 390px 검수 → 실제 근로자 Q1~Q5 입력 경로 설계(기존 종이·OCR 기반과 병렬, 개인정보/권한/오프라인 전략 먼저) → L07 OCR 검수·원문 대조 정밀 UI. 새 라이브 데이터, 유료 API 또는 업로드 엔드포인트 임의 생성 금지.

### 구현 7차 — L07 OCR 사진·인식문장·해석·관리자 수정의 증거 경계 (2026-11-22)

- **착수 상태:** 이전 L06 HEAD `a18598ef941c3d468487f67ae2e432fd0cd34b8f` GitHub `PSI release verification` (#44952513667), 전사 Chromium (#44952513706) 모두 SUCCESS. `main`은 `8aa4dea89f789d569a715386e1646d848ceb17c1`; 확인한 Vercel Production READY `dpl_HYUrvRfaqfqLmKdDNpQ8MATxhquw`도 동일 SHA. 운영 미반영.
- **현재 코드 감사:** `components/modals/RecordDetailModal.tsx`는 왼쪽 자필 원본 이미지, 오른쪽 원문 비교 Q&A, 기존 `evaluateOcrVerificationCompleteness`/`evaluateOcrVerificationQuality`, 관리자 수정 시 재검토·저장 사유·최종 승인 게이트, auditTrail/approvalHistory를 이미 운영한다. 판정과 저장 엔진을 대체하거나 덧씌우지 않고 **증거의 의미를 오인하기 쉬운 안내 부분만** 개선한다.
- **`utils/psiOcrEvidenceReview.ts`:** 기존 필드만으로 `documentRejected` → 원본 이미지 미연결 → OCR 오류/낮은 신뢰도 → Q1~Q5 인식 문장 누락 → 한글/모국어 해석 누락 → 미저장 수정 → 육안 대조 필요 순으로 '다음 확인 안내'를 만든다. 단일 기준은 이미 만든 `buildFiveQuestionReviewItems`이며 **OCR 문장 존재는 사진 원본 확인과 다르다**는 것을 명시한다. 인식 신뢰도 0–1 범위 외 값은 미산정으로 표시하며 위험 해소/최종 승인을 판정하지 않는다.
- **`components/ocr/PsiOcrEvidenceReviewPanel.tsx`:** 관리자 원문 비교 화면에 5영역(원본 이미지, OCR 신뢰 신호, Q1~Q5 원문/한글 해석, 모국어 전달, 미저장 수정)을 좁은 화면에서도 한 줄씩 검토할 수 있게 배치. 연결된 사진만 '원본 사진 대조' 버튼 제공. 사전 생성 모델·인증 경로·서버 API·새 DB 테이블·추가 비용 없음.
- **`RecordDetailModal.tsx`:** `activeTab === 'qna'` 영역에 위 패널 추가, 기존 왼쪽 원본 사진 컨테이너에 `data-psi-original-document`·`tabIndex=-1`을 부여해 버튼으로 실제 사진 위치 이동/키보드 포커스. 기존 편집용 `answerText`, `koreanTranslation`, `nativeTranslation`, `handleSave`, `handleApprove`, 증빙/이력 원본 불변.
- **`tests/psiOcrEvidenceReviewL07.test.ts`:** 문서 부적합·원본 이미지 없음·신뢰도 저하/오류·원문 없는 번역문·외국어 번역 부족·미저장 수정·신뢰도 범위 밖·원본 배열 불변·독립 API/저장 없음 점검. 0.7 기준은 관리자 기존 `PrecisionOperationsBoard`의 OCR 원본 확인 신호와 일치.
- **범위/QA 경계:** 서식 부적합·결측 안내는 관리자의 사진 확인 우선순위일 뿐 새로운 승인 차단 규칙을 만들지 않는다. 사진이 미연결된 기록의 실제 원본 파일 유무를 단정하지 않는다. L07은 UI 보강 구현 완료·신규 HEAD `verify:ci`/전사 브라우저 검증 및 실제 Android/Samsung Internet 키보드/포커스/스크롤 QA 대기. 모국어 자연스러움·현장 관리자 대조 완료 여부도 미검증.
- **L06 잔여:** 근로자 직접 Q1~Q5 작성·서명·개인정보 수집/보관·인증·오프라인 복구·승인 결과 전달 기능은 미구현; QR 전파교육 서명과 혼동하지 않는다.

**다음 한 작업:** L07 최신 HEAD `verify:ci`와 Chromium 회귀 확인, 실패 시 수정·재실행 → L06 직접 근로자 입력의 접근권한·동의·오프라인 원본 보존 설계 및 L08 사진점검 업로드/저장/인계의 상태 라벨 정합성 점검. 최종 사용자 승인 전 `main` 병합·Production 배포하지 않는다.

### 구현 8차 — L08 FieldCamera 저장·공유·수신·검수의 의미 분리 (2026-11-22)

- **기준 상태:** 이전 L07 HEAD `9de75057926828a1ac46977eae49fe005ff4c6dd`의 `PSI release verification` (#44953136656), `PSI company-wide cross-department verification` (#44953136669)은 **둘 다 SUCCESS** 확인. `main` SHA `8aa4dea89f789d569a715386e1646d848ceb17c1`, Vercel Production READY `dpl_HYUrvRfaqfqLmKdDNpQ8MATxhquw` 동일. Draft PR #237 운영 병합 없음. 이번 L08 최신 HEAD의 검증은 별개로 기록.
- **기존 기능 감사:** `pages/FieldCamera.tsx`의 `/camera`는 비로그인 촬영·파일 선택 → `addFieldPhoto` IndexedDB 기록 → 저장 파일 재열기+SHA-256 검증 → 기기 공유창/ZIP 내보내기이며, **서버 업로드 및 수신 ACK 기능이 없다**. `/field-local/` 독립 기기 점검으로 사진/현장정보를 자동 이관하지 않는다. 이 제한을 속이지 않고 기존 경계를 보존한다.
- **구현:** `lib/inspector/fieldPhotoLifecycle.ts`에 로컬 보관(초기 읽기/보관 중/완료/실패/해시 불일치), 공유 앱(시도 전/검증 중/앱 인계·수신 미확인/취소·불가), **서버 수신 기록 없음**, **현장 검수·조치 별도 필요**의 4상태 읽기 전용 모델 추가. 공유앱 호출 반환을 수신자 전달 증명으로 승격하지 않는다.
- **화면:** `components/inspector/FieldPhotoLifecyclePanel.tsx`에서 4단계 상태를 390/1280 대응 그리드로 표시. `pages/field-camera.css`에 비장식 최소 강조·다크·인쇄·모바일 폭 대응. 촬영 조작이나 사진함 목록·원본은 변화 없음.
- **상태 연결:** `pages/FieldCamera.tsx`는 기존 `available`, `busy`, `pending`, `photos`, `invalidPhotos`, `transferring`, `shareInspectorPacket` 반환값을 이용해 화면 상태를 갱신하고 사진 선택/현장 문구/목록이 바뀌면 과거 공유 성공 상태를 초기화. 공유 실패/파일 검증 오류는 실패 상태로 두고 기존 실제 공유/재시도 버튼에 연결. 서버 API/외부 AI 호출 및 DB 스키마 추가 없음.
- **계약 회귀:** `tests/fieldPhotoLifecycleL08.test.ts`에서 IndexedDB≠기기 사진첩, 저장 준비/실패, 해시 불일치, 성공한 OS 공유와 서버 수신 구분, 취소/미지원/실패, 공유 중 상태, 화면 연동·부작용 없음 확인.
- **실제 합성 Chromium 회귀:** `scripts/verify-field-camera-delivery-preflight.mjs`에 390·1280px의 브라우저 사진함→공유앱 호출 성공→공유창 재시도→IndexedDB 저장 파일 변조 차단 및 상태 UI 검증을 추가, 합성 스크린샷을 `artifacts/audit/field-camera-l08/`에 생성. `scripts/verify-psi-company-browser.mjs` 독립 `qa` 시나리오에 연결. 네트워크 `/api/` 호출 0, 수신 ACK 없음이 원래 기능의 정확한 상태.
- **범위 경계:** 이번 L08은 **`/camera`** 사용자 경로의 상태 안내 개선이다. `/inspector` 로그인 관리자 사진점검, `/field-local/` 독립 오프라인 점검의 모든 상태, 실기기 카메라 센서, 브라우저 저장소 정리·용량 초과·재시도, 실제 카톡 수신·업로드, 자동 인계/재점검은 **별도 QA/후속 범위**. 완성됐다고 표현하지 않는다.
- **출시 게이트:** 최신 HEAD의 `npm run verify:ci`, 부서별 Chromium 11흐름, 320/390/768px·다크/저동작·실제 Android/Samsung Internet·오프라인 복구는 검증 결과에 따라 명시. 사용자 승인 전 `main`/Vercel Production 보류.

**다음 한 작업:** L08 최신 CI·실제 합성 Chromium 검증·실패 수정 → `/field-local/` 기기 점검 자체의 임시조치/진행/재점검 상태(L09) 확인, 별도 `/inspector` 클라우드 수신 상태와 구분. 근로자 직접 Q1~Q5 작성/제출 경로의 권한·보존 설계는 L06 잔여 과제로 계속 보유.

### 구현 9차 — L09 기기 점검의 지연 조치 '다음 확인 1건'·저장본 재조회 이동 (2026-11-22)

- **최신 근거:** L08 마지막 HEAD `2c13d579ae485b83135290e90376b0c5229d8a9a`의 `PSI release verification` #44953844041, `PSI company-wide cross-department verification` #44953844004는 **SUCCESS**로 재확인했다. `PSI inspector mobile browser QA` #44953843995는 후속 브랜치 변경으로 **CANCELLED**, PASS 아님. GitHub `main` / Vercel Production READY는 기존 `8aa4dea89f789d569a715386e1646d848ceb17c1` 유지. Draft PR #237 메인 병합 없음.
- **기존 L09 기능 감사(중복 제작 금지):** `components/inspector/InspectorLocalDraft.tsx`의 `/field-local/`은 이미 F10 기반 `FollowupEditor`(미조치/진행/완료 확인 요청/보완/확인 완료 기록), `buildDeferredActionGuide`(담당자·임시 안전조치·조치 목표일·재점검), `buildDeferredActionAttention`(현장 확인 수준·누락/기한), `buildLocalRecheckQueue`(상태 충돌/초과/오늘/예정/미정/완료), `RecheckEditor`, 조치별 추가기록, 인계 초안/수신 체크, 버전 이력·백업을 갖추고 있다. 이것을 다시 만들거나 DB 스키마를 변경하지 않는다.
- **실제 문제:** 관리자에게 긴 F10 재점검 관리판과 다수 점검 목록을 모두 열게 하는 대신, **바로 확인할 대상 한 건과 그 다음 조치**를 즉시 보여줄 필요가 있다. 기한 초과·재점검 누락은 화면 안내이지 안전 위험등급 자동평가가 아니다.
- **`lib/inspector/localNextCheckPrompt.mjs`:** 기존 `buildLocalRecheckQueue` 결과 및 `selectLocalHandoffTargets`의 우선순위 규칙을 사용해 `상태 충돌 → 기한 초과 → 오늘 확인 → 3일 내 → 일정 미정 → 장래 예정` 대상을 한 건 선정한다. 담당자·임시조치 미기록/확인일 미정은 서로 구분한다. 재점검일과 조치 목표일을 혼용하지 않는다. 빈 목록·'확인 완료 입력'만 있는 경우도 현장 안전·조치 완료를 단정하지 않는다. 오직 읽기 전용, 자동 통보·승인 없음.
- **`components/inspector/LocalNextCheckPanel.tsx`:** 저장된 조치 기록 1건의 범주/예정일 유형/기록 상태/다음 확인 조언과 관리상 미결·확인 입력 수를 표시. 기존 모바일/PC의 `si-btn` 버튼을 이용해 실제 재점검 입력 위치로 연결. 사진, 성명, 상세 자유기입 원문 등 외부로 전송하지 않음.
- **`InspectorLocalDraft.tsx`:** 저장된 `recheckQueue` 옆에 `nextCheckPrompt`를 계산하고 기존 F10 재점검 섹션 앞부분에 새 안내를 노출. **검증 중 발견한 결함:** 기존 `jumpToHandoffRecheck`는 준비된 인계문서 `handoffPrepared`가 없으면 `withVerifiedHandoff`가 즉시 종료하므로 일반 다음 확인 버튼에 재사용 불가. `jumpToNextSavedRecheck`를 **별도로 구현**해 클릭 시 실제 IndexedDB의 최신 `list()`를 읽고 변경/삭제·다른 탭 갱신으로 우선 대상이 달라지면 **이동을 중단하고 목록을 갱신**한다. 일치할 때만 저장된 기록의 재점검 영역으로 이동/키보드 포커스, 임시 인계 확인 체크는 초기화한다. 기존 인계 발송/수신 스냅샷 검수와 저장 함수는 수정하지 않음.
- **`tests/localNextCheckPromptL09.test.ts`:** 빈/확인 완료 단독/상태 상충/기한 초과와 정확한 기한 유형/담당자·임시조치·일자 누락/장래 예정 대비 미정 우선/추가 조치 별도 타깃/저장본 재조회 확인을 검증. 추가 외부 API·AI·서버 요청 없음.
- **`scripts/verify-inspector-local-offline.mjs`:** 실제 합성 Chromium 기기 점검에서 ① 최초 기록 시 다음 조치 없음, ② 지연조치 저장 뒤 올바른 현황과 입력 경로에 클릭·포커스, ③ 재점검 이력 추가 후 날짜 유형 갱신을 검증하는 회귀를 기존 현장 저장·오프라인 QA에 추가. 테스트는 사진·성명 등 실근로자 데이터 사용하지 않으며 `PSI inspector mobile browser QA`에 포함된다.
- **범위/판정:** 브랜치 구현만 완료했으며 신규 HEAD의 `npm run verify:ci`, 부서별 Chromium, 모바일 사진점검 QA의 최종 PASS와 실제 Android/Samsung Internet·기기 저장공간 부족·오프라인 재개 및 점검자 육안확인을 **별도로 검증**해야 한다. 조치 전/후 사진의 해시 일치는 실제 장소·위험 제거나 승인 증명이 아니다. `/camera` 사진은 자동 이관되지 않는다.
- **첫 검증 실패 및 조치:** L09 통합 HEAD `699f22a429a0ad84a9a2671e8205c13c698226f2`의 `PSI release verification` #44954469607은 **FAIL**. 로그에서 `tests/localNextCheckPromptL09.test.ts:49` 테스트 이름의 `today's` 작은따옴표가 TS1005·TS1002 문자열 오류를 일으킨 것을 확인. 제품 안전 판정/저장 기능 결함과 구분하고 테스트 이름을 수정한 커밋 `a7ca6afc9179099c6f033fda1605997846646fc5`로 반영했다. 이 수정 및 문서 갱신을 포함한 최신 HEAD의 CI 재실행 결과는 별도로 확인해야 한다. 실패를 통과로 대체하지 않는다.
- **2차 재검증·모바일 실패 및 조치:** L09 HEAD `2de7824933a10fc436c2d31a72e0b15b822d6233`의 `PSI release verification` #44954597449은 **SUCCESS**. 같은 HEAD의 `PSI inspector mobile browser QA` #44954597448은 **FAIL**. 독립 재현 로그 `scripts/verify-inspector-local-offline.mjs:580`에서 복원 기록을 검사하는 Playwright `panel.getByText('조치 진행 중',{exact:true})`가 기존 `FollowupEditor`의 상태와 L09 추가 안내 카드의 동일한 상태 라벨 2개를 함께 찾아 **strict mode violation**을 일으켰다. 이는 복원된 조치 상태를 확인하는 테스터 선택자의 범위 오류이다. 기존 후속 조치 관리 영역으로 범위를 제한하는 수정 `8d40f8615fffd871e4a45781a698213bc1e425a2`를 반영했다. 같은 스크립트의 유사 단언 2개를 모두 수정했으며, 최종 신규 HEAD의 모바일 전체 QA PASS와 무관하게 최초 실패를 남긴다.
- **L06 잔여:** 근로자 직접 Q1~Q5 입력/언어 검수/안전 보관·제출 경로 별도 미구현. `main` 병합·Production 배포 사용자 최종 승인 전 보류.

**다음 한 작업:** L09 HEAD의 릴리스·모바일/전사 Chromium 검증 결과를 확인하고 실패 시 수정한다. 기기 점검 조치 목록의 필터·키보드/390px 동작을 확인한 뒤 L10 교육 환류·다국어 전달 시 근로자 작성 답변을 낙인 없이 전달하는 경계를 점검한다. L08 Android 실기기/오프라인 복구와 L06 근로자 직접 입력은 잔여 게이트로 유지한다.

### 구현 10차 — L10 원본 대조 → 교육자료 → 다국어 검수 → 전달·이해 → 재점검 근거 분리 (2026-11-22)

- **기준 상태:** 직전 L09 HEAD `81eda3152fc0dcdad8d9f00dde0ae6cd5a18e941`의 `PSI release verification` #44954855857 및 `PSI company-wide cross-department verification` #44954855906은 **SUCCESS**; `PSI inspector mobile browser QA` #44954855843은 **FAIL**. GitHub 로그에서 기존 백업 복원 테스트 607행 `panel.getByText('확인 완료',{exact:true})`가 새 L09 카드+기존 등록 조치에 둘 다 일치하는 strict mode violation을 확인. `scripts/verify-inspector-local-offline.mjs`의 기존 검증을 `추가 조치 항목` 영역으로 제한하는 수정 `6764253e1c08b9f4d51b0e3c9d451a83480b69b3` 반영. **이 변경을 포함한 최신 모바일 QA 성공 여부는 재실행으로 별도 확정할 것.** `main`과 Vercel Production READY SHA `8aa4dea89f789d569a715386e1646d848ceb17c1`, Draft PR #237 유지.
- **기존 제품 흐름 감사:** `pages/EducationReturn.tsx`의 `buildEducationReturnSummary`는 현재 로드된 기록의 관리자 승인·미확인 및 '기록에 쓰인 언어' 개수만 집계한다. `utils/practiceVerification.ts`는 교육 전달·이해 확인·현장 관찰·재점검 관련 **이벤트 건수**와 상충 이력을 따로 집계한다. `pages/A4EducationMaterial.tsx`의 `MultilingualEducationAuditPanel`은 한국어+현장 외국어 10개 **형식/누락/원문변경** 검사이며 자연스러운 모국어 의미 검증은 할 수 없다. A4 출력물의 수동 확인 장부 `educationA4ReviewLedger`도 **기기 자체 입력**이지 서버 승인·배포·출석 증빙이 아니다.
- **L10 사용성 목표:** 월간 위험성평가 원본·승인 기록이 다음 달 1장 교육자료, 각 언어 번역, 실제 교육 전달·이해, 작업구간 재점검으로 이어지는 과정에서 '자료 존재'를 '교육 완료'로 착각하지 않도록 한다. 근로자 개인 점수·이름·원문 개인 응답을 교육 상태 카드에 표시하지 않는다.
- **`utils/educationReturnEvidenceOverview.ts`:** 새 서버 없이 기존 `EducationReturnSummary`+ `PracticeVerificationSummary` 값으로 6단계 **읽기 전용** 모델 도출. ① 원본 관리자 대조(승인/확인 필요) ② 월간 A4 교육자료 작성 경로(발행 미확인) ③ 근로자 기록 언어 수 ≠ 번역본 수 및 외국어 의미·출력 별도 검수 ④ 교육 전달 **이벤트 횟수** ≠ 전체 근로자 이수/수신 ⑤ 이해 확인/설명 보완 ≠ 행동 관찰 ⑥ 재점검·상충 이력 ≠ 위험 제거/작업재개 승인. 반복 위험 키워드가 여러 운영 구간에 등장한 수는 실제 사고 감소 효과가 아님. 반환 `guarantee:'not-approved'`.
- **`components/education/EducationReturnEvidencePanel.tsx`:** PC 3열/태블릿 2열/모바일 1열의 6단계 관리자용 카드, 상태 텍스트와 다음 행동. 원본 확인은 기존 `ocr-analysis`, 언어별 검수는 기존 `a4-education-material`로 실제 `onNavigateToPage` 수행. 새로운 QR 링크, 교육 세션·외부 전달/유료 번역 API/로컬 개인자료 저장 없음.
- **`pages/EducationReturn.tsx`:** 기존 페이지 구조와 3단계 히어로·실천 확인·3개 결과카드 보존, `EvidenceScopePanel` 뒤에 6단계 실제 근거 카드 삽입. 기존 기간·표본·서버 최신성 경계 정보 유지. 근로자 페이지에 개인 평가/점수를 추가하지 않음.
- **`tests/educationReturnEvidenceL10.test.ts`:** 6단계 순서, 원본 승인 vs 발행, 기록 언어 수 vs 번역본, 전달 30회여도 미확인 이해·실천, 상충·미해결·결측 시 위험 없음 자동판정 금지, 원본 불변·추가 API/기기 저장 없음 확인.
- **`scripts/verify-psi-platform-workspaces.mjs`:** 합성 Chromium 320/390/768/1440px 교육 환류에서 6단계·언어 검수 상태 검사, 390px 버튼 클릭→실제 A4 스튜디오 진입·가독성 스크린샷. 기존 월간 교육·보고서·Q&A 작업 경로 그대로 검증.
- **L10 QA 미완:** 최신 HEAD `npm run verify:ci`, 전사 Chromium, L09 수정 후 사진점검 모바일 전체를 실행/재확인하여 실패 수정. 실제 교육자료 한국어/중국어/베트남어/캄보디아어 등 자연어 의미·안전지시, A4 인쇄·폰트 깨짐, 다양한 Android 브라우저·개인별 수신/출석, 다음 달 실제 현장 위험 감소는 자동 테스트로 검증 불가. 기존 관리자 승인/개인정보·테넌트 격리 변경 없음.
- **출시 경계:** `main` 병합 및 Vercel Production 배포 최종 승인 전 보류. L06 근로자 직접 Q1~Q5 작성/제출 미구현, L08 실제 오프라인/외부 수신 QA 대기.

**다음 한 작업:** L10 CI·독립 Chromium 결과 확인/실패 수정 → L11 6대 지표·반복위험 차트가 실제 집계와 일치하고 개인 낙인/가짜 성과를 만들지 않는지 검증. L10 실제 원어민/인쇄물 최종 검수는 별도 운영 게이트.

### 구현 11차 — L11 지표/차트 '숫자 정합성'과 근로자 낙인 방지 (2026-11-22)

- **L10 QA 확정 기준:** 직전 L10 HEAD `72050695a9d7ba5978c56029377cdb17b9f8d31b`의 GitHub `PSI release verification` #44956439860 **SUCCESS**, `PSI company-wide cross-department verification` #44956439889 **SUCCESS**. `PSI inspector mobile browser QA` #44956439890은 확인 시점 **IN_PROGRESS**로 PASS 주장을 보류. 이후 최신 HEAD 검증은 별도 조회한다. GitHub `main` / Vercel Production READY SHA `8aa4dea89f789d569a715386e1646d848ceb17c1` 유지, Draft PR #237.
- **의미 경계(필수):** 현재 코드의 기존 6개 `scoreBreakdown` 평가점수 항목 `psychological`(응답 충실도), `jobUnderstanding`(업무 이해), `riskAssessmentUnderstanding`(위험성평가 이해), `proficiency`(숙련도), `improvementExecution`(개선이행), `repeatViolationPenalty`(반복위반 감점)와 PSI가 제안하는 안전인식 **6개 관점**(위험인지·교육이해·실천참여·보호구/수칙·소통/보고·작업중지 감수성)은 **다른 체계**다. 승인된 동일 지표 산식·원자료 증명 없이는 하나로 합치거나 점수를 대신 표기하지 않는다.
- **감사에서 확인된 실제 문제:** `MonthlyTrendChart.tsx`는 선택 기간 데이터가 없으면 '오늘 달의 0점'을 임의 생성. `FieldRadarChart.tsx`는 `safetyScore`가 유효한지 확인하지 않고 NaN/이상 점수를 평균·편차에 넣으며 빈 데이터도 0점 레이더로 표시. 팀 모드 레이블에 개인 팀장명을 포함. `MonthlyGuidanceReport.tsx` '보강 우선 TOP3'는 **감점 0점도 낮은 점수로 정렬**하는 오류가 있었고, 점수 변화 '개선 흐름'은 실제 사고·조치 개선으로 오해 가능. '반복 위험' 막대는 실제 위험 빈도가 아닌 **작성 답변의 언급 건수**.
- **`utils/livingChartEvidenceL11.ts`:** 기존 `buildMonthlyCoreMetricSeries`와 `hasValidSafetyScore`·`selectLatestCoreMetricRecords`만 사용하여 월별 유효점수 0은 유지하되 점수 없는 월은 `null`로 표현; 분모와 제외 수 별도 유지. 공종·팀 평균은 식별자별 최신 기록에 대해 유효 점수만 사용, 유효하지 않은 그룹 제외, 단 1개 유효응답의 점수 편차 참고값은 **null**로 처리. 예전 `100 - 표준편차×2.5` 보조값은 **비공식 참고치**로 명시. 팀장 실명은 분석 범위 그룹화에만 사용하고 차트 레이블은 `작업팀 N · 공종`으로 가명화.
- **`MonthlyTrendChart.tsx`:** 기존 임의 0점 한 달 생성 및 점수 누락 시 0점 툴팁 제거. 점수 없으면 텍스트 '유효 점수 자료 없음' 표시, 유효 0점은 그대로. 정상 Chart.js 경로는 보존.
- **`FieldRadarChart.tsx`:** 기존 Chart.js 레이더 유지하되 검증된 점수와 분모, 가명화 팀 라벨만 사용하고 빈 값은 레이더 0점 대신 상태 메시지로 표시. 점수 편차 참고치의 비공식성 안내. 개인별 안전 승인·공식 6지표로 주장하지 않는다.
- **`components/charts/SixMetricCoverageL11.tsx`:** 현재 선택 평가기간의 점수항목 **6개 전부**를 각각 `평균/만점, 유효/전체, 결측, 제외`로 표시. 실제 결측은 '산출 불가'로 표현하며 임의 0점 막대 생성 금지. `repeatViolationPenalty`는 0일수록 감점이 적다는 역방향 설명. 개인 이름·원본 응답을 카드에 표시하지 않음.
- **`pages/MonthlyGuidanceReport.tsx`:** 기존 보고서 생성·승인 게이트 보존, 전체 6항목 표본 근거판을 추가. TOP3 교육 보강 비교에서 감점 항목을 제외해 역순 착각 차단. 점수 변화는 '응답점수 상승/하락'으로 구분하고 '위험 언급 건수'를 실제 위험 빈도처럼 표현하지 않음. 공종·팀 비교 화면은 점수 편차 참고의 한계와 팀명 비실명 표시를 안내.
- **`tests/livingChartEvidenceL11.test.ts`:** 월별 데이터 없음/0점 유효 vs NaN 결측/최신 근로자 우선/비정상 점수 제외/점수 분모/팀장 실명 비노출/1건 편차 미산출/감점 반대 의미/소스 계약 회귀. **`scripts/verify-psi-platform-workspaces.mjs`**에 기존 390·1440px 합성 안내서 화면에서 6항목·감점 방향·자료 없는 레이더 처리 검사 추가.
- **검증 범위:** 최신 HEAD `npm run verify:ci`과 전사 Chromium·독립 사진점검 모바일 전체 QA가 완료되기 전까지 검증 완료·운영 적용 주장을 하지 않는다. 실제 근로자 기록/실기기 인쇄 결과와 사고 감소 효과·기획상 6대 안전인식 지표 승인 산식은 별도 점검이 필요하다. 실근로자 원본·PII를 CI에 넣지 않는다. `main` 병합 및 Vercel Production 배포 보류.
- **잔여 기획 QA:** 현장 응답의 공종별 분모 편차, 진짜 추세 vs 표본 구성 변화(기간별 모집단·작업 노출 분모), 점수 세부 6개와 제안 안전관점의 산식 일치성은 별도 검증 과제.

**다음 한 작업:** L11 검증 완료까지 최신 CI 결과 확인과 실패 수정 → L12 보고서·외부 공유·다운로드 처리의 작성/요청/수신/검수 경계 UI 구현. L06 근로자 직접 입력, L08 실기기 카메라·오프라인, L10 모국어 의미·A4 실물 인쇄 검수는 별도 잔여 품질 게이트.

### 구현 12차 — L12 PDF·ZIP 작성/기기 저장 요청/공유앱 인계/상대 수신·증빙/승인 구분 (2026-11-22)

- **L11 기준 게이트:** `3f0454d86618757814a00512df432210b7a46f52`의 `PSI release verification` #44957612686, `PSI company-wide cross-department verification` #44957612645, `PSI inspector mobile browser QA` #44957612687은 **모두 SUCCESS**. 현장 Android 실기기·근로자 실제 원본·외국어 A4 인쇄/안전지시 의미 검증은 아니다. GitHub `main`/Vercel Production READY `8aa4dea89f789d569a715386e1646d848ceb17c1` 유지; Draft PR #237, 메인 병합 없음.
- **기존 기능 감사:** `pages/Reports.tsx`는 개인/팀 PDF·ZIP 생성, 기기 다운로드 요청, 별도 증빙 패키지 기준파일·JSON 해시 검증을 갖고 있다. `reportGenerationUi.status === 'success'`는 실제 파일 생성·브라우저 다운로드 **요청 코드** 실행 후 저장되며 사용자의 OS 다운로드 폴더까지 확인한 증빙은 아니다. 이력 `verificationResult`는 관리자가 **별도로 업로드한 증빙 패키지**의 정합성 검사 결과이며 지금 생성한 PDF·메신저 수신 확인·현장 안전승인과 동일하지 않다. `components/inspector/InspectorShareButton.tsx`는 네이티브 공유 앱 결과(`handed-off/cancelled/unsupported/files-unsupported/failed`)와 문구 복사·사진 다운로드를 이미 지원하고 실제 발송 여부 별도 확인 경고를 갖고 있었다.
- **L12 취지:** 관리자가 '생성 완료'를 '저장·발송·읽음·현장 조치 승인'으로 혼동하지 않도록 실사용 경로 위에 단계별 **확인 가능한 사실과 빈 증빙**을 분리한다. 실제 이메일/Kakao 송신 또는 자동 수신·승인 서버 기능을 만들지 않는다.
- **`utils/reportDeliveryEvidenceL12.ts`:** 읽기 전용 두 모델. 보고서 생성 상태/진행률/증빙 검증 상태만 입력받아 `① 생성 처리·저장 요청 ② 기기 저장 파일 존재 확인 ③ 외부 전달 ④ 상대 수신·열람 ⑤ 별도 업로드 증빙 묶음 해시 검증 ⑥ 관리자 발행·승인` 상태로 나눈다. 확인하지 못한 단계는 상태 `unconfirmed`으로 남기고 `safetyClearance:false`, `distributionConfirmed:false`를 보존. 공유 결과는 '공유앱 인계 요청'만 표시하고 수신·읽음은 언제나 별개. 복사만 성공해도 발송/수신 기록으로 승격하지 않는다.
- **`components/report/ReportDeliveryEvidencePanel.tsx`:** 보고서 센터 1열/2열/3열 반응형 6단계 증빙 상태판. 모바일 44px 내비게이션으로 기존 `#psi-report-package-verification` 검증 영역으로 이동(개발자 검증 모드에서만 버튼 표시). 상태 이름을 결과/승인 성급 확정 없이 명시. 실제 관리자 검증 절차·권한 변경 없음.
- **`pages/Reports.tsx`:** 기존 PDF·ZIP·CSV 생성·다운로드·증빙 ZIP·무결성 검증 함수는 유지. 일괄 출력 성공에서 `phaseLabel='브라우저 저장 요청됨 · 실제 파일 미확인'`으로 정확히 표현, 경고 팝업은 OS 다운로드 목록에서 실제 파일 확인을 지시. 기존 생성 진행 해석도 '파일 생성·브라우저 저장 요청 실행'으로 수정. 기존 권한으로 보이던 증빙 검증 영역에 정확한 이동 앵커만 추가. 새로운 서버 API, 사진 원본 전송, 별도 개인 데이터 저장 없음.
- **`InspectorShareButton.tsx`:** 기존 OS 공유 대화상자와 사진/문구 선택·복사 기능 보존. 결과 상태 `shareOutcome`, `copied`를 실제 반환값에서만 갱신해 '공유앱 인계 요청/취소·실패/문구만 복사/미실행'을 분리. 문구·첨부 선택이 바뀌면 과거 상태 즉시 초기화. 상태판은 수신·열람 확인을 자동으로 생성하지 않고 공유앱에서 직접 확인하도록 안내한다.
- **`tests/reportDeliveryEvidenceL12.test.ts`:** 빈 상태·성공 생성/파일 미보존·진행/오류·증빙 해시 검증 성공·실패와 다른 파일의 수신 분리·공유앱 요청/실패/복사·SSR 보고서 6단계/공유창 확인 안내 및 추가 API/저장 없음 검증.
- **`scripts/verify-psi-platform-workspaces.mjs`:** 기존 합성 Chromium 320/390/768/1440px 보고서 진입 시 6개 단계와 '기기 다운로드 미확인'·'상대 수신 근거 없음' 검증, 390px 상태판 스크린샷 저장. 기존 실제 A4 다운로드·오프라인 사진 점검·외부 공유 시나리오 지속 실행.
- **검증/출시 게이트:** L12 최신 HEAD의 릴리스 `npm run verify:ci`, 전사 Chromium, 사진점검 모바일 QA의 최종 결과는 확인 후 상태 갱신할 것. 브라우저에서 생성된 파일의 실제 OS 영구 보존·상대방 전송·회신·전자서명·법령 적용·현장 조치 완료는 별도 사람의 검증 근거가 필요하다. **`main` 병합·Vercel Production 배포는 사용자 승인 전 보류.**

**다음 한 작업:** L12 전체 검증 실패·모바일 390px 반응형을 확인해 수정 → L13 제품 소개/온보딩에서 L01~L12의 실제 기능만 설명하고 미확인 성능·허위 자동화 주장을 차단. L06 근로자 직접 작성, L08 실제 기기 카메라/오프라인 및 L10 원어민 의미/인쇄 검수는 별도 잔여 게이트.

### 구현 13차 — L13 첫 사용 실메뉴 연결 + 소개 문구 근거 범위 교정 (2026-11-22)

- **L12 세 가지 QA 최종 확인:** 직전 `f165da1dae6f4b81f7b3d67977df00b9e060b4d4`의 `PSI release verification` #44958958739, `PSI company-wide cross-department verification` #44958958806, `PSI inspector mobile browser QA` #44958958770 **모두 SUCCESS**. 합성 Chromium·테스트 결과이며 실제 Samsung/Android·문구 발송·원어민 의미 검수·현장조치 안전성 승인은 별도. `main`/Vercel Production `8aa4dea89f789d569a715386e1646d848ceb17c1`, Draft PR #237 유지.
- **기존 UI 감사:** `pages/Introduction.tsx`에 브랜드·시연·12개 메뉴 연결과 4단계 `onePointProof`가 이미 있었다. 새로운 온보딩을 기존 시연·권한 위에 덮지 않고 **첫 화면 내부 보조 안내**로 붙였다. 일부 소개 문구는 기존 6개 점수 항목을 기획상의 6대 안전인식 관점과 동일한 확정 지표처럼 표현하거나, '공식 리포트'와 다음 교육 환류가 모두 완료된 듯 설명했다. `previewMetrics.highRiskWorkers`는 점수 결측 `Number(undefined||0)`을 위험 저점수로 세는 오류가 있었다. 2분 시연 지표는 실측 성능으로 오인할 수 있었다.
- **`utils/introTrustFlowL13.ts`:** 읽기 전용 첫 사용 5단계: ① 수기 기록 Q1~Q5 원본 확인(실제 `ocr-analysis`) ② 관리자 검토(같은 기존 검토) ③ 교육 환류(`education-return`) ④ 미완료 조치·재확인(`monthly-guidance-report`) ⑤ 보고서 작성·저장요청·수신 구분(`reports`). 각 카드에 실제 지원 범위와 '자동 승인/교육 배포·수신 확인 아님' 문장을 함께 지정. Q1~Q5 **근로자 직접 온라인 제출**은 별도 미완료, 다국어 의미/교육 이수/실제 위험 감소 효과는 사용 가능한 UI만으로 확인하지 않음.
- **`components/introduction/FirstUseTrustGuideL13.tsx`:** PC/모바일 반응형 한 개의 집중형 안내 패널, 5개 접근 가능한 44px 탭 버튼 및 1개 상세 영역/실제 페이지 이동 버튼. 상태값은 **현재 선택 단계**일 뿐 '단계 완료율'이 아니고, 새 API·로컬 개인정보 저장·자동 메시지 전송 없음. 저동작·키보드·다크 모드 기본 스타일 사용.
- **`pages/Introduction.tsx`:** 기존 브랜드 시각·상세 시연·현장 메뉴·4단계 원포인트 데모/운영 승인 유지, 상단에 첫 사용 실메뉴 안내 연결. 핵심 타이틀/칩을 'Q1~Q5 + 관리자 원본 대조 + 별도 교육/조치 확인'으로 교정하고 6대 지표·리포트/교육 자동 완료 표현을 축소. 기존 시연 '2분' 수치 대신 '직접 확인' 설명. 관리자 소개 미리보기의 결측 점수를 안전점수 0으로 오인해 고위험 대상에 더하는 로직을 기존 `hasValidSafetyScore`로 제한. 실제 0점 기록은 유효 값으로 유지.
- **`tests/introTrustFlowL13.test.tsx`:** 5개 실메뉴 경로, 역할/승인·전달 경계, 기획 6대 관점 vs 기존 6개 점수, SSR의 5탭/44px/하나의 CTA·근거, 새로운 외부 API·저장 없음과 결측 점수 회귀.
- **`scripts/verify-psi-platform-workspaces.mjs`:** 기존 합성 Chromium 320/390/768/1440px에서 실제 `운영자 메뉴 → PSI 브랜드 스토리` 진입, 5단계 탭·선택 시 주의 문구, 390px 교육 환류 페이지 이동과 스크린샷, 기존 L10~L12 교육·보고·A4 회귀 유지.
- **L13 최초 QA:** `33a09368d19e66a568b3c6ba032e9ce845d440ba`의 `PSI release verification` #44959977741 **SUCCESS**. `PSI inspector mobile browser QA` #44959977745 **FAIL** — 새 L13 소개 코드가 아닌 기존 `scripts/verify-inspector-unfinished-recovery.mjs:482`의 F08-55 합성 사진 임시저장 후 입력란 자동 초점(30초) 대기 초과. 기존 `InspectorLocalDraft.tsx`에서 사진 해시·IndexedDB 재조회 완료 즉시 `requestAnimationFrame`으로 `noteEntryRef.focus()`를 호출해 `busy`/disabled React 상태 해제보다 먼저 실행할 수 있음을 확인.
- **실제 회귀 수정:** `components/inspector/InspectorLocalDraft.tsx`에서 단건 사진이 해시 검증+IndexedDB readback 성공한 후 `focusSingleAfterCommitRef` 표시, `singleDraftState==='ready' && !busy && inputDraftState==='ready'`가 React UI에 반영된 effect 단계에서만 빈 관찰 입력에 초점 이동. 원문 내용 비어 있지 않으면 자동 초점이 기록을 덮거나 간섭하지 않음. 사진 저장, 충돌 감지·사진 해시·완료 승인·전송 규칙 불변. 두 장 연속 촬영의 기존 초점 흐름은 그대로 보존.
- **검증 상태:** 위 수정이 포함된 최신 HEAD의 릴리스·전사 Chromium·독립 사진점검 모바일 QA를 다시 확인하기 전 전체 PASS로 승격 금지.  직원 직접 수기 기록의 실제 OCR 해석·원어민/폰트·현장 교육 전달, Android 실기기·데이터 동기화·조치 실효성은 별도 QA 필수.
- **운영 경계:** 본 PR은 개발 검수 후보이고 `main` 및 Vercel Production 병합·배포는 사용자 최종 승인 전 보류.

**다음 한 작업:** L13 전체 QA 확인·오류 보수 후 L14 PWA/설치형 모바일 앱 결정을 실제 기능·네트워크 음영·브라우저 저장소·비용·Android 실기기 결과에 근거해 단계별 검토. 브라우저 실기기 직접 검수와 L06 근로자 직접 Q1~Q5 입력, L10 모국어 안전지시 의미 검수는 유지 과제.

### 구현 14차 — L14 현장 기기 점검 PWA 설치형 1차 파일럿 (2026-11-22)

- **L13 선행 CI 근거:** HEAD `303f1dfa3f1ea110fdbfce39d1f143993baf649e`의 GitHub 릴리스 #44960341913, 전사 Chromium #44960341939, Inspector 모바일 브라우저 #44960341843 모두 **SUCCESS**. 이는 합성 브라우저 검증이고 실제 Android 기기 PASS가 아니다.
- **대상 격리:** 현행 `/field-local/`만 설치형 파일럿으로 분리. 전체 PSI·`/camera`·`/inspector`·근로자 입력/클라우드 기록은 PWA 및 오프라인 지원 확정 대상이 아니다.
- **소스:** `field-local/index.html`, `field-local/main.tsx`, `vite.config.ts`와 `public/field-local-l14.webmanifest`, `public/field-local-icon-l14-{192,512}.png`, `tests/fieldLocalPwaL14.test.ts`. 설치 브라우저 이벤트는 클릭 때만 실행하며 설치와 오프라인 준비/브라우저 보관/클라우드 수신을 분리한다.
- **현행 유지:** 기존 기기점검 서비스워커의 `scope:'/field-local/'`, 오프라인 준비 수동 실행과 캐시 검증, 사진 원본 IndexedDB 저장·해시 검수·백업 경계 보존. 매니페스트/아이콘을 추가 캐시 검증 대상에만 포함. 외부 API/새 패키지/DB/권한/실제 발송 변경 없음.
- **제품 결정서:** `docs/PSI_L14_PWA_DECISION_AND_FIELD_TEST_20261122.md`. 반응형 브라우저→기기점검 PWA 파일럿→필요 시 Capacitor→최후 네이티브 재구현의 의사결정 순서와 Android/iOS 실기기, 기록보존·복원, 비용·보안 게이트 정리.
- **검증 범위:** 브랜치 소스 작성 후 최신 HEAD의 GitHub CI·합성 Chromium·Android 실기기 검증 결과를 별도로 조회. 설치 이벤트·오프라인·자동 서버 동기화가 실제 동작한다고 배포 확정하지 않는다.
- **릴리스:** Draft PR #237 유지. 최종 승인 전 main 병합/Production 배포 보류.

**다음 한 작업:** L14 최신 HEAD CI·빌드 산출물 manifest/SW 확인 → Android 설치·비행기모드·IndexedDB 사진 복구 실기기 검수 → 병행 가능한 L15 320~1440px·200% 확대·다크·저동작·키보드 QA. L06 직접 Q1~Q5 입력, L10 원어민 의미/A4 검수는 계속 미완료.

### 구현 15차 — L15 관리자 메뉴·검색·동적 viewport 접근성 보강 (2026-11-22)

- **선행 L14 최신 확인:** `99368d263d262cc8c75624d3ef68a1e247518b0e`의 `PSI release verification` #44968106397, `PSI company-wide cross-department verification` #44968106393 **SUCCESS**. `PSI inspector mobile browser QA` #44968106408은 이 작업 시작 시 **IN_PROGRESS**, 마지막 결과를 다시 조회해야 한다. 이전 실패는 테스트 소스 TypeScript 단언문 오류이고 `99368d2`에서 수정했다.
- **실제 진단:** 모바일 메뉴 포커스 필터가 CSS로 숨겨진 버튼을 포함할 수 있었고, 외부 초점 복귀/이전 body overflow 복구/예약 애니메이션 취소가 부정확했다. QuickFind 입력의 명시 레이블·44px 닫기 버튼·짧은 화면 최대 높이·키보드 선택 자동 스크롤·배경 스크롤 잠금이 미흡했다.
- **소스 보강:** `components/Layout.tsx`, `components/shell/NavigationQuickFind.tsx`, `styles/psi-living-motion.css`. 역할/숨김/권한·검색 대상·원본·외부 API·DB는 불변. 관리자 AppShell만 `100dvh` 사용 가능 시 적용; 인쇄 자동 높이.
- **검증 추가:** `tests/psiL15AccessGuard.test.ts`, `scripts/verify-psi-l15-accessibility.mjs`, `.github/workflows/psi-company-wide.yml`. 합성 Chromium 320/360/390 저높이/390 다크/640 DPR2(확대 대리)/768/1280 다크/1440의 검색·모바일 메뉴 포커스/스크롤·가로 넘침 회귀를 별도 QA.
- **검증 제한:** `640 CSS px + DPR2`는 **실제 200% 브라우저 줌이 아니다**. 한국어 이외 모든 언어의 길이·폰트·모국어 자연스러움, Android/iOS 기기·스크린리더·일반사용성, L14 실제 설치/사진 복원은 별도 증빙 필요.
- **L15 검수표:** `docs/PSI_L15_ACCESSIBILITY_FIELD_QA_20261122.md`. CI 결과는 새 HEAD에서만 판정. 사용자 최종 승인 전 Draft PR #237, main/Production 미반영.

**다음 한 작업:** 최신 L15 HEAD 릴리스/전사 Chromium/Inspector CI 결과 확인해 실패 보수 → 실제 200% 확대·Android/스크린리더·다국어 검수 → L16 저속망·오프라인·성능/배터리, 외부 API 증가 감사. 기존 L06·L08·L10 미완료 항목 유지.

### 구현 16차 — L16 음영/저속망·기기 저장 독립성·성능 측정 근거 (2026-11-22)

- **L15 선행 검증:** HEAD `28142524623f81d77fd4a99e784f9df3b4f1f09a`의 `PSI release verification` #44968888709 **SUCCESS**, `PSI company-wide cross-department verification` #44968888758 **SUCCESS**. `PSI inspector mobile browser QA` #44968888757은 최신 상태 재확인 필요. 실제 200% 확대·원어민·Android QA는 대체되지 않는다.
- **현장 핵심 문제:** 기기 점검 화면의 오프라인 준비·저장소 정보는 있었지만, 브라우저 연결 신호와 실제 서버 접속 성공을 구분한 안내가 부족했다. 느린 통신 중 로컬 기기 저장을 서버 수신과 혼동하거나, 온라인 복구 후 자동 발송된다고 오인할 위험이 있었다.
- **실제 UI 코드:** `field-local/main.tsx`에 `navigator.onLine`/브라우저 `online/offline` 이벤트를 읽는 **표시 전용** 현장 통신 상태 패널을 추가. 이는 접속 성공/속도/배터리 측정이 아닌 브라우저의 추정 신호이며, 기존 IndexedDB 사진·메모의 직접 저장/재조회 및 수동 SW 준비 로직은 변경하지 않는다. 재연결 후 자동 업로드·AI 호출 없음.
- **검증 코드:** `tests/psiL16ResilienceContract.test.ts`, `scripts/verify-psi-l16-resilience.mjs`, `.github/workflows/psi-company-wide.yml`: 합성 Chromium에서 요청 지연 150ms 주입, 로컬 PWA 캐시 준비, 강제 오프라인 재시작, 오프라인 사진/메모 기기 저장·재실행 후 조회, 재연결 후 1건 유지, 외부 도메인/API 자동 호출 0 확인. 성능 시간은 CI 참고치이고 현장 3G/배터리 보증이 아니다.
- **실사용·비용:** `docs/PSI_L16_NETWORK_BATTERY_FIELD_QA_20261122.md`에 현장 저속망·배터리·저장소·통신 재연결 QA, 기록 보존/개인정보·정확한 범위를 정리. 네이티브 패키지·유료 API·텔레메트리 수집/전송·백그라운드 동기화·새 DB 불변.
- **검증 게이트:** L16 최신 HEAD 자동 CI와 독립 Chromium 결과/오류는 실제 다시 조회 후 기록. 최신 QA PASS 전까지 L16을 전면 VERIFIED/실기기 통과로 주장 금지. PR #237 Draft, main/Production 최종 승인 전 보류.

**다음 한 작업:** L16 신규 Chromium 합성 테스트 및 `npm run verify:ci` 결과 확인·실패 보수 → Android 현장 음영·저속망/배터리 실제 계측 및 백업/복구 → L17 접근권한·원본 무결성·OSS 라이선스/최소 수집 보안 감사. L06 Q1~Q5 직접 입력, L08 Android 저장, L10 모국어·A4, L15 실확대 검수 유지.

### 구현 17차 — L17 정적 보안·OSS 허가 경계 점검 (2026-11-22)

- **전제 확인:** `AGENTS.md` 및 `.agents/skills/psi-ai-company/SKILL.md`, `docs/psi-ai-company/OSS_SOURCE_REVIEW_20261026.md`, `config/psi-oss-candidate-manifest.json` 원문 검토. 다른 제품과 코드·데이터 혼합 없음.
- **선행 L16:** HEAD `82d1a1dbc9313fb27c90f4766411eeebce6aee56`에서 릴리스 #44969367072 **SUCCESS**. 전사 Chromium #44969367040/Inspector 모바일 #44969367047의 결과는 별도 최종 재조회. PR push로 구버전 작업이 취소되면 이전 SHA 통과라고 오인하지 않음.
- **구체 변경:** `vercel.json`의 기기 점검 3경로 `X-Robots-Tag: noindex,nofollow,noarchive`, `Referrer-Policy:no-referrer`; `scripts/verify-psi-l17-security.mjs` 및 `tests/psiL17SecurityGuard.test.ts`, `.github/workflows/verify.yml` 릴리스 보안 정적 게이트. 원본/권한·DB·유료 API·새 OSS 런타임·실제 전송 변경 없음.
- **검토 발견:** `api/inspection-share.ts` 소스에 토큰 해시·만료 RPC·레이트 제한·개인 응답 캐시 금지 확인. 하지만 전역 CSP의 `connect-src 'self' https: wss:`·`unsafe-inline` 범위가 넓으므로 사용처·호환성 분석 후 별도 축소 필요. 실제 RLS/테넌트 접근 격리·배포 HTTP 응답, 법률 라이선스 승인을 자동 정적 검사로 보증하지 않음.
- **L17 검토표:** `docs/PSI_L17_SECURITY_OSS_GATE_20261122.md`. QA 실패 시 최신 HEAD 로그에 따른 보수, 완료 전 릴리스 승격 금지. Draft PR #237, main/Production 승인 전 보류.

**다음 한 작업:** 최신 L17 릴리스/전사 Chromium/Inspector CI 및 보안 산출물 확인·오류 수정 → 실제 Vercel HTTP 헤더·관리자/RLS/원본/OSS 라이선스 검토 → L18 통합·실기기·사용자 최종 승인 게이트. L06·L08·L10·L15·L16 미완료 조건 불변.

### 구현 18차 — L18 독립 통합 검수·출시 차단 게이트 (2026-11-22)

- **선행 L17 최신 동일 HEAD 결과:** `639b8612a9ae65ac610b11bf21bb2287b5475e94`에서 릴리스 #44969831755, 전사 Chromium #44969831759, Inspector 모바일 합성 QA #44969831721 **3종 모두 SUCCESS**. L17 source-only 보안 검증 19/19 성공. 이는 이번 새 L18 커밋까지 검증한 증거가 아니므로 **최신 HEAD에서 다시 확인**.
- **실 DB 독립 보안조사:** Supabase `PSI-Database`를 식별해 Security Advisors·RLS·GRANT·SECURITY DEFINER 함수 소스에 대한 읽기 전용 메타데이터 조사. RLS 없는 public 테이블 경고는 없으며, Advisor INFO 20(RLS on/policies 없음), WARN 5(authenticated 호출 가능한 SECURITY DEFINER), WARN 1(public.vector). 정책 없는 주요 테이블 익명·인증 직접 SELECT 권한 없음 확인. 관리자 함수 4개는 내부 멤버십 검사 호출, 근로자 교육 조회는 계정/만료/발행 관리자 멤버십을 검사. **실제 교차 테넌트 계정 QA 없이 무결성/권한/서비스 안전 승인 금지.** PR #237 별도 보안 코멘트 기록.
- **정식 출시는 여전히 차단:** `config/psi-living-ui-release-acceptance.json`의 13개 미완료 항목 중 **출시 전 12개 + 배포 후 사후 검증 1개**는 전부 pending. 배포 후 검증은 출시 전 승인을 영구 차단하는 순환 의존성으로 사용하지 않는다. 기술 CI 통과를 실기기·원어민·권한·서버 수신·안전작업 재개 승인의 증거로 사용 금지.
- **검증 신설:** `scripts/verify-psi-l18-release-gate.mjs`에서 CI 보존 및 입력 증거의 누락·변조를 엄격 검사하고, 독립 Chromium 전체 계획 수=완료/성공 수(현재 11개)/교육·OCR·A4/L15 8개 조건/L16 사진 오프라인 저장 및 자동 API 0/L17 source-only 19개 검사 결과의 JSON을 연결. `--source-only`은 릴리스 CI, `--browser-evidence`는 전사 Chromium CI 후속. `tests/psiL18ReleaseGate.test.ts` 및 CI 증빙 업로드 보강. 외부 API/DB/배포/신규 OSS 없음.
- **기계 판정의 의도:** 자동 검사 통과 시에도 출시 전 12개 미완료로 `releaseDecision:'BLOCKED'`, `releaseAuthorizedByThisJob:false`, `mainMerged:null`, `productionReleased:null`(확인 미실시). 배포 후 확인은 `postDeployPending`에 분리. 자동 결과가 승인/서명을 위조하지 않는다. L18은 **IMPLEMENTED(사전 검수) / NOT RELEASED**.
- **실제 오류 보수:** HEAD `a7a0d18`의 릴리스 #44970923837 **SUCCESS** / 전사 Chromium #44970923820은 **L18 집계 단계만 FAIL**, 기존 합성 제품 업무 11/11과 워크스페이스 24건, L15 8건, L16 기록 복원/오프라인/자동 API 0, L17 19/19는 PASS. 원인은 L18 신규 집계 코드의 `plannedScenarios===7` 오래된 하드코딩. 최신 11개 계획·완료·성공 수의 동치 비교로 수정하고 테스트 추가. 이 수정 최신 HEAD의 CI를 다시 확인하기 전 전체 PASS 주장 금지.
- **확인 문서:** `docs/PSI_L18_RELEASE_READINESS_20261122.md`. `main` 및 Production은 사용자 승인 전 변경하지 않는다.

**다음 한 작업:** 최신 L18 HEAD 릴리스/전사 Chromium/Inspector QA 확인 후 오류 수정 → L06 현장 근로자 Q1~Q5 직접 제출 설계/구현 (수기 OCR 원본·관리자 승인 유지), Android·모국어 A4·교차테넌트/상용 호스팅 실증을 병행. 사용자 최종 승인 없는 main 병합·배포 금지.

### 최초 2025년 수기·다국어 위험성평가 기록지 OCR 호환 (2026-11-22)
- 제공 스캔 PDF 3쪽은 텍스트 레이어 없음, 한 페이지=한 건. 현행 OCR 업로드 제한 PDF 1페이지/2.85MiB 때문에 페이지별 분리 필요. PPTX 6장(한국어/중국어2/러시아어/미얀마어/베트남어)은 OCR 직접 입력 불가.
- 기존 OCR 엔진/Q1~Q5·관리자 검토 소스는 남아 있으나 2025년 전용 좌표 판독 모듈 존재는 확인되지 않음. 최신 양식의 하단 인적사항 고정 프롬프트와 한국어·PSI 제목 문서 게이트는 구형·다국어 판별 실패 가능성이 있어 보강.
- 양식별 상단·하단 인적사항, 구형 5문항, 다국어 제목 및 명시적 공종 레이블 보강. 일반 5문항 설문 차단·이름/공종/서명 추측 금지 유지.
- 사용자 개인정보/필기 원본 GitHub 미업로드. 실 OCR 호출·원어민/2026년 양식 비교/모바일 시험 미검증. 참고 docs/PSI_OCR_LEGACY_SELFREGULATION_COMPAT_20261122.md.
- 다음 한 작업: 최신 HEAD verify:ci/Chromium/Inspector QA → 승인된 환경 실제 수기 OCR/외국어 6양식 실검증 → L06 근로자 직접 입력 병행. main/Production 보류.

### 구형 수기 OCR 문항 인식 일관성 보강 (2026-11-22)

- 2025년 최초 양식 Q3에 '상/중/하' 한 글자만 적힌 사례를 확인. 직전 `utils/ocrRoutingQuality.ts`에서는 인정했으나 서버 `api/gateway.ts`, 기존 Gemini `services/geminiService.ts`와 관리자 `pages/OcrAnalysis.tsx`의 두 문항 커버리지 판별은 여전히 두 글자 이상을 요구해 **동일 근거가 화면·엔진별로 서로 다르게 판정**될 수 있었음.
- `utils/ocrQuestionCoverage.ts`를 단일 판독 헬퍼로 추가하고 4개 경로 모두 동일한 출력 사용. Q1·Q2·Q4·Q5는 원문 `answerText` 2글자 이상, Q3는 상/중/하·高/中/低 1글자를 정상 인정. **번역만 있고 원문이 비면 작성 완료로 보지 않음**. 중복 문항·Q6 등의 잘못된 번호를 5개 문항으로 대체/채우지 않음. 원래 문항 순서/원본 이미지를 자동 수정하지 않음.
- `tests/ocrLegacySelfRegulationForm.test.ts`에 중복 문항, 번역만 존재, 잘못된 번호, 단일문자 위험등급, 공통 헬퍼 연결 회귀 추가. 개인정보 사진·서명/실제 OCR API·DB·유료 호출 변경 없음.
- **검증:** 이번 커밋과 동일 SHA의 `verify:ci`/전사 Chromium/Inspector QA를 재조회해야 함. 실제 수기 OCR 정확도·원어민 문구·모바일 실기기 인수는 계속 미완료. L18 Release=BLOCKED, main/Production 변경 금지.

**다음 한 작업:** 이번 최신 SHA CI 3종 실패를 보수하고, 구형 원본 3장(각 1페이지) 수기 OCR 필기·인적사항의 직접 대조와 2026 최신 양식 회귀를 승인된 환경에서 수행한다. 사용자 실제 기록·사진의 외부 API/유료 송신 동의·RLS/권한/원어민 검수는 별도.

### 2025년 다쪽 PDF 기록표 브라우저 분리 후속 (2026-11-22)

- 기존 첨부 3페이지 PDF는 서버 한 문서=한 페이지 OCR 제한으로 직접 처리 불가했고, FileUpload은 다쪽 PDF를 실제와 달리 '분석 가능'으로 표시했다.
- 사용자 명시 선택으로만 기기에서 1페이지별 JPEG를 만드는 `utils/ocrLocalPdfSplit.ts` 및 `components/FileUpload.tsx` 버튼 추가. 12쪽/20MB 입력·2.85MiB 이미지 제한, 한 쪽이라도 실패하면 선택 목록 불변. 서버/유료 OCR 자동 요청·DB·실제 원본 업로드 없음.
- `utils/ocrUploadQuality.ts`는 기존 PDF의 실제 페이지 수와 크기/열기 오류를 판정하며 잘못된 분석 가능 안내를 차단. 합성 단위/정적 계약 테스트 추가.
- 최신 CI 3종과 실제 2025 스캔 브라우저 분리·손글씨 OCR 정확도는 별도 확인. 관리자 원본 대조·원어민/A4·현장 Android 검수 미완료. main/Production 보류.
- 다음 한 작업: 최신 HEAD 릴리스/전사 Chromium/Inspector QA 및 분리 기능 오류 보수 → 승인된 기기에서 실제 3장 PDF 분리/판독 원본 비교 → L06 근로자 직접 입력 병행.

### 브라우저 PDF 실렌더 합성 QA 보강 (2026-11-22)

- `scripts/verify-psi-legacy-pdf-split.mjs`를 전사 Chromium CI에 추가. 개인정보 없는 RGB 3페이지 합성 PDF를 실제 PDF.js로 로컬 렌더링해 순서/이름/개수/JPEG 용량/서로 다른 픽셀색을 검사하고 JSON audit에 남긴다. **실제 2025년 필기 인식률, Android 실기기, 관리자 대조 검증이 아니다.**
- 새 커밋 CI 3종 및 분리 스크립트 실동작 결과는 반드시 재조회하고 오류가 있으면 수정. main/Production 보류.

### 구형 PDF 재분리 중복 및 잘못된 차단 문구 보정 (2026-11-22)

- **검증:** 이전 `f9fa4a2` 동일 HEAD에서 릴리스·전사 Chromium **SUCCESS**. 기존 Chromium 3쪽 색상 분리 검사도 PASS. Inspector 모바일 QA는 별도 완료 여부 확인.
- **추가 실제 오류 방지:** 변환 JPG의 `File.lastModified` 기본값이 변환 시각으로 매번 달라져 같은 PDF 재분리 시 기존 `getOcrFileKey` 중복 방어가 작동하지 않을 수 있음. 생성 이미지에 원본 PDF의 `lastModified`를 유지하고 실제 Chromium에서 3장 재분리 시 중복 3건/새 항목 0건을 검증.
- 파일 업로드 중 페이지 분리를 병행할 수 없도록 드래그 업로드까지 보호하고, 다쪽/과대 PDF는 '다시 촬영 필요'가 아닌 **'PDF 분리·확인 필요'**로 표시한다. 합성 QA는 외부 OCR·서버 호출 없음.
- main/Production 승인 없이 변경 금지, 실제 2025년 필기 3장 OCR 정확도 및 Android 사용성 미검증. 최신 HEAD의 CI 3종 재조회 후 상태 확정.

**다음 한 작업:** 최신 HEAD 릴리스·전사·모바일 CI 결과 확인 및 오류 수정 → 2025 원본 이미지별 손글씨 Q1~Q5와 인적사항의 관리자 대조·언어별 양식 실검수 → L06 직접 기록 병행.

### 구형 PDF 일반선택→분리 완료 시 원본 차단 해제 (2026-11-22)

- **현장 흐름 누락 수정:** 3페이지 원본 PDF가 기존 일반 업로드 목록에 먼저 들어 있으면 다쪽 문서 `blocked` 사전점검으로 분석 버튼이 비활성인데, '페이지별 나누기'가 JPG 3개를 추가하고 원본을 그대로 남겨 사용자 분석을 막는 문제가 있었음.
- `components/FileUpload.tsx`: 사용자가 같은 원본 PDF를 직접 다시 선택해 로컬 분리를 **모두 성공한 뒤에만** 기존 대기 목록의 그 PDF를 제거하고, 새 JPG 3개를 넣는다. 다른 파일/분리 실패 시 원본 목록 보존.
- `tests/ocrUploadQuality.test.ts`: 다른 업로드 보존·대상 원본 교체·반복 이미지 중복 차단 회귀. 실제 현장·Android 손글씨 OCR은 여전히 미검증.
- PR #237 Draft/출시 BLOCKED, 사용자 최종 승인 전 main 및 Vercel Production 변경 금지. 새 커밋에서 CI 3종 확인 필요.

**다음 한 작업:** PDF 로컬 분리 최신 커밋 릴리스/전사 Chromium/Inspector 성공 여부 확인·오류 수정 → 실제 2025년 각 장 Q1~Q5 손글씨 판독·관리자 대조 및 구형 다국어/최신양식 A4 비교 시험 → L06 직접 입력 연계.


### L06 후속 — 근로자 Q1~Q5 직접 작성 시범 1차 (2026-11-22)

- **범위 확인:** 기존 L06은 관리자 OCR 원본/번역 비교 내비게이터만 구현. 근로자 본인의 입력 UX는 미구현이었다. 이번에는 `/worker-risk-draft` 독립 경로의 **한국어·인증 없는 시범 폼**을 추가. 교육 이수·정식 위험성평가 제출·현장 관리자 승인을 대체하지 않는다.
- **실제 구현:** `pages/WorkerRiskDraft.tsx`는 기존 `PSI_FORM_QUESTIONS` 5문항을 재사용해 Q1 위험작업, Q2 위험원인, Q3 자가 상/중/하 및 이유, Q4 감소대책, Q5 실천행동을 직접 작성. 5문항 진행 표시·누락 문항 안내·입력 내용 검토/수정·초기화·브라우저 인쇄만 제공. `utils/workerRiskDraftL06.ts`의 공통 검사는 Q3 단일 등급 인정, 다른 문항 원문 최소 2문자 기준. **작성 완료 표시와 서버 수신/관리자 검수는 분리**한다.
- **개인정보/권한 경계:** 이름·생년월일·근로자 인증/국적/서명 입력 없음. 페이지 메모리 상태만 사용하며 새로고침 시 소실. fetch/IndexedDB/localStorage/sessionStorage 신규 사용 없음. 자동 서버 업로드·전송·저장·OCR/API 과금·DB/RLS 변경 없음. `vercel.json`에서 새 경로 noindex/no-referrer/no-store 헤더를 정의. 공개 입력 시험이 개인정보 동의/현장 계정 권한을 대체하지 못한다.
- **검수 코드:** `tests/psiWorkerRiskDraftL06.test.ts`(마스터 순서·등급·미제출/미승인·클라이언트 독립성), `scripts/verify-psi-l06-worker-draft.mjs`(390px 합성 Chromium: 누락 경고→5문항→검토→초기화, API/외부 호출 0, 브라우저 저장 없음). `.github/workflows/psi-company-wide.yml` 자동 게이트와 합성 JSON/화면 artifact 연결.
- **상태 구분:** **직접 작성·화면 검토 코드 IMPLEMENTED / 정식 현장 제출 NOT IMPLEMENTED / 출시 L18 BLOCKED**. 새로운 HEAD의 CI는 독립 최종 결과를 재조회해야 하며, 합성 QA가 Android 실기기·다국어·서버 수신의 증거는 아니다. PR #237 Draft, main/Production 변경 금지.
- **다음 한 작업:** 새 HEAD 3종 CI 완료/실패 로그 확인·수정 → 근로자 정식 로그인 또는 현장 토큰·개인정보 동의·다국어 원문 Q1~Q5·오프라인 보존/폐기 정책·관리자 승인 대기 원본·서버 수신 영수증/RLS 간 분리된 L06 제출 계약 설계와 실환경 권한 QA. 이후 실제 현장 승인 전까지 제출 API/QR 배포하지 않음.


### L06 후속 — 정식 제출 신뢰경계·서버 수신 전 계약 2차 (2026-11-22)

- **직전 기준 실조회:** 1차 직접 작성 HEAD `c86019d` 릴리스 `#44977391960` SUCCESS; 전사 Chromium `#44977391971`/Inspector 모바일 `#44977391895`는 새 커밋 진행 중 실행 취소. 1차 L06 실 Chromium 스텝은 통과했지만, **해당 커밋 전체 3종 QA PASS라는 의미 아님**. 현재 작업 HEAD로 CI 전부 새로 판정할 것.
- **2차 실제 구현:** `utils/workerRiskSubmissionContractL06.ts`는 Q1~Q5 원문만 담는 strict allowlist 스키마·기존 양식 버전·원문 언어코드·500자 상한·단일 Q3 등급 검증, 식별정보/번역/추가 Q6 거부, 8개 신뢰 서버 필수조건 **전부 false 기본값**, 자기기입 원문과 관리자 검토를 분리한 `received-pending-manager-review` 수신정보 범위 검사 추가.
- **화면 연결:** `pages/WorkerRiskDraft.tsx`의 화면 미제출 검토 진입 전 `prepareL06ClientSubmission(draft, 'ko')`를 사용하여 동일 원문 검증 규칙 적용. 함수는 전송/저장/인증하지 않음. 8개 서버 조건은 런타임에서 빈 객체도 FAIL 처리.
- **독립 단위 회귀:** `tests/psiWorkerRiskSubmissionContractL06.test.ts`에 비정상 Q3, Q6/번역만 존재, 임의 worker/site/tenant ID 주입, 과대 문항, 무허가/위조 접수, 다른 현장/근로자 ID·승인 상태 변조를 차단하는 합성 테스트 추가. 기존 L06 브라우저 CI는 변경 없음.
- **실무·안전 인계:** `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md`. 인증/개인정보 법적 처리근거·보유기한·데이터 정합·현장별 실제 RLS와 서버 영수증·관리자 수정/승인·다국어/Android는 **아직 미구현·미검증**. 실제 worker/session/DB/API/OSS 비용·Production 변경 없음. 기존 13개 human gate 변경 금지.
- **판정:** 소스 계약 구현, 실서비스 접수 NOT IMPLEMENTED, L18 출시 BLOCKED, Draft PR #237. 최신 HEAD의 릴리스/전사 Chromium/Inspector CI 완료/실패 로그 실조회 필수.

**다음 한 작업:** 최신 HEAD CI 3종 확인·실패 보수 → 승인된 테스트 계정으로 근로자 인증/현장 2개 RLS 권한 경계·처리근거/보존정책 실제 검증 → 별도 승인 후에만 서버 접수·수신증·관리자 보완/승인 연계 구현. main·운영 배포 보류.


### L06 후속 — 두 테넌트·현장·근로자 접근범위 사전검사 3차 (2026-11-22)

- **전 단계 검증 완료:** HEAD `e945610` 릴리스 #44977795570, 전사 Chromium #44977795620, Inspector 모바일 #44977795574 **동일 SHA 3종 SUCCESS** 재확인. 단 출시인수 13개 human gate는 여전히 모두 pending.
- **핵심 소스 구현:** `lib/server/workerRiskScopeL06.ts`는 신뢰된 서버 principal 기반으로 로그인 만료·테넌트·현장·주기 ID → 유효한 근로자 개인계정 유일 연결 → 활성 근로자 → **근로자별 해당 현장 배정** → 현장 활성 → 평가주기 open/시각을 순차 확인. 이중 계정·다른 테넌트/현장/근로자·만료/폐쇄 주기·DB 오류는 기본 거부. **정상 범위 확인 결과에도 `submissionAuthorized:false`로 서버 수신/승인 권한을 주지 않음.**
- **합성 보안 회귀:** `tests/psiWorkerRiskScopeL06.test.ts`에 개인정보 없는 가상 A/B 테넌트·근로자·현장/운영주기 교차 권한·양쪽 정상 허용 및 서로 간 거부/비활성·모호한 링크·스키마 누락/오류 사례. 현재는 의존성 주입형 소스·테스트로, 직접 실행하는 운영 서버 URL/DB 연결/신규 사용자 인증/SQL 변경 없음.
- **실 DB 읽기 전용 메타데이터 확인:** PSI-Database public 49개 테이블 중 `psi_tenant_worker_accounts`, `psi_tenant_workers`, `psi_tenant_memberships` 확인. 신규 제출에 필요한 개인별 현장 배정 및 주기·접수 테이블은 현재 확인되지 않음. `psi_read_worker_education` 등 보안정의 함수 실행권한 메타데이터 확인했으나 함수 내부·RLS 실증 미완료.
- **상세:** `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §6. 사업장별 RLS/근로자 실계정·처리근거·원문 증거/접수증 및 관리자 승인·Android/모국어 QA는 여전히 미구현/미검증. L18 출시=BLOCKED, PR #237 Draft, main/Production 보류.
- **CI:** 신규 최신 HEAD에서 릴리스/전사 Chromium/Inspector 3종 **실조회 전이면 PASS 미확정**. 완료 로그·커밋 SHA를 반드시 맞춰 재확인.

**다음 한 작업:** 최신 SHA 3종 CI·오류 해결 → 승인된 별도 테스트 테넌트 2개에서 실제 개인계정-현장/평가주기 RLS 실증 및 원자적 접수/감사/승인 데이터 모델을 개발·검수. 실제 운영 DB 쓰기/GRANT·RLS 변경, main 병합, Vercel Production 배포는 사용자 최종 승인 전 보류.


### L06 후속 — PostgreSQL 원문 접수·중복방지·감사 원장 격리 검증 4차 (2026-11-22)

- **직전 HEAD 재확인:** `91e4f0d` 릴리스 #44980846186 / 전사 Chromium #44980846199 / Inspector 모바일 #44980846187 **동일 SHA 3종 SUCCESS**. 이는 4차 신규 소스의 검증이 아니므로 새 SHA CI 별도 판정.
- **기존 설계 재사용:** `supabase/proposals/psi_tenant_site_memberships_staging.sql`, `psi_site_worker_read_policy_staging.sql`에서 현장·근로자 배정 기반을 발견. 운영 DB에 아직 배포되지 않았으므로 선행 마이그레이션으로 간주하지 않음.
- **이번 실소스:** `supabase/proposals/psi_worker_risk_submission_l06_staging.sql` (운영 migrations 아님)는 주기·5문항 원문 접수·서버 수신시각·immutable 수신 감사 원장. 세 테이블 ENABLE/FORCE RLS 및 직접 테이블 권한 부재, UUID 요청번호 유일성, 동일 요청·동일 내용에만 접수증 재사용, 변조된 재요청 거부, 감사 원장 실패 시 원자적 롤백을 제안. `psi_submit_worker_risk_l06` 보안정의 RPC는 **SQL 제안에서만 존재**하며 실제 운영 RPC는 배포되지 않음.
- **독립 실DB 엔진 시험:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`에서 @electric-sql/pglite로 가상 A/B 기업·근로자/개인 계정·현장·평가주기를 구성하여 교차 기업/현장·원문 위조·권한 만료/비활성·테이블 직접 접근·감사 실패·중복 요청을 PostgreSQL 엔진으로 검증한다. 첫 성공 CI가 나오기 전에는 PASS 미확정.
- **안전·보안:** L06 시범 웹 UI는 오프라인 메모리 5문항 검토만 가능, **실서버 정식 제출/관리자 승인 기능 없음**. SQL은 절대 운영 DB에 적용하지 않았고, 새 API/GRANT/키/테스트 계정이나 실개인정보 전송·Production 배포 없음. 실제 세션 철회, RLS/역할/교차기업 실인증, 원문·개인정보 법적처리근거/보유기간/삭제, 운영 주기, 관리자 보완·검토·승인, Android·모국어 11개 언어 인수 전부 미완료. L18 13 human gates pending.
- **상세 인계:** `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §7. PR #237 Draft, `main`·Vercel Production 최종 사용자 승인 전 보류.

**다음 한 작업:** 동일 최종 HEAD의 릴리스·전사 Chromium·Inspector CI 실패/오류 확인·수정 → 승인된 테스트 Supabase 2개 테넌트에서 실제 인증/RLS/원문 접수 경합 검증 → 관리자 보완/반려/승인 이력 및 정책·보존기간·현장 실기기 검수. 운영 DB·main·Production 미변경.


### L06 후속 — 관리자 기록 검토·보완요청·2인 승인 원장 5차 (2026-11-22)

- **4차 검증 재확인:** `9e0d10a` 릴리스 CI #44984047297 **SUCCESS**(PGlite 접수 SQL 9/9, 총 275 테스트 파일), 전사 Chromium #44984047259 **SUCCESS**; Inspector 모바일 #44984047268 **후속 커밋에 의해 CANCELLED**(실패 아님). 세 CI 통과라고 기록하지 않음.
- **이번 실제 구현:** `supabase/proposals/psi_worker_risk_manager_review_l06_staging.sql`에 기업·현장·제출별 불변 관리자 이력, `psi_review_worker_risk_l06` 승인/보완요청/검토 함수, `psi_read_worker_risk_review_l06` 기업·현장별 제한된 원문/관리이력 조회 함수. 기존 Q1~Q5 제출·접수·이력 테이블의 UPDATE/DELETE 방지 트리거. **운영 migrations에 미편입**, 실 DB와 정식 제출/관리 API 연결 없음.
- **업무 흐름:** `reviewed`(owner/admin/reviewer 가능) → **최초 검토자와 다른 현장 owner/admin**의 `approved`(오직 기록 검토 완료) 또는 `request_changes`. 보완요청 종료 후 원문 재작성은 새로운 제출/접수증으로 처리(링크 설계 미완). 근로자 자기 검토/승인, 현장 미배정자/타 기업/익명/권한 철회자, 검토 순서/중복 요청 위조, 확정 기록 변경을 거부. `approved`는 **위험 감소대책 실행 확인·작업허가·교육이수·작업중지 해제 아님**.
- **실 엔진 회귀:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`를 총 20건(원문 접수 9 + 관리자 이력 11)으로 확장해 독립 가상 A/B 테넌트·현장·근로자·관리자의 교차 권한과 보완/검토·승인/이력·개인정보 미노출을 시험. 5차 첫 SHA `12b2a65`: 18/20 PASS, 조회 함수에서 `pg_catalog.coalesce` 잘못 한정한 동일 오류 2건. `17dfbf9`에서 이를 수정함. **최종 SHA 릴리스/전사 Chromium/Inspector 3종 CI를 별도 조회해 결과를 확정**.
- **해소 안 된 운영 게이트:** 테스트 코드는 PGlite 합성 검증이며 실제 Supabase Auth/RLS, P05 테이블 이관·두 회사 교차 접근·동시 리뷰 부하·검토 재제출 링크·관리자 UX/인증/개인정보 보관·삭제·실 Android·외국어 11종 원어민 검수는 미완료. L18 13개 human gate 모두 pending, 출시 BLOCKED. PR #237 Draft / main 병합·Vercel Production·운영 DB SQL 실행 금지.
- **상세:** `docs/PSI_L06_WORKER_SUBMISSION_CONTRACT_20261122.md` §8. 보안 정의 함수는 호출자의 JWT `user_metadata`/현장 주장값으로 신원을 확정하지 않고 검증된 `auth.uid()` 및 DB 관리자·현장 관계를 대조. 운영 연결 전 별도 역할/EXECUTE·실세션 철회 보안감사 필수.

**다음 한 작업:** HEAD 3종 CI 및 실패 복구 → 승인받은 테스트 프로젝트의 실제 Auth/RLS/GRANT·2인 승인/동시 요청 안전성 검증 → Q1~Q5 보완 재제출의 immutable parent-link와 관리자 UX/감사 내역 → 실사용/개인정보·법률 인수 전 출시 차단 유지.

### L06 후속 — 5문항 모바일 단계형 작성 UX 6차 (2026-11-22)

- **착수 근거:** 직전 HEAD `598f14d`의 GitHub Actions 3종(릴리스 / 전사 Chromium / Inspector 모바일 브라우저) 모두 동일 SHA **SUCCESS** 조회. 인계서 기준 정식 제출 경로는 여전히 미연결이므로 관리자 2인 승인·DB/SQL 작업을 건드리지 않고, 기존 독립 `/worker-risk-draft` 화면의 사용성을 먼저 보강.
- **실제 UI 변경:** `pages/WorkerRiskDraft.tsx`의 Q1~Q5 5개 긴 세로 폼을 **한 화면 한 문항**의 단계형 흐름으로 전환. 상단 완료 문항 수/진행 막대, Q1~Q5 44px 이상 단계 선택, 도달하지 않은 문항 점프 제한, 현재 문항 누락 시 다음 이동 차단·원문 안내, 이전/다음 이동·입력값 메모리 유지, 마지막에서 5개 원문 대조/인쇄·수정/전체 초기화, 단계 이동 후 실제 입력 필드 포커스.
- **데이터·업무 경계:** 5문항 문구·원문 등급, `prepareL06ClientSubmission` 검증·민감정보 미입력·메모리 상태만 사용·원문 출처는 기존 계약 유지. 새 로그인/서버 API/정식 제출/개인정보·DB/RLS/외부 과금/오프라인 저장/운영 배포 **없음**. 완료 5/5는 시범 화면 내 작성 완료이지 서버 수신·관리자 검토·안전 승인·작업허가가 아님.
- **검증 코드:** `scripts/verify-psi-l06-worker-draft.mjs` Chromium 합성 QA에서 Q1 무응답 다음 차단, Q1~Q5 단계 이동, 미래 단계 점프 차단, Q2/Q3 뒤로가기 값 보존, 5문항 작성 후 검토, 재수정·전체 초기화, API·외부 호출·브라우저 저장 0을 검사하도록 변경. PC/실제 Android/원어민 언어는 이 검증으로 대체하지 않음.
- **커밋 기록:** UI `a389882` → Chromium QA `d2aca3e`. 두 변경 모두 기존 Draft PR #237 개발 브랜치에 반영. **최신 최종 HEAD의 릴리스·전사 Chromium·Inspector 3종 CI 통과는 완료 조회 전이면 미확정**.
- **출시 금지:** L18 필수 13개 사람 승인 검수 PENDING. 현장 실사용/다국어/실 RLS/정식 서버 접수·보완 재제출 및 독립 2인 검토는 미완료. `main` 병합·Vercel Production/운영 DB 변경 금지.

**다음 한 작업:** 6차 최종 동일 SHA CI 3종 성공/실패를 재조회하고 모바일 단계형 브라우저 스크린샷·접근성·진행/뒤로가기 회귀를 확인. 이후 L06 보완요청 원문과 새 제출의 변경불가 parent-link 및 관리자 검토 UX를 **격리 검증**으로 설계/구현하고, 실제 Supabase Auth/RLS와 Android·11개 언어 원어민 검증은 별도 승인·실기기 게이트로 유지.

### L06 후속 — 보완요청→신규 제출 관계원장·관리자 원문 비교 UI 7차 (2026-11-22)

- **이전 상태 재조회:** 이전 최종 HEAD `0b1aa75` 릴리스 SUCCESS(#44985860642), 전사 Chromium SUCCESS(#44985860627), Inspector 모바일 브라우저 CANCELLED(#44985860647, 후속 푸시). 따라서 앞선 작업을 동일 HEAD **3종 전부 PASS로 승격하지 않음**.
- **원본 불변 parent-link 격리 SQL:** `supabase/proposals/psi_worker_risk_resubmission_l06_staging.sql` 작성. 기존 5차 제출·관리자 검토 SQL을 **변경하지 않고 별도 제안 단계**로 연결. 기업·현장·근로자·평가주기가 정확히 일치하는 원본/보완본에 복합 FK를 두고, 원본별 교체본 최대 하나 및 교체본 재사용 금지, INSERT 전용 관계 원장 + UPDATE/DELETE 차단 트리거 + FORCE RLS·직접 접근 권한 차단.
- **제출 RPC 초안:** `psi_submit_worker_risk_revision_l06`은 실제 인증주체 `auth.uid()`, 원본의 같은 계정·현장/평가주기, 최종 관리자 `request_changes` 확인 후에만 기존 `psi_submit_worker_risk_l06`을 재사용해 새 Q1~Q5 원문/수신 원장을 생성·연결(하나의 트랜잭션). 동일 `requestId`/동일 답안 재요청만 허용, 다른 교체본·변조·타 기업/현장/근로자·원본 승인후 재작성 차단. 응답은 parent/child 영수증 관계를 알리지만 **작업허가·재개·위험 제거 근거 아님**.
- **관리자 read RPC 초안:** `psi_read_worker_risk_revision_chain_l06`은 기존 `psi_read_worker_risk_review_l06`의 현장 관리권한 검사를 **원본과 보완본 각각** 수행해 원문 Q1~Q5·검토 이벤트·연결시각을 반환. 추가 인증·역할을 임의로 생성하지 않음.
- **실제 UI 컴포넌트:** `components/assessment/PsiRevisionEvidencePanelL06.tsx` 신규. Q1~Q5 원문 2열(모바일 1열), 변경/동일 표식, 보완 사유, Q3 위험등급과 이유, 검토 대기/안전판단 경계 명확히 표시. 교차 기업·현장·근로자/미완성·가짜 작업허가·승인 기록을 화면에서 거부. **관리자 인증된 API/실제 메뉴에 미연결이므로 화면 컴포넌트 준비 단계이지 운영 기능 아님.**
- **회귀:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`에 PGlite 보완 원문 연결·관리자 대조·무권한/타 현장·중복재전송·원자적 실패 롤백·원본/링크 변경금지 5건 추가(기존 20건 포함 총 25건 의도); `tests/psiRevisionEvidencePanelL06.test.tsx`의 합성 렌더·위조 스코프/작업허가 차단·비송신 계약 3건 추가. **새 HEAD에서 자동 QA 완료·CI 로그를 조회하기 전에는 통과로 기록하지 않음.** Android/원어민·실 Supabase 통합/보안 검증은 미실시.
- **변경 이력:** SQL `38c5a5e` → PGlite 테스트 `9706144` → 관리자 UI `d7d3b8d` → UI 테스트 `c66bd38` → Q3 사유 보강 `94a4c7e` → 테스트 보강 `040d576` (이후 인계 커밋 포함 최종 HEAD 기준으로 재판정).
- **절대 보류:** `supabase/migrations/` 미편입, 실제 PSI-Database/운영 RPC·API·근로자 개인정보·외부 전송·Vercel Production 변경 0. 기존 `/worker-risk-draft`는 여전히 한국어 무저장 시범 입력이며 새 실서버 제출을 제공하지 않음. L18 human gate 13건 pending, Draft PR #237, 사용자 승인 없는 main 병합·운영 배포 금지.

**다음 한 작업:** 동일 최신 HEAD의 릴리스·전사 Chromium·Inspector 3종 결과 확인하고 실패 시 코드 수정·재검증 → 승인된 **별도 Supabase 테스트 프로젝트**의 실제 Auth/RLS/GRANT·중복 경합·현장범위 및 UI 연결 보안 검증 → 관리자가 실제 등록된 새 원문을 안전하게 대조하는 통합 화면 개발 및 Android/11개 언어/개인정보 보존·삭제 인수. 최종 제품 소유자 승인 전 main·Production/운영 DB 보류.

### L06 후속 — 재제출 선행접수 차단 + 모바일 관리자 비교 개발용 실브라우저 검수 (8차, 2026-11-22)

- **시작 점검:** 7차 최종 HEAD `526113d`의 릴리스 CI #44986443448 SUCCESS (PGlite 25/25, Vitest 2,118/2,118 및 빌드·L17/L18 소스 게이트 성공). 전사 Chromium #44986443491 및 Inspector 모바일 #44986443447은 후속 푸시 시 완료 전 취소되어 **3종 동일 HEAD 검증 완료로 주장 불가**.
- **실제 발견한 무결성 누락:** 기존 보완 제출 RPC는 최초 `request_changes` 시점보다 먼저 접수된 독립 원본도 동일 `requestId`로 다시 불러와 보완본으로 연결 가능했음. 신규 제출 기록이 실제 보완요청 이후 생성되었는지 판정하지 못하는 문제. `supabase/proposals/psi_worker_risk_resubmission_l06_staging.sql`에서 검토 이벤트 `occurred_at`을 조회하고 `replacement.received_at > request_changes.occurred_at`을 필수로 하여 **선행 접수 재사용 거부**. 원본·이력 변경이나 운영 DB 적용 없음.
- **회귀:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts` 신규 부정 사례 1건(원본과 별개의 선행 접수증을 보완요청 뒤 연결 시도 → 거부; 원본 둘과 링크 무변경). 목표 26개 PGlite 가상 테스트. 마지막 HEAD CI 성공 전에는 신규 테스트 PASS 판정 유보.
- **개발용 화면 경로:** `pages/PsiRevisionLabL06.tsx`에 실제 `PsiRevisionEvidencePanelL06` 컴포넌트와 **가상의 근로자·현장·Q1~Q5**를 연결. 5문항 원문·변경 2문항·보완 사유·미승인 상태를 모바일 1열/데스크톱 2열로 실제 렌더. ‘정상 기록’ ↔ ‘다른 현장 연결 차단’ 시나리오를 선택할 수 있음. `index.tsx`의 `/_dev/psi-l06-revisions`는 **`import.meta.env.DEV` 조건에서만 렌더**하며 Production 경로는 명시적 비제공 메시지. 실제 관리자 인증·업무 메뉴/서버 API·프로덕션 DB와 절대 연결하지 않음.
- **진짜 Chromium QA 확장:** `scripts/verify-psi-l06-revision-lab.mjs`은 Vite dev에서 390px/1280px 렌더·5문항 비교·두 문항 변경 표시·가로 넘침·시나리오 전환·다른 현장 기록 비표시·API/외부 호출 0을 확인하고 화면 4장·JSON을 산출. 별도 `vite preview` 빌드에서 같은 경로가 차단됨도 확인. `.github/workflows/psi-company-wide.yml`에 단계와 artifact 추가; `tests/psiRevisionEvidencePanelL06.test.tsx`에 개발 전용 경로·비송신 정적 검사 추가.
- **현재 범위의 명확한 한계:** 이것은 관리자 화면의 **시각적 실동작 검수용 개발 전용 샘플**이지 인증된 현장 관리자에게 실원문을 조회하는 ‘운영 관리자 화면’이 아님. 후자는 P05/L06 제안 SQL의 실 Supabase 테스트 Auth/RLS/GRANT·2개 기업 교차 시나리오와 개인정보 보유정책·최종 배포승인이 선행돼야 함. 개발비용·개인정보 전송/저장·외부 OCR/API 호출 없음. 기존 운영 `main`·Vercel Production·Supabase migration/실DB 변경 없음.
- **초기 CI 오류와 시정:** 8차 첫 통합 HEAD `c19a499`에서 전사 Chromium #44986965533은 신규 `scripts/verify-psi-l06-revision-lab.mjs` 실행 즉시 `ReferenceError: Cannot access 'process' before initialization`으로 FAIL. 앱/DB 보안 실패로 위장하지 않고 스크립트의 지역변수 `const process`가 Node 전역 `process`를 가린 원인을 확인해 `const child`로 변경(`b93e6ac`). **오류 수정 커밋 이후 동일 최종 HEAD 3종 QA 결과 재확인 전에는 PASS 아님.**
- **2차 CI 원인과 시정:** HEAD `0da4638`의 전사 Chromium #44987127133에서 개발 비교 화면의 5문항 렌더·교차현장 차단까지 진행한 뒤, 외부 요청 0 조건에서 공통 `index.html`이 유입한 **Google Fonts 및 Pretendard 스타일 CDN 2건**을 검출해 FAIL. 테스트 허용 기준을 완화하지 않고 `index.html`에서 개발 전용 `/_dev/psi-l06-revisions` 경로를 기존 `worker-risk-draft`처럼 외부 폰트 미로드 대상으로 등록(`d0f536f`), 해당 조건을 React 계약 테스트에 추가(`d807da1`). 신규 최종 HEAD 3종 CI 재확인 전에는 성공 미확정.
- **검증 게이트:** 이번 8차 최종 HEAD 3종 CI를 같은 SHA로 재조회. 소스 코드/스크립트 작성만으로 브라우저 QA 완료 또는 L18 출시 승인이라 하지 않음. 사용자 인수 13건 전부 pending, PR #237 Draft 유지.

**다음 한 작업:** 최신 HEAD 릴리스·전사 Chromium·Inspector 결과를 실제 확인해 오류 수정 → 승인된 격리 Supabase 테스트 프로젝트 존재/권한 정책 read-only 확인 → 2개 기업의 실제 Auth/RLS/GRANT 및 동시 경합 재현 → 그 검증된 서버 읽기 경계와 관리자 실화면 연동 검토. 현장 Android·11개 언어 A4/원어민·보관기한·보안/법무 검수 후에만 release 승인.

### L06 후속 — 서버 확인 관리자 원문 조회계약·변경문항 UX 9차 (2026-11-22)

- **착수 실조회:** 8차 최종 HEAD `6c87abf`의 GitHub 릴리스 #44987283271 **SUCCESS**, 전사 Chromium #44987283222 **SUCCESS** 확인. Inspector 모바일 #44987283264는 후속 푸시가 이어지면서 최종 **CANCELLED**, 동일 SHA 3종 PASS는 성립하지 않음. PR #237 Draft, 운영 `main`·Vercel Production SHA `8aa4dea` 불변 재확인.
- **실구현(보안·신뢰 경계):** `lib/server/workerRiskManagerReadL06.ts`는 **API 없는 SOURCE-ONLY** 관리자 원문 조회 검증계약. 서버가 확인한 신원+세션 ID/만료와 **세션 재조회 결과**를 대조하고 기업 `owner/admin/reviewer` 활성 멤버십→활성 현장 소속→현장 상태→독립적으로 권한 재검증한 관리자 전용 DB 읽기 포트 순서. 거절·계정 철회·교차기업/현장·원본 불일치·DB 오류에 대해 데이터 미반환, 코드만 반환.
- **원문·보완 무결성:** 읽기 포트가 넘긴 결과는 strict allowlist(`schema, tenantId, siteId, originalSubmissionId, reviewer` 등 브라우저 주장을 신뢰하지 않음). 원본과 변경본의 동일 테넌트·현장·근로자 ID, 분리된 제출ID, Q1~Q5 정확한 원문, 동일 selfRiskGrade/Q3, 승인 기록/감사 이벤트의 순번·담당자·시각, 보완요청 이후 새 수신과 연결시각의 전후관계 확인. 원문·답변 외 이름/이메일/토큰 등 예상치 못한 필드는 **원문 전체 반환 거부**. `approved`도 현장 작업허가가 아니며 응답에 `workClearanceGranted:false` 고정.
- **권한 구현 진실성:** 위 코드는 `L06ManagerRevisionReadPort`로 주입되는 순수 함수이며 **실 Supabase Auth/RLS·GRANT·JWT·세션 재인증을 실제로 검증/조회하지 않음**. 그 포트의 `authorizedRevisionChain`은 향후 실제 SQL `psi_read_worker_risk_revision_chain_l06` 자체의 현장 인가도 통과해야 한다. 현재는 승인된 별도 Supabase 테스트 프로젝트를 확인하지 못했으며 운영 DB에는 L06 테이블 없음. 운영 API·실자료·개인정보·GRANT/migrations/Production 변경 없음.
- **독립 합성 테스트:** `tests/psiWorkerRiskManagerReadL06.test.ts` 신규. 만료/위조·철회 세션, 개인 근로자 계정의 관리자 역할 사칭, 타 기업·다른 현장, 불완전/다른 근로자 원문/원장, 이력·시각 조작, 가짜 `workClearanceGranted`, 예상 외 개인정보 포함, DB 읽기 오류를 거부하고 조회 시도 순서와 원문 미반환 검사. L06 기존 PGlite 26건은 그대로 유지.
- **실제 PC·모바일 UX:** `components/assessment/PsiRevisionEvidencePanelL06.tsx`에 변경 문항 수/기록검토 상태 카드와 **44px 이상 ‘변경 문항만 보기↔전체 5문항’** 접근성 토글 구현. 변경된 텍스트 수는 단순 원문 차이이며 조치 이행 완료 아님. 새 기록 이벤트별 `접수/1차 검토/평가자료 승인/추가 보완요청`을 구별하고 **작업허가/작업 재개는 불인정**. `scripts/verify-psi-l06-revision-lab.mjs`에 390px·1280px 필터 전환·전 문항 복구 및 합성 스크린샷 증빙 추가.
- **계약/CI:** `tests/psiRevisionEvidencePanelL06.test.tsx` 렌더 상태 및 읽기/상태 불변 테스트 보강. 신규 HEAD의 릴리스·전사 Chromium·Inspector 3종 종료 후 실제 결과 조회 전에는 **9차 PASS 미확정**. 원어민 11개 언어·실 Android·실 Supabase Auth/RLS·보존/삭제·L18 human gate 13개 모두 pending.

**다음 한 작업:** 9차 최종 SHA 전체 CI·신규 실브라우저 단계를 확인하고 실패 수정 → 승인받은 완전히 격리된 Supabase 테스트 프로젝트의 2개 기업 Auth/RLS·세션 철회·현장 관리자 조회/권한 경합 실증 → 사람 승인 후에만 운영 관리자 UI/서버 API 연결 검토. main 병합·Production/실DB 쓰기 보류.

### L06 후속 — 접수·보완요청·재제출의 출처시각 타임라인 및 검증 10차 (2026-11-22)

- **착수 동일 HEAD 증빙:** 9차 HEAD `349f316` GitHub 릴리스 #44988085522 **SUCCESS**(Vitest 276개 파일/2,128개 테스트 PASS, 관리자 SOURCE-ONLY 권한계약 9/9, L06 PGlite 26/26), 전사 Chromium #44988085507 **SUCCESS**. Inspector 모바일 #44988085533은 마지막 조회 시 **in_progress**. 신규 푸시가 이를 취소할 수 있으므로 3종 PASS로 기록하지 않음.
- **실제 UI 구현:** `components/assessment/PsiRevisionEvidencePanelL06.tsx`에 `receivedAt`(원본 접수), `original.events[-1].recordedAt`(관리자 보완 요청), 보완본 `receivedAt`, immutable 링크 `linkedAt`, 후속 검토 이벤트 `recordedAt`을 순서대로 보여주는 모바일 1열/PC 2열 타임라인 추가. 서버 원문 시각은 UTC 기반으로 받아 `Asia/Seoul` 표시로 변환하며 ‘KST’를 명시. 임의의 현재시각·실제 현장조치완료시각 생성 금지. `기록 시간표시=작업 재개 승인` 착오를 막는 문구 유지.
- **데이터 정합·안전:** 입력 체인은 정확한 밀리초 단위 UTC 수신/검토/연결 시각이어야 하며, `원본 접수 < 관리자 보완요청 < 보완본 접수 <= 링크 기록 <= 이후 검토 이력` 및 이벤트 시각 오름차순을 거부형으로 검사. 필수시각 누락/위조, 교차 현장·근로자, 보완요청 전 선행 접수를 확인하면 **일체 원문/타임라인 미출력**. 이것은 화면의 단일 독립검증이며 실 Auth/RLS가 아님.
- **합성 데이터·회귀:** `pages/PsiRevisionLabL06.tsx`는 사실성 있는 **가상 시각**만 추가, 실근로자 정보/서버 API 없음. `tests/psiRevisionEvidencePanelL06.test.tsx`는 시간순서·누락/위조 차단·검토 단계·서울 시간표시/원문 불변을 확인. `scripts/verify-psi-l06-revision-lab.mjs`은 390px/1280px Chromium에서 4개 원본시간, 변경문항 필터/복귀, 타 현장 거부 시 타임라인·원문 유출 0 및 Production 경로 비제공을 다시 검사.
- **변경 파일:** 해당 컴포넌트, 개발전용 fixture, 정적 React 테스트, 합성 Chromium 검사, 인계서만. SQL·`supabase/migrations`/운영 DB·실제 API·인증·Production 미변경. L18 13개 human gate 전부 pending.
- **QA 판정:** 10차 최종 HEAD **릴리스·전사 Chromium·Inspector 모바일 3종 동일 SHA 결과를 실조회한 후에만 PASS**. 자동 테스트는 화면·합성 DB/세션 시험이며 현장 Android 및 실제 기업별 Auth/RLS/보존기한/다국어·실제 사고감소 효과를 증명하지 않음.

**다음 한 작업:** 새 HEAD 전체 CI 결론과 스크린샷/스크립트 실패 확인·보수 → 승인된 별도 Supabase 테스트 프로젝트의 실제 session-id 철회/RLS/2개 기업 권한 검증 → 검증된 진짜 읽기 포트와 관리자 UI를 사전 승인 후에만 연결. 원본·메인·Production 미변경 유지.

### L06 후속 — 재확인된 관리자 권한으로 원문 반환: 세션·현장 권한 경합 차단 11차 (2026-11-22)

- **착수 실조회:** 10차 최종 HEAD `e3db881` 릴리스 #44988851910 SUCCESS(276개 테스트 파일/2,128개 테스트), 전사 Chromium #44988851981은 마지막 조회 기준 아직 실행 중, Inspector 모바일 #44988851993은 11차 신규 커밋으로 CANCELLED(실패/통과로 보지 않음). PR #237 Draft, main/Production 불변.
- **보안 결함/업무 영향:** 9차의 `inspectL06ManagerRevisionRead`는 서버 세션·기업 관리자 역할·현장 소속을 **조회 전 한 번만** 확인했음. 서버 DB 원문 읽기가 진행되는 동안 관리자가 퇴사·현장전출·역할 철회/세션 만료될 경우, 조회 후에도 기존 원문을 반환할 가능성이 존재. 실제 현장 관리자에게 허가 없는 근로자 Q1~Q5를 노출할 수 있어 fail-close를 강화.
- **실구현:** `lib/server/workerRiskManagerReadL06.ts`의 시각 인자를 신뢰된 서버의 `clock:()=>Date`로 교체, 요청 시작+원문 읽기 종료 시 각각 최신 서버시간을 샘플링. 원문 반환 **직전** JWT 주체 세션만료·세션 ID 활성·기업 owner/admin/reviewer 역할·현장 소속/현장 활성 상태를 **다시 독립 조회**하여 변화 시 `dataReleased:false`와 오류코드만 반환. DB 원문/연결 정보도 오류 시 부분 반환 없음.
- **독립 가상 경합 테스트:** `tests/psiWorkerRiskManagerReadL06.test.ts`에서 가상의 `authorizedRevisionChain`가 진행 중 세션을 비활성화/기업 멤버십 철회/현장배정 철회/현장 중지로 바꾸는 상황을 실제 비동기 포트로 재현; 종료 시각이 만료시각에 도달하거나 뒤로 가거나 시계 예외 발생/최종 재조회 DB 오류 시 원문 노출 거절. 기존 9개 케이스 + 신규 4개를 추가하여 **13개 목표**, 10차 PGlite 26개 유지. 동일 HEAD 릴리스 CI 성공 전에는 완료 처리 금지.
- **중요한 한계:** 순수 함수/의존성 주입계약 단계이고 **실 Supabase 세션 조회/RLS/동시 트랜잭션 검증 결과가 아님**. 검사 직후 권한이 또 바뀔 수 있는 TOCTOU 한계가 여전히 있어, 운영 연결 시 `auth.sessions`의 `session_id`와 **DB 읽기 함수 내부 일관된 RLS/인가 검증** 또는 동등한 트랜잭션 경계의 실증이 필요. 절대 브라우저 JWT `user_metadata`나 `service_role` 클라이언트 권한에 의존하지 않는다.
- **실 Supabase 접근 여부:** 현재 Supabase 연결 목록에는 `PSI-Database`와 별도 일반 프로젝트가 있으나 **L06 전용으로 승인·격리된 테스트 프로젝트가 없음**. 실제 DB 쿼리/DDL/테스트 계정·RLS 변경은 하지 않음; 직접 적용하기 전 사용자 승인·격리정책 확정 필수.
- **출시 차단:** 실 근로자 원문/동의 및 보유·삭제, 실제 2개 기업 Auth/RLS/GRANT·세션 무효화/권한 경합, Android/원어민 11개 언어, L18 13개 인수 human gate **전부 미검증/대기**. main 병합, Vercel Production, 운영 DB/SQL 업데이트 승인 전 보류.

**다음 한 작업:** 최신 11차 HEAD 릴리스·전사 Chromium·Inspector 모바일 3종 실제 결과 확인/실패수정 → 허가된 격리 Supabase 테스트 프로젝트에서 `auth.sessions` 기반 철회/관리자 권한 동시변경/RLS 거부 실증 → 승인된 사용자와 법무/안전관리자 권한 결정 후 진짜 관리자 화면 읽기 경로 연결 검토.

### L06 후속 — DB 내부 활성 세션·기업/현장 잠금 보안 초안 (12차, 2026-11-22)

- **11차 동일 SHA 판정:** `d2b42f8` 릴리스 #44989283398 **SUCCESS**(276개 파일·2,132개 단위 테스트, 관리자 SOURCE-ONLY 13/13, 기존 L06 PGlite 26/26). 전사 Chromium #44989283403과 Inspector 모바일 #44989283382는 12차 신규 커밋이 이어진 후 **CANCELLED** 확인. 동일 SHA 3종 통과라고 표시하지 않음.
- **소스 점검 결과:** 관리자 읽기 `psi_read_worker_risk_review_l06`/리뷰 `psi_review_worker_risk_l06` RPC는 `auth.uid()`와 기업·현장 소속만 확인하므로, 이미 철회된 인증 세션의 아직 만료되지 않은 JWT를 `session_id`로 대조하지 못했음. 읽기 RPC는 변경 중인 현장 소속·현장 상태 행 잠금도 없었음. 실제 운영 이슈는 아닌 **미배포 SQL 제안의 잠재 취약점**.
- **12차 구현:** `supabase/proposals/psi_worker_risk_manager_review_l06_staging.sql`에 `psi_l06_require_active_session` 보안정의 helper(직접 PUBLIC/anon/authenticated/service_role 실행권한 모두 철회). `auth.jwt()->>'session_id'`와 실제 `auth.uid()`를 `auth.sessions(id,user_id)`에서 대조하고 `FOR KEY SHARE OF sess` 잠금; 세션 없거나 다른 사용자의 세션이면 관리자 검토/읽기 모두 42501로 차단. 원문 읽기 `m,sm,site FOR SHARE`로 동시 권한 변경을 RPC 트랜잭션 안에서 직렬화. 노출된 원문과 작업 재개 허가 플래그는 기존과 동일.
- **합성 PostgreSQL 실엔진 검증:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`의 격리 Auth fixture에 `auth.sessions`와 `auth.jwt()` 최소 모사, 실제 로그인 서명·RLS 아님. 추가된 가상 검증 5개는 `session_id` 누락, 세션 행 삭제(퇴장/로그아웃 모사), 다른 사용자 세션 ID, 불변 원본·보완본 함께 조회 차단, 실제 `pg_get_functiondef` 행잠금 정의 확인. 기존 PGlite 26건과 합계 **31건 목표**; 새 HEAD 릴리스 CI 완료 전에는 통과로 기록하지 않음.
- **실제 DB/보안 범위:** PGlite는 SQL 엔진 단위 회귀이지 Supabase `auth.sessions`의 실제 사용계정 토큰/로그아웃/세션 삭제 행태·REST API·DB 잠금 경합(별도 연결 2개)·GRANT/RLS의 동등 검증이 아님. `auth.sessions`가 실제 프로젝트에서 어떻게 관리되는지 승인된 격리 환경에서 반드시 실증할 것. 임의의 `TELLOWSS's Project`를 sandbox로 단정하지 않음. 두 연결 Supabase 프로젝트 중 L06 별도 격리 승인환경 확인되지 않아 **SQL 실행·실근로자·실개인정보/테스트계정 생성·DB schema 변경 없음**.
- **출시 차단 유지:** L06 SQL은 `supabase/proposals`에만 존재. `main` 병합·Vercel Production·운영 Supabase GRANT/RLS/SQL·실제 관리자 서버 API 연결 금지. 13개 L18 인간 인수(12개 사전·1개 사후), 실 Android, 원어민 11개 언어 및 개인정보 처리 근거·보존/삭제 승인 대기.

**다음 한 작업:** 12차 최종 HEAD의 릴리스·전사 Chromium·Inspector 동일 SHA 3종 결론/실패 원인 확인·수정 → **사전 승인받은 격리된** Supabase 테스트 프로젝트에서 2개 기업/현장 JWT session_id→auth.sessions·권한 경합/원본 차단 실증 → 사람 인수·사용자 승인 후 운영 연결 여부 검토.

### L06 후속 — 관리자 계정 정지·삭제 검증과 승인된 실DB 인수행렬 (13차, 2026-11-22)

- **12차 실제 결과:** 최종 12차 소스 커밋 `a7cedb54ef435af290ffaadce682c26cc6d61a8f`의 release #44990039290 **SUCCESS**(276개 파일, 2,137개 단위검증, L06 PGlite 31/31, manager SOURCE-ONLY 13/13, L17 19/19). 전사 Chromium #44990039278 및 Inspector 모바일 #44990039286은 새 개발 커밋 전 마지막 조회에 **in_progress**. 12차 동일 HEAD 3개 최종 PASS로 선언하지 않음.
- **13차 발견:** `psi_l06_require_active_session()`은 실제 `auth.sessions` 존재·사용자 연결을 확인하지만, 관리자 `auth.users`가 차단된 계정(`banned_until` 미래) 또는 soft-delete(`deleted_at`)인지 확인하지 않았음. 회사·현장 배정이 여전히 활성인 경우 민감한 Q1~Q5 원문에 대한 **미배포 SQL 잠재 접근공백**. 기존 근로자 제출 RPC는 계정 차단/삭제를 검사하고 있어 관리자 접근에도 필요함.
- **실구현:** `supabase/proposals/psi_worker_risk_manager_review_l06_staging.sql`의 내부 active-session gate에서 `auth.sessions sess JOIN auth.users u` 동시 확인, `u.deleted_at IS NULL`과 `banned_until IS NULL OR <= clock_timestamp()` 적용, `FOR SHARE OF sess,u`로 관리자 계정 상태/세션 변경을 같은 DB 트랜잭션의 읽기와 직렬화. 정상 상태 이외 모든 경로는 기존 42501 거부. 가입/SSO 이메일 확인 여부는 이번 변경에서 임의 정책 추가하지 않음.
- **가상 PGlite 검증:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`에 ① ban 중인 관리자 읽기/검토 차단 ② soft-delete 관리자 원문+보완본 차단 ③ 과거 ban 만료 시 정상 자료 열람 허용(작업허가는 여전히 false) ④ 직접 privileged helper EXECUTE 불허를 추가. 선행 31개에서 **35개 목표**. 최신 HEAD의 릴리스 CI 확인 전에는 PASS 미확정. 두 커넥션 동시성·실 Supabase JWT/signOut 실험은 아님.
- **실환경 검증 계획 작성:** `docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md` 신규 — 승인된 L06 독립 Supabase 프로젝트에서 실행할 **18개 A01~A18** 계정/현장 경계, 서명된 세션, logout·ban·delete, RLS/GRANT, 동시 PostgreSQL 커넥션 잠금, Android/UI 및 비노출 증거의 입력·합격 기준. **전부 NOT RUN**, API/DB 연결·실계정 생성 0. 기존 연결 `TELLOWSS's Project` / `PSI-Database`를 임의로 테스트용으로 선정하지 않는다.
- **운영/출시:** SQL은 미배포 제안 `supabase/proposals/`에만 존재, PR #237 Draft. `main`/Vercel Production/운영 Supabase SQL·GRANT/RLS·계정·실 근로자 기록·정식 관리자 API 변경 0. L18 13개 인간 인수/Android 실기기/11개 언어·개인정보 처리·삭제 보류.

**다음 한 작업:** 최종 13차 동일 HEAD 릴리스·전사 Chromium·Inspector 3종 결과 확인·오류 수정 → 사용자 승인 및 완전 격리가 확인된 Supabase 테스트 프로젝트에서 A01~A18 실증 → 정보보호/안전관리 인수 및 최종 사용자 승인 전 메인·운영 배포 금지.

### L06 후속 — 근로자 수신증·재제출의 철회세션 방지 일원화 (14차, 2026-11-22)

- **착수 13차 동일 SHA:** `935e03f7a094c1aafc0a87fc370edc96f6d235d6` 릴리스 #44990759592 **SUCCESS**, 276개 파일·**2,141/2,141** 단위검증, L06 PGlite 35/35, 관리자 SOURCE-ONLY 13/13, L17 19/19. 전사 Chromium #44990759580 및 Inspector 모바일 #44990759532는 이후 신규 커밋으로 **CANCELLED**; 당초 13차 동일 SHA 3종 전체 PASS로 표기 금지.
- **결함 발견:** 기존 미배포 SQL에서는 관리자 검토/읽기만 `auth.jwt().session_id`→`auth.sessions`+계정 ban/deleted 검사를 하고, 근로자 **최초 Q1~Q5 제출** `psi_submit_worker_risk_l06` 및 보완본 제출 `psi_submit_worker_risk_revision_l06`이 `auth.uid()`만 먼저 검사했음. 원문 수신증·불변 이벤트 생성 및 동일 nonce 재전송을 철회된 구 JWT로 시도할 수 있는 권한 공백.
- **14차 실제 소스 변경:** `psi_l06_require_active_session()`의 **단일 정의를 세 제안의 첫 적용 파일** `supabase/proposals/psi_worker_risk_submission_l06_staging.sql`로 이동(관리자 제안에서 중복 정의 제거), worker 최초 제출·worker 수정제출·관리자 검토·관리자 읽기 **모두 동일 세션/계정 잠금 게이트** 호출. 정상 사용자 ID·세션 ID 매핑, 실제 `auth.sessions` 존재, `auth.users`의 ban/deleted, `FOR SHARE OF sess,u`는 유지. SQL staged 적용 순서는 **submission → manager review → resubmission**; `supabase/migrations`에 반영하지 않음.
- **가상 검증 추가:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`에 ① 근로자 누락/위조 session_id 수신 차단 ② 철회된 세션 최초 접수 차단 ③ 철회 이후 동일 nonce 재전송(이전 원본·audit 1건 유지) ④ 다른 근로자 session_id로 시도 차단 ⑤ 관리자 보완요청 후 철회된 worker의 재제출 및 링크·접수 이벤트 추가 생성 거부. 기존 35+5=**40개 목표**. 신규 HEAD 릴리스 CI 40/40 확인 전 완료 PASS 아님.
- **실 보안 인수:** `docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md` A19~A21(철회 후 근로자 새 접수·nonce 재전송·보완본) 추가, **A01~A21 전부 NOT RUN**. 테스트는 PGlite 가상 `auth.jwt()`와 `auth.sessions` 최소 형태이고 실제 Supabase Auth signOut/JWT/GRANT/RLS·동시 커넥션 차단 증거가 아님.
- **운영 절대 보호:** 현재 연결된 `PSI-Database`·`TELLOWSS's Project` 두 프로젝트 중 어느 것도 L06 전용 승인 격리환경으로 지정되지 않음. 실 DB·개인정보·테스트 계정·인증 설정·마이그레이션·API·Production 변경 0. PR #237 Draft, 출시 L18 `RELEASE=BLOCKED`, 인간 인수 13개·Android/원어민 검수·보관/삭제 승인 대기.

**다음 한 작업:** 14차 최종 HEAD 릴리스·전사 Chromium·Inspector 모바일 3종 실제 결론과 실패 확인/수정 → 사용자 승인된 독립 Supabase에서 A01~A21 실제 Auth/RLS/철회·동시 접근 검증 → 관리자/근로자 진짜 API 연결, 13개 L18 인간 인수 및 사용자 승인 전까지 main/운영 배포 보류.

### L06 후속 — JWT exp/iat 시간경계와 철회세션 독립 방어 (15차, 2026-11-22)

- **14차 최종 동일 SHA 확정:** `376a32f48b8b171a6e658099bc754ed190998a73` **세 검증 모두 SUCCESS**: release #44991189656 (276개 파일, **2,146/2,146** unit, L06 PGlite 40/40, manager read 13/13, L17 19/19), company Chromium #44991189589, Inspector 모바일 Chromium #44991189597. 이것은 **소스/가상 브라우저 통과**이고 Android 실기기·실 Supabase 인증 인수가 아니다.
- **15차 보안 공백:** 공통 `psi_l06_require_active_session()`이 JWT의 `session_id`를 실제 `auth.sessions`과 대조하고 계정 ban/deleted를 확인했으나, JWT 필수 숫자 `exp`(만료)·`iat`(발급) 클레임의 서버 현재시각 범위를 별도로 확인하지 않았다. API 게이트웨이의 서명/만료 검사와 별도로 SQL 제안의 fail-closed 방어 심화.
- **SQL 개발:** `supabase/proposals/psi_worker_risk_submission_l06_staging.sql`의 공통 SECURITY DEFINER gate에서 `auth.jwt()` 한 번 획득해 `exp`/`iat`이 **JSON number**인지 요구; DB `clock_timestamp()`를 epoch 숫자로 변환해 `exp > now`, `iat <= now`, `iat < exp` 모두 만족해야 계속. null/문자/비정상·만료/미래 발급 시 42501 거부. 공통 검사를 최초 작성·재제출·관리자 검토·원문조회 4개 RPC가 공유하며 JWT 서명 자체를 검사한다고 주장하지 않는다. SQL 배포 대상은 계속 `supabase/proposals`뿐.
- **가상 PostgreSQL 회귀:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts` 최소 Auth JWT fixture에 숫자 `exp`/`iat` 추가; 데이터베이스 시각으로 기본 만료/발급 설정. 신규 5건 ① 유효 세션 행이 남은 만료 worker JWT 최초 접수 차단 ② 미래 `iat` 및 뒤집힌 시간범위 ③ missing·문자형 exp/iat 차단 ④ 만료 reviewer 원문 조회·승인 거부 ⑤ 만료 후 같은 nonce 재전송/원본 불변. 총 **L06 45개 목표**, 전체 2,151개 목표. 최종 동일 HEAD 릴리스 CI 끝나기 전 PASS 표시 금지.
- **정확한 한계:** 실제 Supabase `auth.sessions` revocation, 서명된 JWT `exp`/clock skew, 실 Auth role/RLS/GRANT 및 PostgreSQL 두 연결의 일관성은 아직 검증하지 않았다. Supabase 공식 JWT claims reference에서 `exp`/`iat`가 숫자 Unix timestamp 필수 필드라는 문서적 근거만 확인(https://supabase.com/docs/guides/auth/jwt-fields). PGlite fixture는 서명/JWT 게이트웨이 모사이지 실 Auth가 아니다.
- **출시 차단:** 별도 L06 격리 Supabase 프로젝트 소유자 승인 없음. A01~A21 실제 인수 `NOT RUN`, 개인정보·Android·11개 모국어/현장 UAT·L18 인간 인수 13개 대기. `main` 병합·운영 Vercel·`PSI-Database`/목적 미확인 프로젝트·운영 API/DDL/RLS/GRANT·실근로자 데이터 무변경, PR #237 Draft.

**다음 한 작업:** 15차 최종 HEAD release/전사 Chromium/Inspector 동일 SHA 세 가지 CI 결과 확인·실패수정 → 승인된 독립 Supabase에서 실제 서명 JWT 만료·세션철회/기업·현장 접근/2커넥션 경합 A01~A21 실증 → Android·원어민·보관삭제·L18 13개 사용자 인수 전 운영 출시 금지.

### L06 후속 — 종료된 시간제한 Auth 세션의 지연정리 경계 차단 (16차, 2026-11-22)

- **15차 CI 실조회:** 소스 커밋 `2e3326becdab302dde7473656c2abee6499e883c` release #44993293216 **SUCCESS**(276개 파일/2,151개 Vitest, L06 PGlite 45/45, server read 13/13, L17 19/19), 전사 Chromium #44993293203 **SUCCESS**, Inspector 모바일 #44993293206은 **후속 push로 CANCELLED**. 동일 SHA CI 3종 모두 SUCCESS는 아님.
- **16차 신규 발견과 공식 근거:** Supabase 최신 <https://supabase.com/docs/guides/auth/sessions>는 시간제한/비활성 세션의 종료 검사가 refresh 시 이루어질 수 있고 **DB 행이 최대 약 24시간 지연 삭제될 수 있음**을 설명한다. 최신 GoTrue Session 모델의 `auth.sessions.not_after` nullable 시간 필드는 time-box 만료를 표시한다(<https://pkg.go.dev/github.com/supabase/auth/internal/models>). 종전 `session_id` 행 실존+JWT exp/iat/계정 ban 검사만으로는 **시간제한이 끝났지만 아직 삭제되지 않은 행**을 유효하다고 볼 수 있음.
- **구현:** `supabase/proposals/psi_worker_risk_submission_l06_staging.sql` 공통 `psi_l06_require_active_session()`의 session/user 잠금 검사 `FOR SHARE OF sess,u` 안에 `sess.not_after IS NULL OR sess.not_after > clock_timestamp()` 추가. 만료 시간제한 세션의 근로자 최초 수신/재전송·보완본·관리자 검토·원문조회 모두 42501 거부. `not_after=NULL`인 무기한 session은 기존 세션/계정/JWT 검증 후 정상 허용. 실제 Supabase 별도 격리 프로젝트에서 schema field 및 timeout 동작 확인 전 운영 DB 미적용.
- **PGlite 합성 검증:** `tests/psiWorkerRiskSubmissionSqlL06.test.ts`의 가짜 `auth.sessions`에 nullable `not_after timestamptz` 추가, 5개 신규 검증: 만료 worker 신규접수 0, 만료 reviewer 검토/조회 0, nullable/미만료 정상 접근, 기존 nonce 재송신 시 이전 원문/감사 1건 보존, 보완 요청 뒤 만료 worker 보완링크·추가수신 차단. 기존 45개 → **L06 50개 목표**(전체 2,156). 최종 HEAD CI 확인 전에는 PASS 주장 금지.
- **제약/미검증:** `not_after`는 fixed time-box 만료에 대한 검사이고 **inactivity timeout, single-session 강제의 즉시 철회까지 모두 보장하지 않음**. Supabase에서는 일부 정책을 refresh 시 검사하며 늦게 행 삭제할 수 있음. `docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md` A24~A25를 추가해 실제 time-box와 inactivity/single-session 설정을 **별개 검사**하도록 분리; 총 A01~A25 실제 Auth/RLS·두 커넥션 인수 전부 `NOT RUN`.
- **운영 차단:** 두 연결 Supabase 프로젝트는 L06 전용 독립 sandbox 승인 대상 아님. 실제 운영 데이터/계정/DDL/RLS/GRANT·JWT·Vercel Production·`main` 미변경. PR #237 Draft. L18 사람 인수 13개 pending, Android·11개 모국어/실근로자 개인정보·보관삭제 검수 미완료.

**다음 한 작업:** 16차 최종 HEAD 동일 SHA 릴리스·전사 Chromium·Inspector 모바일 CI 성공/실패 확정 → 허가된 독립 Supabase에서 실제 `not_after`·refresh/cleanup·JWT 만료/세션 철회와 현장 권한/RLS A01~A25 실증 → 보안/법무·Android·모국어·L18 13개 사람 승인 전 메인·운영 배포 불가.

### L06 후속 — 실 Auth 25개 인수 증빙 대장·운영 DB 오선택 차단 게이트 (17차, 2026-11-22)

- **16차 결과 재조회:** `88babff14c7ba4a7533272ac335748fbddd23001` 릴리스 #44993898854 **SUCCESS**(276개 파일, **2,156/2,156** 테스트, L06 PGlite 50/50, source manager 13/13, L17 19/19). 전사 Chromium #44993898834과 Inspector 모바일 #44993898842는 **17차 후속 커밋으로 CANCELLED**. 릴리스·전사·모바일이 모두 동일 SHA에서 SUCCESS였다고 주장하지 않음.
- **실행 불가능한 선행 과제:** 실제 Supabase 인수 A01~A25에는 사용자 승인된 **독립 격리 Supabase 환경**이 필요하나 기존 연결 `PSI-Database` 및 `TELLOWSS's Project` 어느 것도 승인된 전용 실험실이 아님. 개인정보·기존 운영 RLS/GRANT·Auth 세션·마이그레이션을 변경하여 실험하지 않음. A01~A25 전부 **NOT RUN**.
- **17차 소스 구현:** `config/psi-l06-isolated-auth-acceptance-ledger.json` 신규(25건 전부 `not-run`/증빙 null). `scripts/check-psi-l06-isolated-auth-acceptance.mjs` 신규: 실제 승인환경 지정 전 `PASS` 금지, 두 기존 운영 프로젝트 ref 금지, A01~A25 원문 인수 문서의 행 ID 대조, 빠진/중복 항목 거부, `not-run`임에도 증빙을 붙이는 오류 거부. 나중에 `pass`를 기록하더라도 reviewer, UTC review time, source commit SHA, HTTPS 증빙을 필수로 하고 수동 독립 검수 전 최종 증빙 인정 금지.
- **CI 통합:** `package.json`의 `verify:fast` 시작에 `npm run check:l06:auth-acceptance` 연결; `tests/psiL06IsolatedAuthAcceptance.test.ts`에 7건 추가. 기본 ledger가 `A01-A25=25; PASS=0; NOT_RUN=25; REAL_AUTH_ACCEPTANCE=BLOCKED; RELEASE=BLOCKED`로 남는 것이 의도된 정상 소스 검증 결과. 모두 `PASS`라고 기재해도 검증기는 `EVIDENCE_REVIEW_REQUIRED; RELEASE=BLOCKED`로만 표시.
- **증명 범위 주의:** JSON은 인수증빙 **대장**, 테스트 자체가 아님. `PASS`의 증빙 링크 유효성/독립 검수자의 실제 승인·실서명 JWT·실 RLS/2연결 경합을 자동 검사로 증명했다고 주장하지 않음. `docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md` §4의 사용/보안 경계와 연계.
- **출시:** PR #237 Draft, `main` 병합·Vercel Production·실 Supabase/Auth·원도급 현장정보/근로자 사진 데이터·기존 게임/SMART TBM 변경 0. `L18 RELEASE=BLOCKED`, 인간 인수 13개, Android/11개 언어·보관삭제 등 별도 필수.

**다음 한 작업:** 17차 최종 동일 SHA release/company Chromium/Inspector CI 3종 결론 확인·실패 시 수리 → 소유자 승인된 새로운 격리 Supabase Auth 프로젝트로 A01~A25 실증 (운영 ref 사용 금지) → 개인정보/법무·실기기/원어민·L18 사람 인수 및 사용자 승인이 끝나기 전 운영 연결/병합·배포 금지.

### L06 후속 — 인증 인수 증빙 URL·검토 메모의 비밀정보 유출 차단 (18차, 2026-11-22)

- **17차 동일 SHA 결과:** `585c5d7fdacf1eb205ade563be32b87d87fb9e7c` release #44994482035 **SUCCESS**(277개 테스트 파일/2,163개 단위테스트, L06 PGlite 50/50, 증빙 대장 7/7, L17 19/19). 전사 Chromium #44994482057 **SUCCESS**, Inspector 모바일 #44994482053은 후속 커밋으로 **CANCELLED**. 동일 SHA 3종 모두 SUCCESS로 표시하지 않음.
- **17차 source-only 대장 결함 발견:** `scripts/check-psi-l06-isolated-auth-acceptance.mjs`에서 증빙·격리프로젝트 승인 링크를 `https://` 정규식만으로 검증했다. URL 쿼리·fragment·`user:password@host`·임시 서명 토큰을 코드 저장소에 넣을 여지가 있으며, 검사 로그에 인증정보를 출력하지 않도록 별도 방어가 필요했다.
- **18차 구현:** 증빙 및 승인 링크를 JS `URL` 파서로 검사해 HTTPS만 허용하고 사용자정보·query·fragment·port·localhost/사설 IP·민감정보가 포함된 path를 거부. 검토 `reason`·`reviewedBy`에 베어러/JWT/키/DB 연결문자열 형태가 들어가도 거부하며 실제 값은 오류 로그에 출력하지 않는다. **이는 외부 URL의 진위/접근통제 확인이 아닌 로컬 데이터 누출 방지 검증**이다.
- **합성 회귀:** `tests/psiL06IsolatedAuthAcceptance.test.ts` 5건 신규 (쿼리 서명 토큰, userinfo/fragment/내부주소, JWT 모양 경로, bearer 검토문구, 정상 비밀 없는 HTTPS 참조에도 release 차단). 기존 7개→**12개 목표**, 앱 전체 2,168개 목표. 최신 동일 HEAD CI 종료 전에는 PASS 미확정.
- **인계 및 보호:** `docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md` §5에 Git 증빙의 secret-free/문서 진위 인수 경계를 추가. A01~A25는 계속 모두 **NOT RUN**, 별도 L06 승인 Supabase sandbox 없음. PR #237 Draft, `main`/Vercel Production/운영 Supabase DB·실근로자 데이터/키/계정·RLS/GRANT/DDL 변경 0, L18 사람 13개 승인 대기.

**다음 한 작업:** 18차 최종 동일 SHA release·전사 Chromium·Inspector 3종 CI 종료 결과 확인·실패 수리 → 승인된 독립 격리 Supabase에서 A01~A25 실제 인증/권한 시험·증빙 검토 → L18 13개 사람 인수/Android/11개 언어·개인정보/소유자 승인 전 운영 연결 및 병합·배포 금지.

### L06 후속 — 최종 승인검사 지연 중 서버 JWT 만료/시계 역행 접근 차단 (19차, 2026-11-22)

- **18차 동일 SHA 결과 재검증:** 최종 `926b10d89a9951be98a5f799925d3ed6230f588d`: 릴리스 #44995043422 **SUCCESS**(277개 파일/2,168개 테스트, Auth ledger 12/12, L06 PGlite 50/50, L17 19/19), 전사 Chromium #44995043395 **SUCCESS**, Inspector 모바일 #44995043403 **CANCELLED**(19차 후속 커밋). 동일 SHA 세 가지 모두 SUCCESS로 주장하지 않음.
- **발견:** `lib/server/workerRiskManagerReadL06.ts`의 서버 어댑터 계약은 원문 조회 후 `clock()`으로 토큰/세션 유효시간을 확인하나 그 뒤 4개 비동기 함수로 세션·기업권한·현장배정·현장을 다시 확인한다. 이 네 조회가 오래 걸려서 JWT/세션 만료시각을 경과해도 **응답 직전 최종 시각 확인 없이 Q1~Q5 원문 반환**할 위험.
- **19차 실제 구현:** 마지막 `port.site()` 확인을 통과한 **직후 세 번째 trusted clock** 표본을 채취해, `releasedAtMs`가 유효·단조 증가·`principal.expiresAt`/`currentSession.expiresAt` 모두보다 이른 경우만 반환. 이 중 하나라도 실패/예외면 `SESSION_INVALID`, `dataReleased:false`; 원문 반환 없음. 기존 기업/현장·SQL 원자 인가 이외의 조건을 약화하지 않았다.
- **회귀시험:** `tests/psiWorkerRiskManagerReadL06.test.ts` source-only 5건 추가: 성공 시 3회 clock, 최종 site 호출 중 JWT 만료, 최종 membership 호출 중 JWT 만료, 반환시각 역행/손상/예외, 세션 시간이 JWT보다 먼저 만료되는 경계. 기존 13→**18개 목표**, 전체 앱 단위 **2,173개 목표**. CI 성공 전 PASS 선언 금지.
- **한계:** 이 코드는 실제 HTTP 엔드포인트가 **아니며**, `port`의 연속 호출은 DB 권한을 원자적으로 보장하지 못한다. 실제 실명 근로자 기록·auth.session/기업RLS 실증은 금지. `docs/PSI_L06_SUPABASE_ISOLATED_AUTH_ACCEPTANCE_20261122.md` §6에 source-only/실DB 분리; A01~A25 전부 NOT RUN.
- **운영/사람 인수:** SQL migrations/운영 API/운영 Supabase·Auth/RLS/GRANT·실사진/현장/개인정보·`main`·Vercel Production 변경 0. Draft PR #237. L18 사전 12+사후 1 사람 인수, Android·11개 원어민·개인정보 삭제/보관 검수 미완료 → `RELEASE=BLOCKED`.

**다음 한 작업:** 19차 최종 동일 HEAD 릴리스/전사 Chromium/Inspector CI 결론 확인·실패 수정 → 사용자 승인된 신규 격리 Supabase에서 A01~A25 실제 서명 JWT, 세션 철회, 현장 접근 및 2연결 권한경합 실증 → 현장/법무·실기기·11개 언어 및 L18 인간 13개 인수 후에만 운영 연결·main/Production 검토.

### L15·L20 후속 — 모바일 전체메뉴 반응형 전환 시 포커스·스크롤 복구 (20차, 2026-11-22)

- **19차 최종 CI 동일 SHA 재확인:** `3759b3a7c293063209dde27f44369b30bc259dd9` release #44995583058 **SUCCESS**(277개 파일·**2,173/2,173** Vitest; L06 서버 관리자 18/18, PGlite 50/50, 인수증빙 12/12, L17 19/19), 전사 Chromium #44995583165 **SUCCESS**, Inspector 모바일 #44995583087 **SUCCESS**. **3종 모두 SUCCESS**는 소스/합성 Chromium 증거이며 실기기·실 Auth 인수를 대체하지 않는다.
- **실제 UI 결함:** `components/Layout.tsx` 모바일 전체메뉴는 `lg:hidden`이며 열릴 때 body 스크롤 잠금·Tab 포커스 트랩을 설정한다. 화면 폭이 **1024px 이상**으로 바뀌면 CSS만으로 메뉴가 숨겨져 React `isMobileMenuOpen=true`가 남을 수 있음. 보이지 않는 dialog가 스크롤·Tab을 막을 수 있고 종료 시 모바일에만 표시되는 opener에 포커스를 반환할 위험도 존재.
- **실제 구현:** 신규 `utils/mobileMenuViewportGuard.ts`는 `matchMedia('(min-width: 1024px)')`의 현재 상태와 `change` 이벤트로 모바일 메뉴 닫기를 요청하며 cleanup에서 리스너를 제거한다. `components/Layout.tsx`에서 열려있는 메뉴에만 등록; 기존 focus trap cleanup이 body scroll을 복원. 모바일 opener가 `display:none`이면 `data-psi-desktop-sidebar [aria-current="page"]`로 포커스를 넘기고 이전 opener ref를 비운다. `components/shell/AppShell.tsx` desktop landmark 추가; `components/shell/TopBar.tsx` 모바일 버튼 및 하단 '더보기'에 `aria-controls="psi-mobile-navigation-dialog"` 연계·`aria-haspopup="dialog"`.
- **회귀시험:** `tests/psiMobileMenuViewportGuard.test.ts` 신규 가상 6건(1024px breakpoint, 모바일 유지, 이미 데스크톱이면 즉시 닫기, mobile→desktop change 닫기, unmount 리스너 제거, 실제 Layout/TopBar/AppShell의 aria·focus recovery 소스 연결 확인). **전체 테스트 2,179개/278파일 목표**. 추가로 기존 회사형 Chromium QA 시나리오 `scripts/verify-psi-company-visibility-ui.mjs`에 **실제 화면 동작 4검사**(모바일 open 시 body lock, 1200px 반응형 변경에서 unlock/닫기, PC 현재 메뉴로 focus 반환, 모바일 Escape 후 더보기 focus/scroll 복원) 통합. QA 실행에서 검증 전 완료 PASS 선언 금지. 사용자 메뉴 구성·권한·route visibility·PSI 본 업무 판정 변경 없음.
- **20차 1차 CI 실패와 시정:** HEAD `5135e8a` release #44996581937 **FAIL (2,178/2,179, 1 failed)**. 실패는 신규 6개 합성 테스트(6/6 성공)가 아니라 기존 `tests/psiL15AccessGuard.test.ts`의 **과거 오프너 무조건 focus() 문구를 기대하는 정적 assertion 1개**. 숨긴 버튼에 강제 초점을 주던 예전 가정은 현재 접근성 요구와 충돌. `tests/psiL15AccessGuard.test.ts`를 수정해 **현재 보이는 opener를 우선**, 없으면 desktop active route에 포커스 이동, ref 정리, 1024px viewport 관찰을 검증하도록 정정. 보안/기능 코드를 테스트 기대에 맞춰 퇴행시키지 않음. **수리 후 최종 SHA 3종 CI 결과 확인 전 PASS 아님**.
- **실기기 수동 인수 미완:** Android Chrome/삼성 인터넷에서 320/390/768→1024px 회전, Escape/Tab, back/더보기, 다크모드/200% 확대, 메뉴 열린 상태에서 폭 전환 시 스크롤/초점, 사이트 접근 제한 비교. 자동 Chromium의 success만으로 모바일 실기기 승인 금지.
- **통합 범위:** 본 작업은 인계서 §9에 명시한 `Sidebar`, `TopBar`, `Layout` L15/L20 shell UX의 독립 구현. L06 실 Supabase A01~A25 `NOT RUN`, L18 13 인간 승인 `pending`과 `RELEASE=BLOCKED`. PR #237 Draft, 실제 DB/Auth/RLS·개인정보·`main`/Vercel Production 변화 0.

**다음 한 작업:** 20차 최종 동일 SHA release·전사 Chromium·Inspector QA 3종 결과 및 실패 원인 확인 → 사용자 승인된 별도 Supabase에서 실제 L06 A01~A25 Auth/RLS 증빙 → Android·모국어/정보보호/L18 사람 13개 승인 전 main/Production 및 실 DB 변경 금지.

### L15·L21 후속 — 모바일 메뉴 열린 동안 배경 화면 원천 접근 차단 (21차, 2026-11-22)

- **20차 동일 HEAD 3종 실조회:** `7c3136c268ff27f122e28c4cf25cd26518ac3215` release #44996840505 **SUCCESS**(278개 파일, **2,179/2,179** 단위, 신규 반응형 6/6, L15 3/3, L17 19/19), company Chromium #44996840520 **SUCCESS**(제품간 시나리오 **11/11**, 품질 현황 Chromium **24/24**: 390→1200px focus/scroll 복구 포함), Inspector 모바일 Chromium #44996840499 **SUCCESS**. 이들은 합성 자동화 QA이며 실제 Android/삼성 인터넷/스크린리더/운영 데이터 인수는 아님.
- **21차 소스 결함:** `components/Layout.tsx` 모바일 전체메뉴에 `role="dialog"`, `aria-modal="true"`, Tab trap 및 body scroll lock이 있으나 **배경 자체를 `inert` 처리하지 않았음**. 사용자의 터치·보조기기 가상 탐색·스크립트 직접 focus는 배경으로 이동할 여지가 있어 실제 모달과 접근성 의미가 불일치할 수 있다.
- **구현:** `components/shell/AppShell.tsx`의 선택 prop `mobileDialogOpen`을 `Layout`의 `isMobileMenuOpen`에 연동. 메뉴가 열리면 **뒤쪽 topbar+본문+하단 탐색 container**, 숨겨진 데스크톱 sidebar 및 `본문으로 바로가기` skip link를 native HTML `inert`로 처리한다. 모바일 dialog 자체는 inert 영역 **밖**에 두어 작동하게 유지하고, 메뉴가 닫히거나 1024px 반응형 전환/Escape 시 React가 inert를 제거한다. 다른 메뉴 정렬·가시성/RBAC·스크롤 복구·사용자 데이터·PSI 위험 판정 무변경.
- **단위/통합 검증 목표:** `tests/psiMobileDialogInertBackground.test.ts` 신규 **5건**(실제 서버 렌더링 시 backdrop inert, skip-link/desktop inert, 닫기 해제, default 호환성, 실제 Layout 연결). 전체 Vitest **2,184개/279파일 목표**. 기존 Chromium QA `scripts/verify-psi-company-visibility-ui.mjs` 3검사 추가(모바일 열린 동안 background `inert`와 programmatic focus 차단, 1200px 전환 후 inert 해제, Escape 후 inert 해제) → **27개 목표**. 최종 동일 SHA 3종 CI 완료 전 PASS 주장 금지.
- **21차 1차 CI 수집 누락과 시정:** 후보 SHA `a0c13a8bc1768e147f1e194fef34c8a6aa0e2324` release #44997805138 은 **SUCCESS**였으나 전체 **2,179/2,179 (278파일)**로 20차와 동일. 원인 `vitest.config.ts`의 `include: ['lib/**/*.test.ts','tests/**/*.test.ts']` 규칙에서 새 `tests/psiMobileDialogInertBackground.test.tsx`가 수집되지 않은 것. **소스 계약이 실제 시험되지 않았으므로 1차 CI를 21차 테스트 PASS라고 처리하지 않음.** Vitest 설정을 확대하지 않고 새 파일을 `.test.ts`로 rename(동일 TypeScript 코드, JSX 문법 없음), 1차 파일 삭제. **최종 21차 2,184/279파일 시험 및 CI 새 SHA 결과 확인 필수.**
- **의미/한계:** inert를 DOM에 올린 **실행 가능 소스 변경**이며 `aria-modal`만 선언하는 것과 다르다. Chromium 합성시험만으로 Android TalkBack·삼성 인터넷·200% 확대·기기 회전·장갑 터치의 실제 보조공학 인수를 대신하지 않는다. Footer는 PC에서만 노출되는 비상호작용 저작권 문구이며 모바일 배경 상호작용 요소는 모달로 차단한다.
- **출시 경계:** L06 실제 인증 A01~A25 전부 `NOT RUN`, 승인된 독립 Supabase 없음. L18 사람 승인 13개 `pending`, `RELEASE=BLOCKED`. PR #237 Draft, `main`/Vercel Production/실 Supabase Auth·RLS·키·근로자 기록·migrations/외부발송 변경 0.

**다음 한 작업:** 21차 동일 HEAD release/company Chromium/Inspector 모바일 3종 CI 완결/실패 수리 → Android Chrome/삼성 인터넷 TalkBack·터치·회전 수동검증 및 승인된 독립 Supabase의 A01~A25 실제 Auth/RLS 테스트 → 개인정보·원어민·L18 13개 사람 인수와 소유자 승인 전 운영 연결/병합/배포 금지.

### L15·L22 후속 — 모바일 메뉴의 '페이지 선택'과 '닫기' 포커스 분기 (22차, 2026-11-22)

- **21차 CI 동일 SHA 실조회:** `49017e56ad27c59d98e01b39143f0b4f44bbd56a`의 release #44998077476 **SUCCESS**, company Chromium #44998077510 **SUCCESS**, Inspector 모바일 #44998077464 **SUCCESS**. 21차 3종 합성 브라우저/소스 검증 확정. Android·Samsung Internet·TalkBack 실기기/현장 승인과 다름.
- **발견:** 기존 `handlePageChange`가 모바일 메뉴를 닫는 경우에도 `Layout`의 cleanup은 닫기 버튼·Escape와 동일하게 기존 모바일 '더보기' opener에 초점을 복귀시킨다. 특히 **이미 활성화된 같은 메뉴를 다시 선택**하면 `currentPage`가 달라지지 않아 새 페이지 `useEffect`의 `main.focus`가 다시 실행되지 않고, 사용자가 요청한 콘텐츠가 아닌 메뉴 버튼에 포커스가 남을 수 있다.
- **22차 실제 소스 변경:** `components/Layout.tsx`에 `mobileMenuNavigatingRef`를 추가하여 모바일 메뉴에서 **페이지 선택**을 명시적으로 표시. drawer cleanup은 단순 닫기일 때 opener/desktop active-route 복구를 유지하되, 페이지 선택이면 inert 제거 뒤 다음 프레임에서 `#psi-main-content`에 `preventScroll` focus를 시행한다. 같은 페이지 재선택과 다른 페이지 전환 모두 대상. 메뉴 가시성, RBAC, 스크롤위치, 다른 제품·DB·API·데이터 처리 변경 0.
- **검증 추가:** `tests/psiMobileDialogInertBackground.test.ts` 정적 계약 1건(기존 5→6); `scripts/verify-psi-company-visibility-ui.mjs` 실제 Playwright 합성 시나리오 2건(현재 페이지 재선택/다른 페이지 전환; 메뉴 분리·포커스·inert 및 스크롤 해제). 진짜 Android 터치·스크린리더는 아직 미검증.
- **CI 판정:** 추가 검증을 반영한 **최종 22차 HEAD**의 릴리스·전사 Chromium·Inspector 모바일 3종 종료 결과를 **실조회하기 전에는 PASS로 기록하지 않는다**. 실패 시 검사나 동작의 원인을 고친 뒤 최종 SHA 재검증. 인계서 변경은 검증 성공을 뜻하지 않는다.
- **출시 경계:** PR #237 Draft 유지. `main`/Production/Supabase·근로자 데이터/외부 호출 무변경. L06 A01~A25 실제 Supabase Auth/RLS 인수 `NOT RUN`, L18 사람 인수 13건 `pending`, `RELEASE=BLOCKED`.

**다음 한 작업:** 최종 22차 HEAD 릴리스/회사형 Chromium/Inspector 모바일 3종 결과 확인·실패 시 보수 → 미검증 Android Chrome/삼성 인터넷·TalkBack 수동 QA 및 별도 승인된 Supabase A01~A25 실제 인증 인수 → 11개 언어/보유·삭제/현장 UAT·L18 승인 완료 전 운영 병합·배포 금지.

### L15·L23 후속 — QuickFind 모달 배경 비활성화 및 검색 선택 포커스 인계 (23차, 2026-11-22)

- **22차 최신 결과 재조회:** `b9dcab577bd73a439c8a738009039b54b73a4550`의 release #44998832699 **SUCCESS**, company Chromium #44998832695 **SUCCESS**. Inspector #44998832710은 23차 후속 push로 **CANCELLED**. 따라서 22차 **동일 SHA 3종 전부 SUCCESS는 아님**, 테스트 실패와 취소를 구별한다. 21차 최종 HEAD `49017e56`의 3종 SUCCESS는 앞 절에 별도 기록되어 있다.
- **확인된 접근성 위험:** `components/shell/NavigationQuickFind.tsx`는 `aria-modal="true"` 및 Tab 순환·스크롤 잠금이 있었지만, 화면 본문 자체는 `inert`가 아니었다. 실기기 보조기기/프로그램 포커스가 **뒤쪽 앱 버튼을 접근 가능**하게 취급할 가능성이 있고, 검색 결과에서 현재 페이지를 선택할 때 Escape와 동일하게 검색 열기 버튼으로 포커스를 되돌리는 문제가 있었다.
- **23차 실제 구현:** QuickFind는 모달을 `document.body`에 portal로 유지하고, 열릴 때 기존 앱 `#root`에 native `inert=true`를 설정한다. 닫을 때 과거 `inert` 값을 복구한다. 검색 결과 선택 시에만 `navigatedRef`를 통해 복구 포커스를 `#psi-main-content`로 전환(같은 페이지 재선택 포함), Escape/닫기에서는 이전에 보이던 검색 트리거로 복귀. 기존 검색 대상은 접근권한/운영모드/사용자 숨김 설정을 통과한 **메뉴 항목만**; 검색 기록/실근로자 데이터 전송·저장·로그 없음.
- **검증 범위 추가:** `scripts/verify-psi-l15-accessibility.mjs`의 Chromium 각 viewport 8조건에서 portal이 앱 외부인지, `#root.inert`, 실제 QuickFind 트리거 강제 focus 차단, 모달 내부 입력/Tab 동작, Escape 직후 inert·scroll/focus 복원을 검사. 390×844에서 현재 페이지 검색 선택 → 본문 초점/배경 복원도 확인. `tests/psiNavigationQuickFind.test.ts`에 소스 계약 회귀 1건 추가. **실 Android/Samsung Internet/TalkBack 또는 실제 200% 확대 증명은 아님.**
- **최종 품질판정 주의:** 23차 최종 SHA의 릴리스/전사 Chromium/Inspector CI 3종을 새로 조회해 완료 전에 PASS라고 쓰지 않는다. 오류 발생 시 로그 기반 수리·재검증. 이 문서/PR 설명 갱신만으로 통과 증빙 생성 금지.
- **범위·보안:** NEW-PSI 관리자 UI만 변경, SMART TBM/ZERO DAY 제외. `main`, Production, Supabase 스키마/RLS/Auth·실현장/근로자 개인정보, 유료 AI/OCR·외부 발송 0. L06 별도 Supabase Auth A01~A25는 **NOT RUN**, L18 13개 사용자/실기기/정보보호 인수는 **pending**, `RELEASE=BLOCKED`, PR #237 Draft.

**다음 한 작업:** 23차 최종 동일 HEAD release/company Chromium/Inspector 모바일 3종 실제 결과와 스크린샷/실패 항목 확정 → 필요시 개발 브랜치 수정·동일 SHA 재검증 → 승인된 격리 Supabase A01~A25, Android Chrome/삼성 인터넷/TalkBack, 11개 모국어/A4·개인정보 보유·삭제/L18 13개 사람 인수 후에만 운영 반영 검토.

### L06·L24 후속 — 자기기입 Q1~Q5 연습 기록 A4 인쇄 공백 방지 (24차, 2026-11-22)

- **23차 CI 재조회:** HEAD `68eb1415bf040e08e1abfc20366108c82ce5e01c`의 release #44999382595 **SUCCESS**(279개 파일/2,186개 테스트, L17 19/19, L18 RELEASE=BLOCKED), 전사 Chromium #44999382605 **SUCCESS**. Inspector 모바일 #44999382570은 후속 24차 코드 push로 **CANCELLED**. 이 SHA의 3종 전체 PASS는 성립하지 않음.
- **실제 확인한 출력 결함:** `pages/WorkerRiskDraft.tsx`의 한국어 무인증·무저장 5문항 연습 화면은 '화면 인쇄' 버튼(`window.print()`)을 제공했으나, 공통 `styles.css`의 기존 `@layer base/@media print`가 `#root { display:none!important; }`를 적용한다. L06에는 보고서용 별도 `report-print-container`가 없어 브라우저 인쇄물이 **빈 페이지가 될 수 있는 구조**였다.
- **24차 최종 소스 구성:** `styles.css`의 기존 `@layer base`→`@media print` 안에서 오직 `#root:has(.psi-l06-worker-draft)`에 한해 print display 복구, A4 너비·10/12mm 여백, 질문 5개 답변·비공식 인쇄 경고만 출력. 진행표·버튼·상단 안내는 숨김. `WorkerRiskDraft.tsx`에는 scope class만 추가; Q3 판정·서버/스토리지 0 정책 불변. 기존 관리자 보고서 `#root` 비표시/별도 인쇄 컨테이너 로직 그대로. 초기의 개별 `pages/worker-risk-draft-print.css`는 Tailwind 빌드 실패로 삭제하고 기존 CSS에 통합했음.
- **실제 브라우저 검증 추가:** 기존 `scripts/verify-psi-l06-worker-draft.mjs`의 합성 근로자 5문항 검토 단계에서 print CSS visibility와 Chromium `page.pdf` A4 출력을 검사한다. `pdfjs-dist`로 PDF가 빈 문서가 아니며 Q1~Q5 텍스트를 포함한 **통상 길이 답변 1페이지**인지 확인. 출력물에 가짜 서버접수증/서명이 없고, 화면 문구 '인쇄한 종이도 정식 제출이 아닙니다'가 유지되어야 한다. 해당 PDF·JSON은 개인정보 없는 CI artifact이며 현장 서류가 아님.
- **24차 발견·시정한 CI 실패:** ① HEAD `7d0073c0` Inspector build #44999996141 **FAIL** — 독립 CSS 파일의 `@layer base`에 대해 Tailwind가 `@tailwind base` 없음을 에러 처리. 기존 `styles.css` 내부로 인쇄 규칙을 이동·독립 파일 삭제. ② HEAD `6f446f0a` company Chromium #45000158021 **FAIL** — 실제 PDF 생성/1페이지/Q1~Q5 텍스트 검사가 성공한 후, 테스트 전용 PDF 객체에 없는 `pdf.destroy()`를 호출해 TypeError 발생. 문제 호출 제거(`51a59c7b`). **최신 HEAD의 동일 SHA 전체 CI 종료 이전에는 성공 판정 불가.**
- **단위 계약:** `tests/psiWorkerRiskDraftL06.test.ts`에 기존 공통 보고서와의 CSS 분리, print 버튼/면책, 실제 PDF 생성 회귀를 소스 기준으로 추가. **최종 HEAD** 릴리스·전사 Chromium·Inspector CI 실행이 끝나기 전에는 PASS 확정 금지. Chromium PDF 1쪽 검사는 한국어 실제 프린터/Android 브라우저/A4 인쇄 드라이버 및 답변 최대길이 전체 조합의 1쪽 보증과 다르다.
- **변경 경계:** 실제 Q1~Q5 접수 API/서명/이수·작업허가, 실근로자 개인정보·RLS/GRANT/Auth·Supabase/migrations, Vercel Production/`main`, 외부 OCR/AI·과금·공유 기능 변경 없음. L06 A01~A25 실 Supabase 승인시험 **NOT RUN**, L18 13건 현장·실기기/원어민/보안 승인 **pending**, RELEASE=BLOCKED 및 PR #237 Draft 유지.

**다음 한 작업:** 최종 24차 동일 SHA 릴리스·전사 Chromium(실제 L06 PDF 검증 포함)·Inspector 모바일 3종 종료 확인 및 실패 시 실제 로그 기준 수정 → L06 실제 인쇄물 검수 및 승인된 독립 Supabase Auth/RLS A01~A25 시험, Android Chrome/삼성 인터넷·11개 모국어/A4/개인정보·L18 사람 인수 후 운영 반영 검토.

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

**L06·L24 A4 연습 기록 출력 5문항 PDF·공통 보고서 인쇄 비회귀, 24차 동일 HEAD CI 3종 최종 판정 → 승인된 별도 Supabase A01~A25와 Android/11개 언어 실기기·A4 인수 → L18 13개 사람·정보보호·제품 소유자 승인 전 main/Production/실 DB 연결 보류.**
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
