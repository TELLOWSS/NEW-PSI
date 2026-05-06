# MOBILE 3 CORE SCREEN IMPLEMENTATION CHECKLIST (2026-05-04)

- 목적: 모바일 우선 전략에서 핵심 3개 화면(Home/OCR/AI Risk)을 실제 구현 단계로 옮기기 위한 체크리스트를 정의한다.
- 대상 화면:
  - Home (`dashboard`)
  - OCR (`ocr-analysis`)
  - AI Risk (`predictive-analysis`)
- 기준 문서:
  - [MOBILE_HOME_ANALYSIS_OCR_DETAILED_IA_TABLE_2026-05-04.md](MOBILE_HOME_ANALYSIS_OCR_DETAILED_IA_TABLE_2026-05-04.md)
  - [MOBILE_SCREEN_WIREFRAME_COPY_DRAFT_2026-05-04.md](MOBILE_SCREEN_WIREFRAME_COPY_DRAFT_2026-05-04.md)
  - [MOBILE_3SCREEN_DETAILED_SPEC_2026-05-04.md](MOBILE_3SCREEN_DETAILED_SPEC_2026-05-04.md)

---

## 1) 공통 구현 체크
- [x] 하단 탭바 구조 고정
- [x] 모바일 헤더 높이/간격 공통화
- [x] CTA 버튼 스타일 공통화
- [ ] 카드 반경/패딩/그림자 토큰 통일
- [ ] 다크/혼합/라이트 테마 토큰 분리
- [ ] 320/360/375/390 뷰포트 기준 줄바꿈 확인
- [ ] 터치 타겟 44x44 이상 유지
- [ ] 색상 외 텍스트 라벨 병기
- [x] 기본 진입 페이지를 `dashboard`로 전환

---

## 2) Home (`dashboard`) 체크리스트

### 2-1. 구조
- [ ] 헤더에 로고/알림만 남기고 복잡 요소 제거
- [ ] 인사 문구 + 보조 문구 2줄 이내 정리
- [ ] KPI 카드 3개만 1차 노출
- [ ] 위험 분포 카드 1개로 요약
- [x] 최근 리포트 3건만 노출
- [x] `시작하기` CTA 고정
- [ ] `둘러보기`는 보조 CTA로 축소

### 2-2. 콘텐츠
- [ ] KPI 라벨 문구를 와이어 초안 기준으로 정리
- [ ] 증감 텍스트 축약
- [ ] 최근 리포트 제목 1줄 처리
- [ ] 상태칩 색상/텍스트 동시 제공

### 2-3. 상호작용
- [ ] KPI 카드 탭 시 상세 연결
- [ ] 위험 분포 탭 시 AI 리스크 이동
- [ ] 최근 리포트 카드 전체 탭 가능
- [x] `시작하기` 탭 시 OCR 이동

---

## 3) OCR (`ocr-analysis`) 체크리스트

### 3-1. 구조
- [ ] 히어로 아이콘/제목/보조 문구 재정렬
- [ ] 체크리스트 4항목 이내 유지
- [ ] 파일 선택 상태 영역 단순화
- [ ] 하단 고정 CTA 유지
- [ ] 실패 상태에서 `재시도`/`수동 입력`만 노출

### 3-2. 콘텐츠
- [ ] 안내 문구를 와이어 초안 기준으로 정리
- [ ] 권한 오류 문구 1줄 우선 적용
- [ ] 형식 오류/실패 문구 분리
- [ ] 진행 상태 텍스트 간단화

### 3-3. 상호작용
- [ ] 파일 선택 전 CTA 비활성
- [ ] 파일 선택 후 CTA 활성
- [ ] 분석 중 중복탭 방지
- [ ] 실패 시 재시도 동선 노출
- [x] 성공 시 AI 리스크 또는 결과 보기 이동 연결

---

## 4) AI Risk (`predictive-analysis`) 체크리스트

### 4-1. 구조
- [ ] 제목/보조 문구 상단 정리
- [ ] 점수 게이지 중앙 배치
- [ ] Red/Yellow/Green 카드 3개 고정
- [x] 액션 리스트 3개만 1차 노출
- [ ] 필요 시 `조치 시작` CTA 추가

