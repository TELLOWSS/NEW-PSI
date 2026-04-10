# NEXT SESSION HANDOFF · 2026-04-09

## 1) 현재 작업 상태
- PSI 브랜드/UX 원칙은 제품 전반에 반영된 상태입니다.
- 특허 패키지 정렬 작업은 완료되었습니다.
- 주요 페이지 단위의 해석 중심 UX 전개도 대부분 완료되었습니다.
- 최근 작업은 **공통 컴포넌트 레이어 정리**에 집중했습니다.

## 2) 이번 세션에서 완료한 핵심 사항
### 공통 컴포넌트
- `components/shared/InterpretationCardGrid.tsx`
  - 요약형 `지금 상태 / 판단 근거 / 다음 행동` 카드 공통화 기반
- `components/shared/StatusEvidenceActionPanel.tsx`
  - 인라인/행 단위 `지금 상태 / 판단 근거 / 다음 행동` 패널 공통화
  - 문자열뿐 아니라 `content`를 통해 배지/보조 UI도 삽입 가능하도록 확장 완료
- `components/shared/SummaryMetricGrid.tsx`
  - 운영 대시보드/이력 화면의 단순 수치 카드를 공통 렌더링하는 메트릭 카드 그리드
- `components/shared/ControlPanelCard.tsx`
  - 필터/정렬/보조 컨트롤 영역의 반복 래퍼를 공통 렌더링하는 컨트롤 카드
- `components/shared/ActionButton.tsx`
  - 반복되는 소형 액션 버튼의 톤과 기본 레이아웃을 공통 렌더링하는 버튼 컴포넌트
  - `slateSolid` / `indigoSolid` / `emeraldSolid` variant를 추가해 모달 상단/확정 액션도 공통 처리
  - `glassDark` variant를 추가해 다크 모달 상단 액션도 공통 처리
- `components/shared/StatusBadge.tsx`
  - 반복되는 소형 상태/우선순위/라벨 배지의 톤을 공통 렌더링하는 배지 컴포넌트
  - `glassDark` / `slateDarkSoft` variant를 추가해 다크 미리보기 영역 배지도 공통 처리
- `components/shared/SectionPanelCard.tsx`
  - 차트/요약 섹션의 제목·설명·본문 래퍼를 공통 렌더링하는 패널 카드
  - `eyebrow`, `headerAction` props를 추가해 헤더 배지/액션 정렬을 공통 처리하도록 확장
  - `variant` props를 추가해 반복되는 패널 컨테이너 톤을 shared tone 상수와 연결
  - `indigo` / `sky` / `indigoSoft` / `cyanSoft` / `fuchsiaSoft` / `skySoft` accent preset을 추가해 비교/업무 흐름 패널 클래스 중복을 추가 축소
  - `roseDarkSoft` / `emeraldDarkSoft` preset을 추가해 다크 테마 빠른 실행 액션 그룹도 공통 패널로 정리
  - `glassDark` preset을 추가해 다크 테마 빠른 실행 바깥 래퍼도 공통 패널로 정리
  - `indigoGradientSoft` preset을 추가해 메시지 이력 인디고 그라데이션 래퍼도 공통 패널로 정리
- `components/shared/OperationalPreviewCard.tsx`
  - 재발송 큐/운영 상세 카드의 헤더·본문·푸터·액션 구조를 공통 렌더링하는 프리뷰 카드
  - `eyebrow`, `leading`, `headerClassName` 계열 props를 추가해 복합 카드 헤더 오버라이드를 축소
  - `variant` props를 추가해 반복되는 카드 컨테이너 톤을 shared tone 상수와 연결
  - `roseSoft` preset을 추가해 실패 미리보기 카드의 경고 톤 래퍼를 공통 처리
  - `slateSoft` preset을 추가해 체크리스트/보조 운영 카드의 중성 톤 래퍼를 공통 처리
  - `emeraldSoftCompact` / `roseSoftCompact` preset을 추가해 중복 그룹 보존/삭제 후보 하위 카드도 공통 처리
