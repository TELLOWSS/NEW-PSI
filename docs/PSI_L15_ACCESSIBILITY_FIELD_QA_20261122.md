# L15 · NEW-PSI Living UI 접근성·반응형 1차 검증

> 기준 2026-11-22 · GitHub Draft PR #237 개발 브랜치. 실제 현장 관리자·근로자 실사용 적합성, WCAG 전체 인증, 실기기 검증 및 운영 배포 승인 아님.

## 기존 코드 감사와 발견

1. 모바일 전체 메뉴 `components/Layout.tsx`의 Tab 포커스 트랩은 `hidden` 속성/직접 `aria-hidden`만 검사하여 CSS `display:none` 요소를 걸러내지 못할 수 있다. 또한 초점이 외부로 변경되면 대화상자 내부로 강제 복귀하는 경계가 없다. 열림/닫힘 효과는 닫힌 상태에서 이전 문서 `overflow` 값을 임의로 비우고, 예약한 `requestAnimationFrame`을 취소하지 않았다.
2. 관리자 메뉴 빠른 찾기 `NavigationQuickFind.tsx`의 검색 입력은 placeholder만 있고 명시적 접근성 이름이 없다. 짧은 세로 화면에서 팝업 높이가 화면을 초과할 여지가 있으며, 36px 닫기 버튼은 44px 검수 기준보다 작다. 검색 결과 화살표 이동 시 활성 선택지가 스크롤 밖에 남을 수 있다. 팝업 뒤 문서 스크롤도 제한하지 않았다.
3. 메인 앱 셸은 `h-screen`(100vh)으로 모바일 브라우저 동적 도구 막대 표시/숨김 변화 시 실높이 불일치 가능성이 있다. 단, 전용 `/field-local/`은 별개의 파일럿이며 건드리지 않는다.
4. 종전 Chromium 전사 검증은 320/390/768/1440px의 일부 업무를 점검하지만 명시적 검색/모바일 메뉴의 Tab·ShiftTab·Escape·짧은 화면·초점 복귀·기기 DPR2 리플로우를 전부 검사하지 않았다.

## 구현 범위와 수용 기준

- `components/Layout.tsx`: 모바일 메뉴 초점을 실제 렌더링된 포커스 가능 요소로만 제한. 화면 외부에 초점이 이동하면 Tab 시 다이얼로그 안으로 복귀. 이전 overflow 복원, 예약 초점 취소, Escape 및 닫기 후 기존 열기 버튼에 초점 복귀. 메뉴/역할/데이터 변경 없음.
- `components/shell/NavigationQuickFind.tsx`: 검색어 입력 접근성 레이블, 44px 닫기·결과 버튼, 작은 높이에서 스크롤 가능하고 최대 100dvh 내 팝업, 결과 키보드 이동 시 활성 항목 노출, 배경 스크롤 잠금/복원, 이탈 시 포커스 재진입. 여전히 로컬 메뉴 카탈로그만 검색하고 실제 위험·사진·개인정보 검색 또는 전송 없음.
- `styles/psi-living-motion.css`: 운영자 AppShell만 `100dvh` 지원 시 적용. 비지원 브라우저는 기존 `h-screen` 유지, 인쇄 시 자동 높이. 기존 저동작 모션 정책과 다크 테마·FIELD CANVAS 유지.
- `tests/psiL15AccessGuard.test.ts`: 소스 회귀 계약. `scripts/verify-psi-l15-accessibility.mjs`: 합성 Chromium 320/360/390 낮은 높이/390 다크/640 DPR2 리플로우 대리/768/1280 다크/1440에서 팝업 영역·포커스 트랩·복귀·숨김 항목·문서 가로 넘침·저동작·다크 상태·런타임 오류 확인.
- `.github/workflows/psi-company-wide.yml`: 기존 전사 브라우저 검증 뒤 L15 독립 시나리오 자동 실행 및 결과 JSON·스크린샷 저장. 기존 QA 삭제/완화 금지.

## 검증 한계 / 실제 현장 확인 항목

- [ ] 최신 HEAD `npm run verify:ci` PASS, `PSI company-wide cross-department verification` PASS 및 Inspector 모바일 QA 결과 확인 (각 SHA별).
- [ ] 200% **실제 브라우저 확대**(컴퓨터 Chrome/Edge Ctrl+plus, 모바일 글꼴 확대)에서 수평 넘침, 메뉴 탐색 및 버튼 보존. **640px + DPR2는 확대/리플로우 대리이며 200% 실제 zoom 테스트가 아님**.
- [ ] 한국어·중국어·베트남어·캄보디아어·미얀마어·태국어·몽골어 등 원문/번역 문장 길이, 200% 자간/행간, PDF/A4 인쇄 글꼴 깨짐 및 의미. 자동 테스트가 모국어 자연스러움을 보증하지 못함.
- [ ] Samsung Android Chrome/삼성 인터넷, iOS Safari, PC 스크린리더·VoiceOver/TalkBack의 포커스 안내, 모달 닫기·복귀.
- [ ] 실제 역할별 숨김 메뉴·권한 경계와 현장 실제 미조치/교육/사진 기록을 사용한 독립 UAT. 실자료를 자동테스트에 사용하지 말 것.
- [ ] 위험성평가 5문항 근로자 직접 작성·제출(L06), L08 오프라인 실제 기기 복구, L10 A4·교육 전달 검수는 여전히 미완료.

**판정:** 위 변경이 브랜치에 저장되면 L15 부분 **IMPLEMENTED**. 실행 증거가 나온 자동 범위만 VERIFIED로 분리; 실제 기기·원어민·완전 접근성·배포는 미확인. 사용자 최종 승인 전 main/Production 미반영.

**다음:** 최신 HEAD CI 실패시 원인 수정 및 재실행 → L15 실기기·200% 확대/스크린리더 검증 잔여 기록 → 독립 진행 가능한 L16 통신 음영·저속망·용량·배터리 성능 계측 및 개인정보/외부 호출 불증가 점검.