### 4-2. 콘텐츠
- [ ] 점수 라벨/보조 라벨 명확화
- [ ] 위험군 카드 숫자/이름 정리
- [ ] 액션 리스트 제목 통일
- [ ] 결과 없음/지연/오류 문구 분리

### 4-3. 상호작용
- [ ] 위험군 카드 탭 시 상세 이동
- [x] 경향 분석 탭 시 추세 보기
- [x] 개별 점검 영역 탭 시 우선 대상 보기
- [x] AI 인사이트 탭 시 요약 보기
- [ ] 재계산/재시도 버튼 조건 분기

---

## 5) 구현 순서 제안
1. 공통 토큰 정리
2. Home 구조 고정
3. OCR 구조 단순화
4. AI Risk 구조 직관화
5. 하단 탭 연결 완료
6. 문구 치환
7. 실측 QA

---

## 6) 완료 기준
- [ ] 3개 화면 모두 첫 행동 1탭 도달 가능
- [ ] 핵심 정보 1스크롤 내 노출
- [ ] 4개 뷰포트에서 레이아웃 붕괴 없음
- [ ] QA 문서와 실제 화면 불일치 없음
- [ ] 빌드/테스트 재통과

---

## 7) 다음 작업
1. 실제 컴포넌트 단위 TODO 분해
2. Home → OCR → AI Risk 이동 흐름 실제 연결 검증
3. 320/360/375/390 실측 캡처 확보
4. 구현 후 QA FORM 재측정

---

## 8) 실행 스냅샷 (2026-05-04)

### 완료(코드 반영)
- [x] Home(`dashboard`) 모바일 `essential` 자동 강제 적용
- [x] OCR(`ocr-analysis`) 모바일 보조정보/운영도구 기본 접힘 적용
- [x] AI Risk(`predictive-analysis`) 모바일 심화 패널 기본 접힘 적용
- [x] 빌드 재검증 통과 (`npm --prefix "C:\Users\user\OneDrive\Desktop\개발실\new-psi\NEW-PSI" run build`)

### 완료(코드 반영) — Phase 2.5 추가 (2026-05-04)
- [x] Home(`dashboard`) 모바일 `audienceQuickGuide` 3개 가이드 카드 `isEssentialMobile` 조건으로 숨김
- [x] Home(`dashboard`) 모바일 데이터 안내 바 `isEssentialMobile` 조건으로 숨김
- [x] Home(`dashboard`) 모바일 `overviewStatCards` 4개 중복 stat카드 `isEssentialMobile` 조건으로 숨김
- [x] Home(`dashboard`) 모바일 미식별 데이터 경고 버튼 `isEssentialMobile` 조건으로 숨김
- [x] OCR → AI 리스크 분석 완료 후 고정 CTA "AI 리스크 분석 결과 보기 →" 연결 (Phase 2)
- [x] AI Risk(`predictive-analysis`) 모바일 핵심 액션 버튼 3종(`경향 분석`/`개별 점검 영역`/`AI 인사이트`) `min-h-[44px]` 적용
- [x] AI Risk(`predictive-analysis`) 모바일 `온톨로지 맵 보기/숨기기` 토글 `min-h-[44px]` 적용
- [x] OCR(`ocr-analysis`) 분석 후 보조 CTA `닫기` 버튼 `min-h-[44px]` 적용
- [x] Home(`dashboard`) 모바일 최근 리포트 카드 신설(최신 3건 노출) + `reports` 이동 동선 연결
- [x] Phase 3 PC 운영 바로가기( Predictive/Reports/Settings ) 클릭 계측 반영 (`trackUIViewMetric` + `panel: pc_quick_actions`)
- [x] Settings(`settings`) `UI 모드 실험 KPI 요약`에 `pc_quick_actions` 클릭 Top5 요약 패널 추가(총 클릭/액션 종류/최근 시각)
- [x] Top5 하위 3액션 1차 미세조정 + 추이비교 태그(`uiVariant=v2-lowfreq-tuning-1`) 반영
- [x] Settings KPI에 `v2` 일간 추이 자동 계산(오늘/어제/증감 건·%) 반영
- [x] `open_beginner_guide` 2차 보정(v3): 선행 배치 + 라벨 `빠른 시작 가이드` + v2/v3 비교행 반영
- [x] `open_beginner_guide` v3 카피 A/B 실험(세션 해시 분기) + A/B 집계행 반영
- [x] `open_beginner_guide` 1일 관찰 기준 승자 자동 고정(24h 표본·격차 기준, lock key 저장) 반영
- [x] 빌드 재검증 통과 (`built in 7.02s`)