- `components/shared/NoticeCallout.tsx`
  - 반복되는 안내/경고/정보 박스를 공통 렌더링하는 콜아웃 카드
  - `variant`, `eyebrow` props를 추가해 톤별 스타일/상단 라벨 오버라이드를 축소
  - `glassDark` variant를 추가해 다크 보조 메모/정합성 안내도 공통 처리
- `components/shared/TableStateRow.tsx`
  - 테이블의 로딩/빈 상태/오류 행을 공통 렌더링하는 상태 행 컴포넌트
- `components/shared/EmptyStatePanel.tsx`
  - 비테이블 빈 상태/안내 화면을 공통 렌더링하는 빈 상태 패널
  - `variant` props를 추가해 기본/화이트/에메랄드 톤 오버라이드를 축소
- `components/shared/WhyThisResultPanel.tsx`
  - 결과 해설용 상세 리스트/빈 상태 섹션을 공통 렌더링하는 패널 초안
  - `children` 슬롯을 추가해 상세 해설과 보조 패널을 함께 구성 가능하도록 확장
- `components/shared/NextActionChecklist.tsx`
  - 후속 행동 체크리스트 리스트/빈 상태를 공통 렌더링하는 체크리스트 초안
- `components/shared/toneVariants.ts`
  - `NoticeCallout` / `EmptyStatePanel` / `SectionPanelCard` / `OperationalPreviewCard`가 공유하는 톤 variant 네이밍과 스타일 상수

### 공통 패널 적용 완료 화면
- `pages/SiteIssueManagement.tsx`
- `pages/FieldSafetyComplianceHub.tsx`
- `pages/WorkerManagement.tsx`
- `pages/OcrAnalysis.tsx`

### 비-페이지 공통화 추가 반영
- `components/modals/RecordDetailModal.tsx`
- `components/modals/WorkerHistoryModal.tsx`
- `components/Layout.tsx`
- `components/Sidebar.tsx`
- `components/AdminLockScreen.tsx`
- `components/AuthGateway.tsx`
- `components/charts/WorkerTrendPanel.tsx`
- `components/ReportTemplate.tsx`

### 이번 세션 추가 반영
- `pages/WorkerManagement.tsx`
  - 운영 메시지 대시보드 요약 카드, 발송 이력 요약 카드를 `SummaryMetricGrid`로 정리
  - 등록 근로자 검색/필터, 메시지 이력 검색/필터 영역을 `ControlPanelCard`로 정리
  - 운영 메시지/이력 차트 패널의 제목·설명·본문 래퍼를 `SectionPanelCard`로 정리
  - 재발송 큐 행 카드와 발송 방식 상세 카드를 `OperationalPreviewCard` 기반으로 정리
  - API 절약 모드의 소형 수치 블록도 `SummaryMetricGrid` + `SectionPanelCard`로 정리
  - 좌측 근로자 선택 목록 카드도 `OperationalPreviewCard` 기반으로 정리
  - 상단 안내/경고 박스와 운영 집계 준비 안내를 `NoticeCallout`으로 정리
  - 등록 근로자 목록 상단의 중복/그룹 요약 3칸도 `SummaryMetricGrid`로 정리
  - 사진 등록 최적 작업 모드와 사진 미등록자 빠른 등록 큐를 `SectionPanelCard` + `OperationalPreviewCard` 기반으로 정리
  - 전화번호 연동 안내, 운영 집계 오류/로딩, 개인 문자 이력 오류/스키마 안내도 `NoticeCallout`으로 정리
  - 중복 그룹 미리보기와 재발송 우선순위 가이드도 `SectionPanelCard` + `OperationalPreviewCard` 기반으로 정리
  - 선택 근로자 리포트 일괄 문자 발송 영역을 `SectionPanelCard` 기반으로 정리
  - 재발송 큐의 `QUICK RETRY` 안내와 API 절약 모드 안내도 `NoticeCallout`으로 추가 정리
  - 삭제 실행 취소 박스와 중복 그룹 내부 보존/삭제 후보 하위 카드도 shared component로 추가 정리
  - 메시지 이력 영역 바깥 인디고 그라데이션 컨테이너도 `SectionPanelCard` 기반으로 정리
  - 메시지 이력 상단 액션 버튼 일부도 `ActionButton` 기반으로 정리
  - 사진 필요/우선순위/차단 원인/중복 그룹 라벨 배지도 `StatusBadge` 기반으로 정리
  - 문자 이력/등록 근로자 테이블의 로딩·빈 상태·오류 행을 `TableStateRow`로 정리
  - 인쇄/플립 미리보기, 재발송 큐 빈 상태, 문자 이력/좌측 목록 빈 상태를 `EmptyStatePanel`로 정리
  - 직접 등록 패널과 재발송 큐 래퍼를 `SectionPanelCard` 기반으로 정리
  - 빠른 등록 큐/중복 그룹/재발송 큐 카드 일부를 `OperationalPreviewCard`의 확장 props로 단순화
  - 안내/오류 콜아웃 일부를 `NoticeCallout`의 `variant` / `eyebrow` 기반으로 단순화
