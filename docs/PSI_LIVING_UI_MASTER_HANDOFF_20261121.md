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

**L18 최신 HEAD 릴리스·전사 Chromium·Inspector QA 및 통합 출시 BLOCKED JSON 검증 → L06 직접 Q1~Q5 입력과 Android/모국어 A4·실 RLS/사용자 승인 미완료 해소 → 운영 승인 후에만 main/Production.**
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