### 완료(증적/QA) — 2026-05-04 확정
- [x] 320/360/375/390 × nav/dashboard/ocr/predictive 캡처 16건 수집 (`artifacts/mobile-qa/2026-05-04/`)
- [x] `check:mobile-qa:evidence` → `READY_FOR_FINALIZATION` (16/16)
- [x] `qa:mobile:refresh` → 문서 동기화 완료
- [x] `check:mobile-qa:evidence:report` → `reports/mobile-qa-evidence-status.md` 생성
- [x] `qa:mobile:finalize` → `RESULT=FINALIZED_PASS` ✅

---

## 9) 미구현 검증 결과 + 순차 실행 백로그 (2026-05-04)

### 9-1. 코드 대조로 재확정된 구현 완료 항목
- Home 최근 리포트 3건 제한 / `시작하기` 고정 CTA / OCR 이동 동선
- OCR 분석 완료 후 AI 리스크 결과 보기 동선
- AI Risk 액션 3종(경향/개별 점검/AI 인사이트) 1차 노출 및 동작

### 9-2. 현재 미구현(우선순위 순)
1. [x] 카드 반경/패딩/그림자 토큰 통일
2. [x] OCR/AI Risk 결과 없음·지연·오류 문구 분리 정비
3. [x] AI Risk 재계산/재시도 버튼 조건 분기 정식화

### 9-2.1. 반영 후 현재 상태
- 핵심 3화면(Dashboard/OCR/Predictive)의 공통 카드 스케일을 shared card token 기준으로 정렬
- OCR/Predictive의 빈 상태 문구를 `대상 없음` / `데이터 부족` / `이력 없음` 중심으로 분리
- Predictive 상단에 `AI 리스크 재계산` / `상태 동기화 재시도` 제어 패널을 추가하고 `idle/loading/success/error` 분기 적용

### 9-4. 순차 실행 로그 — 2순위 완료 (2026-05-04)
- 반영: Dashboard/OCR/Predictive 핵심 모바일 CTA를 `min-h-[48px] + rounded-2xl + px-4 py-3 + transition-colors + active:scale-[0.99]` 스케일로 공통화
- 범위: Dashboard `시작하기`, OCR `분석 시작`/`AI 리스크 분석 결과 보기`, Predictive 모바일 토글 CTA(`온톨로지 맵 보기/숨기기`, `심화 분석 패널 펼치기/접기`)
- 검증: `npm run build` PASS (`built in 5.24s`), `check:mobile-qa:evidence` → `READY_FOR_FINALIZATION`

### 9-5. 순차 실행 로그 — 3순위 완료 (2026-05-06)
- 반영 1: `components/shared/cardTokens.ts` 신설 후 `InterpretationCardGrid` / `SummaryMetricGrid` / `ControlPanelCard` / `toneVariants`에 공통 카드 토큰 연결
- 반영 2: OCR/Predictive 빈 상태 문구를 `대상 없음` / `데이터 부족` / `이력 없음` / `동기화 실패` 기준으로 분리 정비
- 반영 3: Predictive 상단에 `AI 리스크 재계산` / `상태 동기화 재시도` 버튼 추가, 관리자 인증/데이터 존재/동기화 상태 기준 분기 정식화
- 검증: VS Code Problems 기준 변경 파일 오류 없음 + `npm run build` PASS(`built in 6.57s`) + `check:mobile-qa:evidence` `READY_FOR_FINALIZATION` + `qa:mobile:finalize` `FINALIZED_PASS`

### 9-3. 순차 실행 규칙
- 한 번에 1개 항목만 반영
- 각 항목 종료마다 `npm run build` + `npm run check:mobile-qa:evidence` 재검증
- 체크리스트 [ ] → [x] 변경 + 실행 스냅샷 3줄 기록(완료/다음/검증)