- `pages/OcrAnalysis.tsx`
  - 레코드 행 내부 `지금 상태 / 판단 근거 / 다음 행동` 미니 블록을 `StatusEvidenceActionPanel`로 통일
  - 최근 24시간 운영 조치 카드의 상세 설명 블록도 공통 패널 사용으로 정리
  - 고급 필터/정렬 영역의 반복 컨트롤 카드를 `ControlPanelCard`로 정리
  - 실패 상세 조치 섹션과 2차 재분석 대상 미리보기 영역을 `SectionPanelCard` / `OperationalPreviewCard`로 정리
  - 최근 재분석 결과 숫자 블록을 `SummaryMetricGrid` 기반으로 정리
  - 상단 운영 현황 요약 4칸과 다크 테마 재분석 진단 5칸도 `SummaryMetricGrid` 기반으로 정리
  - 실패 카드/체크리스트의 소형 액션 버튼 일부도 `ActionButton` 기반으로 정리
  - 실패 미리보기 에러 타입 배지도 `StatusBadge` 기반으로 정리
  - `components/modals/RecordDetailModal.tsx`
    - 역량 지표 카드 점수 배지를 `StatusBadge` 기반으로 정리
    - 모바일 상단 액션, 승인/보완 버튼, 증빙 내보내기 버튼 일부를 `ActionButton` 기반으로 정리
  - `components/modals/WorkerHistoryModal.tsx`
    - 안전 수준/역할/특수 임무 배지를 `StatusBadge` 기반으로 정리
    - 상세 보기/저장/삭제 버튼을 `ActionButton` 기반으로 정리
    - 이력 목록 카드와 빈 상태를 `OperationalPreviewCard` / `EmptyStatePanel` 기반으로 정리
    - 선택 기록 요약과 수정 섹션을 `SectionPanelCard` / `SummaryMetricGrid` 기반으로 정리
  - `pages/Dashboard.tsx`
    - 역할별 보기 상태(`근로자` / `관리자` / `경영진`)를 추가해 dashboard 해석 기준을 분리
    - role-aware 요약 카드와 인사이트 문구를 도입해 1차 view model 분리 기반을 마련
    - 역할별 통계 카드/빠른 실행/공종 비교 해설을 분기하고 근로자 관점에서 식별 불가 데이터 배너를 숨겨 노출 순서 차등화를 확장
    - 운영 포커스 카드, 하단 차트 배치 순서, 모바일 비교 탭/비교 안내 문구를 역할별로 다시 분기해 하단 분석 영역까지 role-aware 구조를 확장
  - `components/Layout.tsx`
    - 상단 특허출원/유무료 API 상태 배지를 `StatusBadge` 기반으로 정리
  - `components/Sidebar.tsx`
    - 브랜드 헤더 특허출원 배지를 `StatusBadge` 기반으로 정리
  - `components/AdminLockScreen.tsx`
    - 관리자 진입 CTA를 `ActionButton` 기반으로 정리
  - `components/AuthGateway.tsx`
    - 본인 확인 CTA를 `ActionButton` 기반으로 정리
  - `components/charts/WorkerTrendPanel.tsx`
    - 요약 수치 블록을 `SummaryMetricGrid` 기반으로 정리
    - 필터/페이지 상태 배지와 액션 버튼 일부를 `StatusBadge` / `ActionButton` 기반으로 정리
    - 빈 상태를 `EmptyStatePanel` 기반으로 정리
    - 상세 `TrendModal` 상단 수치/기록 부족 상태도 `SummaryMetricGrid` / `EmptyStatePanel` 기반으로 정리
  - `components/ReportTemplate.tsx`
    - 부록 헤더/검증 라벨 배지를 `StatusBadge` 기반으로 정리
    - 강점/보완 상세 섹션을 `WhyThisResultPanel` 기반으로 정리
    - 전면 `현장 실천 체크` / `Action checklist`를 `NextActionChecklist` 기반으로 정리
    - `Formal score reasoning` / `Action coaching` 섹션도 `WhyThisResultPanel` 기반으로 정리
    - 재평가 이력 패널을 `WhyThisResultPanel` 기반으로 정리
    - 진위 메모 패널을 `NoticeCallout`의 `glassDark` variant 기반으로 정리
  - `components/modals/RecordDetailModal.tsx`
    - 조치 이력 추가와 문서 이미지 업로드 CTA를 `ActionButton` 기반으로 추가 정리
    - 문서 원본 다크 영역 라벨/파일명/문서 등록 버튼과 문항 배지를 `StatusBadge` / `ActionButton` 기반으로 추가 정리
    - 승인 가이드/경고/입력 안내 상태 박스를 `NoticeCallout` 기반으로 추가 정리
    - 모바일 작업 순서 안내를 `SectionPanelCard` + `NextActionChecklist` 기반으로 정리
    - 검토 상태/승인 상태/원문 비교 수치 칩을 `SummaryMetricGrid` 기반으로 정리
    - 판단 체크포인트/AI 해석 검토/감사·재평가 이력 패널을 `WhyThisResultPanel` 기반으로 정리
    - 사진 등록 자동 진행/추가 확인 안내를 `NoticeCallout` 기반으로 추가 정리
    - 프로필 등록/기본 정보/판단·조치 입력 카드 래퍼를 `SectionPanelCard` 기반으로 추가 정리
    - AI 해석 textarea 카드와 원문 비교 문항 카드를 `SectionPanelCard` / `OperationalPreviewCard` 기반으로 추가 정리
  - 재분석 상세 비교 내부의 인사이트/내용/OCR 비교 래퍼를 `SectionPanelCard`로 정리
  - 실패 미리보기 카드 래퍼도 `OperationalPreviewCard` 기반으로 정리
  - 실패 유형별 담당자 체크리스트 카드도 `OperationalPreviewCard` 기반으로 정리
  - 빠른 실행 내부의 긴급 조치/운영·백업 그룹도 `SectionPanelCard` 기반으로 정리
  - 빠른 실행 바깥 다크 컨테이너도 `SectionPanelCard` 기반으로 정리
  - 재분석 상세 비교 내부 개별 비교 카드도 `OperationalPreviewCard` 기반으로 정리
  - 최근 24시간 운영 조치 요약과 사유 품질 QA 상세 카드를 `SectionPanelCard` + `OperationalPreviewCard` 기반으로 추가 정리
  - 사유 보완 필요 요약 배너와 사유 입력 가이드도 `SectionPanelCard` 기반으로 정리
  - 우측 `2차 AI 재분석` 안내 블록도 `SectionPanelCard` 기반으로 정리
  - 2차 재분석 대상 없음/대응 가이드 빈 상태도 `EmptyStatePanel`로 정리
  - `EmptyStatePanel`에 `variant`를 적용해 빈 상태 톤 오버라이드를 일부 축소
  - 공통 톤 상수 파일로 `default` 대신 `white` / `slate` 네이밍을 정리
  - 복합 헤더 섹션 일부를 `SectionPanelCard`의 `eyebrow` / `headerAction` 기반으로 단순화
  - 비교 카드 일부를 `OperationalPreviewCard`의 확장 props로 단순화
  - `SectionPanelCard` / `OperationalPreviewCard`에도 `variant`를 연결해 반복 컨테이너 클래스 일부를 shared tone으로 정리
  - OcrAnalysis 재분석 비교 패널과 WorkerManagement 작업 모드/일괄 문자 패널도 accent preset으로 정리

