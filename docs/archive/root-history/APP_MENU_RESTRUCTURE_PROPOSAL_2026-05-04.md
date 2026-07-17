# APP MENU RESTRUCTURE PROPOSAL (2026-05-04)

- 목적: 현재 `App.tsx`의 `currentPage` 구조를 모바일 우선 / PC 후속 재편 전략에 맞춰 메뉴 단위로 재조직하는 기준안을 정의한다.
- 기준:
  - [MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md](MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md)
  - [CURRENT_PAGE_TO_PC_MENU_MAPPING_TABLE_2026-05-04.md](CURRENT_PAGE_TO_PC_MENU_MAPPING_TABLE_2026-05-04.md)
  - [PC_FUNCTION_RECLASSIFICATION_TABLE_2026-05-04.md](PC_FUNCTION_RECLASSIFICATION_TABLE_2026-05-04.md)

---

## 1) 현재 `currentPage` 목록
- `dashboard`
- `ocr-analysis`
- `worker-management`
- `predictive-analysis`
- `performance-analysis`
- `safety-checks`
- `site-issue-management`
- `reports`
- `feedback`
- `introduction`
- `individual-report`
- `admin-training`
- `worker-training`
- `safety-behavior-management`
- `safety-compliance-hub`
- `survey-intelligence`
- `settings`

---

## 2) 목표 구조

### 2-1. 모바일 1차 하단 탭
1. `홈`
2. `분석`
3. `리포트`
4. `근로자`
5. `더보기`

### 2-2. PC 1차 좌측 메뉴
1. 운영 대시보드
2. OCR 운영
3. AI 리스크 운영
4. 리포트/배포
5. 근로자/이력
6. 관리자/정책
7. 시스템 설정

---

## 3) 메뉴 개편 원칙
- `Page` 타입은 당장 대규모 삭제하지 않고 유지
- 1차는 **메뉴 노출 구조만 재정렬**
- 2차에서 `currentPage`를 묶는 상위 그룹(`navGroup`) 도입
- 모바일과 PC는 같은 페이지를 쓰되 진입 메뉴만 다르게 관리

---

## 4) 제안 상태 모델

### 4-1. 신규 상위 그룹 타입(제안)
```ts
 type NavGroup =
   | 'mobile-home'
   | 'mobile-analysis'
   | 'mobile-reports'
   | 'mobile-workers'
   | 'mobile-more'
   | 'pc-dashboard'
   | 'pc-ocr'
   | 'pc-risk'
   | 'pc-reports'
   | 'pc-workers'
   | 'pc-admin'
   | 'pc-settings';
```

### 4-2. 도입 목적
- 기존 `Page`를 깨지 않고 상위 메뉴를 재구성
- 모바일/PC에서 같은 페이지도 다른 진입 맥락 제공
- 추후 사이드바/탭바 분기 쉽게 구현

---

## 5) 실제 페이지 매핑 제안

| Page | 모바일 메뉴 | PC 메뉴 | 비고 |
| --- | --- | --- | --- |
| `dashboard` | 홈 | 운영 대시보드 | 모바일 메인 시작 화면 |
| `ocr-analysis` | 분석 | OCR 운영 | 모바일 1차 CTA 연결 |
| `predictive-analysis` | 분석 | AI 리스크 운영 | 모바일 핵심 화면 |
| `reports` | 리포트 | 리포트/배포 | 공통 유지 |
| `individual-report` | 리포트 | 리포트/배포 | 상세 진입 |
| `worker-management` | 근로자 | 근로자/이력 | 모바일/PC 공통 |
| `worker-training` | 근로자 또는 더보기 | 근로자/이력 | 모바일 참여 유지 |
| `survey-intelligence` | 분석(후순위) | AI 리스크 운영(보조) | 모바일 직접노출은 후순위 |
| `performance-analysis` | 더보기 | 운영 대시보드 | PC 중심 |
| `safety-checks` | 더보기 | 운영 대시보드 | PC 중심 |
| `site-issue-management` | 더보기 | 운영 대시보드 | PC 중심 |
| `safety-behavior-management` | 더보기 | AI 리스크 운영 | PC 중심 |
| `safety-compliance-hub` | 더보기 | 관리자/정책 | PC 중심 |
| `admin-training` | 더보기 | 관리자/정책 | PC 중심 |
| `feedback` | 더보기 | 시스템 설정 | 보조 기능 |
| `introduction` | 더보기 | 시스템 설정 | 가이드 |
| `settings` | 더보기 | 시스템 설정 | PC 중심 |

---

## 6) `App.tsx` 단계별 개편안

### Phase A. 노출 구조 개편
- 기존 `currentPage` 유지
- 모바일 하단 탭용 메뉴 배열 신설
- PC 좌측 메뉴용 그룹 배열 신설
- 메뉴 클릭 시 내부적으로 기존 `Page`로 이동

### Phase B. 그룹 메타 도입
- `PAGE_TO_GROUP` 매핑 상수 도입
- 활성 탭/활성 그룹 계산 분리
- 모바일/PC 네비게이션 공통 로직 정리

### Phase C. 세부 페이지 재정렬
- 모바일에서 직접 노출 불필요한 페이지는 `더보기` 이관
- PC 전용 보조 도구는 좌측 2depth 또는 유틸 패널로 이동

---

## 7) 추천 상수 구조

```ts
const MOBILE_PRIMARY_NAV: Array<{ key: string; label: string; defaultPage: Page }> = [
  { key: 'home', label: '홈', defaultPage: 'dashboard' },
  { key: 'analysis', label: '분석', defaultPage: 'ocr-analysis' },
  { key: 'reports', label: '리포트', defaultPage: 'reports' },
  { key: 'workers', label: '근로자', defaultPage: 'worker-management' },
  { key: 'more', label: '더보기', defaultPage: 'settings' },
];
```

```ts
const PAGE_TO_PC_MENU: Record<Page, string> = {
  'dashboard': 'pc-dashboard',
  'ocr-analysis': 'pc-ocr',
  'worker-management': 'pc-workers',
  'predictive-analysis': 'pc-risk',
  'performance-analysis': 'pc-dashboard',
  'safety-checks': 'pc-dashboard',
  'site-issue-management': 'pc-dashboard',
  'reports': 'pc-reports',
  'feedback': 'pc-settings',
  'introduction': 'pc-settings',
  'individual-report': 'pc-reports',
  'admin-training': 'pc-admin',
  'worker-training': 'pc-workers',
  'safety-behavior-management': 'pc-risk',
  'safety-compliance-hub': 'pc-admin',
  'survey-intelligence': 'pc-risk',
  'settings': 'pc-settings',
};
```

---

## 8) 우선 구현 순서
1. 모바일 탭 5개 고정
2. `dashboard / ocr-analysis / predictive-analysis / reports / worker-management / settings`를 1차 기준 페이지로 고정
3. 나머지 페이지를 `더보기` 또는 PC 그룹으로 후퇴 배치
4. PC 사이드바 그룹 설계 반영

---

## 9) 리스크
- 기존 메뉴 접근 습관과 달라질 수 있음
- 관리자 페이지를 모바일에서 너무 숨기면 반발 가능
- 따라서 1차는 제거가 아니라 `노출 우선순위 재정렬`로 가는 것이 안전

---

## 10) 다음 작업
1. `App.tsx` 기준 모바일 탭 정의 상수 초안 작성
2. `PAGE_TO_GROUP` 매핑 객체 초안 작성
3. `더보기` 화면의 하위 메뉴 목록 설계
4. PC 좌측 메뉴 와이어 초안 작성