## 3) 현재 기준으로 안정 상태인 파일
- `components/shared/StatusEvidenceActionPanel.tsx`
- `components/shared/InterpretationCardGrid.tsx`
- `components/shared/SummaryMetricGrid.tsx`
- `components/shared/ControlPanelCard.tsx`
- `components/shared/SectionPanelCard.tsx`
- `components/shared/OperationalPreviewCard.tsx`
- `components/shared/NoticeCallout.tsx`
- `components/shared/TableStateRow.tsx`
- `components/shared/EmptyStatePanel.tsx`
- `components/shared/toneVariants.ts`
- `components/modals/RecordDetailModal.tsx`
- `pages/WorkerManagement.tsx`
- `pages/OcrAnalysis.tsx`
- `pages/SiteIssueManagement.tsx`
- `pages/FieldSafetyComplianceHub.tsx`
- `types.ts`

## 4) 검증 상태
이번 세션에서 수정한 파일들은 오류 확인 완료.
- `components/shared/StatusEvidenceActionPanel.tsx` → 오류 없음
- `components/shared/SummaryMetricGrid.tsx` → 오류 없음
- `components/shared/ControlPanelCard.tsx` → 오류 없음
- `components/shared/SectionPanelCard.tsx` → 오류 없음
- `components/shared/OperationalPreviewCard.tsx` → 오류 없음
- `components/shared/NoticeCallout.tsx` → 오류 없음
- `components/shared/TableStateRow.tsx` → 오류 없음
- `components/shared/EmptyStatePanel.tsx` → 오류 없음
- `components/shared/toneVariants.ts` → 오류 없음
- `components/modals/RecordDetailModal.tsx` → 오류 없음
- `pages/WorkerManagement.tsx` → 오류 없음
- `pages/OcrAnalysis.tsx` → 오류 없음
- `pages/SiteIssueManagement.tsx` → 오류 없음
- `pages/FieldSafetyComplianceHub.tsx` → 오류 없음

## 5) 다음 세션 시작 시 바로 이어갈 권장 작업
우선순위 순서:
1. `pages/Dashboard.tsx` 역할별 view model 분리 후보와 보호 중심 요약 순서 분석 시작
2. `pages/Dashboard.tsx` 팀 비교/차트/하단 섹션(`SafetyActionCenter`, 국적/취약분야 차트)까지 역할별 배치 분기를 확장할지 점검
3. 필요 시 재사용 컴포넌트 props 정리 및 세맨틱 토큰 연계
4. 아직 남은 accent 계열 안내 박스/인라인 카드까지 shared tone preset으로 올릴지 점검
5. 필요 시 새 handoff 문서 기준일 갱신 또는 후속 세션용 handoff 분리

## 6) 다음 세션용 실행 프롬프트 예시
아래처럼 시작하면 바로 이어가기 쉽습니다.

- `NEXT_SESSION_HANDOFF_2026-04-09.md 기준으로 다음 작업 진행`
- `공통 컴포넌트 정리 작업 이어서 진행`
- `StatusEvidenceActionPanel 추가 적용 후보 찾아서 계속 진행`

## 7) 작업 원칙 유지사항
반드시 유지:
- PSI는 중립 도구가 아니라 **현장의 신호를 정확하게 읽고 사람을 보호하는 안전 파트너**
- UX 원칙: **평가보다 해석, 지적보다 보완, 감시보다 보호**
- 정보 구조 우선순위: **지금 상태 → 판단 근거 → 다음 행동**
- 가능한 한 중복 마크업보다 공통 컴포넌트를 우선 사용

## 8) 참고 문서
- `PSI_BRAND_IMPLEMENTATION_STATUS_2026-04-09.md`
- `PSI_BRAND_VOICE_GUIDE.md`
- `PSI_ROLE_BASED_UX_COPY_GUIDE.md`
