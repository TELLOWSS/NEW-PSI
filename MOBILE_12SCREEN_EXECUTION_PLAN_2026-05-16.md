# MOBILE 12화면 실행 계획 (2026-05-16)

- 기준 입력: 첨부 모바일 목업(12개 화면 + 시스템 흐름도)
- 목표: 현재 NEW-PSI를 모바일 실무 운영 앱으로 재구성하되, 기존 Human Risk Engine/태깅 자산과 단절 없이 연결

---

## 1) 총평 (디자인/제품 관점)

이번 목업은 방향이 매우 좋다.

강점:
1. 화면 목적이 명확함
   - 대시보드/경보/프로파일/진단/컨텍스트/패턴/예측/개입/입력/검증/리포트/설정으로 역할이 분리됨
2. 위험 인지 흐름이 순차적으로 설계됨
   - 데이터 입력 → 해석 → 예측 → 개입 → 리포트까지 닫힌 루프를 가짐
3. 실무자 관점의 밀도와 관리자 관점의 설명력이 균형적임

보완 포인트:
1. 카드 정보 밀도
   - 일부 화면은 1스크린 내 정보량이 많아 우선순위 계층(핵심/상세) 분리가 필요
2. 행동 유도 CTA
   - 각 화면의 1순위 행동 버튼을 더 선명하게 고정해야 함
3. 용어 일관성
   - 위험지수/경보/패턴/예측 용어를 단일 사전으로 통일해야 학습비용이 줄어듦

결론:
이 목업은 단순 UI가 아니라, PSI의 본질(인간 위험인지 운영체계)을 모바일에서 구현하기 위한 매우 좋은 골격이다.

---

## 2) 12화면 IA 정렬안

| 번호 | 화면명 | 목적 | 기존 자산 연결 |
| --- | --- | --- | --- |
| 1 | 홈 대시보드 | 오늘 위험현황, 즉시 우선순위 제시 | dashboard, 운영모드 |
| 2 | 경보 알림 | 우선 경보 리스트/심각도 | site-issue-management |
| 3 | 개인인지 프로파일 | 개인 벡터 상태 확인 | worker-management + 벡터 |
| 4 | 위험인지 진단 | 5/10 문항 진단 수행 | worker-training + 태깅 |
| 5 | 현장 컨텍스트 | 공정/기상/밀도/시간 맥락 입력 | context snapshot |
| 6 | 행동 패턴 분석 | 반복/시간대/팀 패턴 확인 | behavior pattern |
| 7 | 위험 예측 | 위험도/근거/우선대상 제시 | predictive risk |
| 8 | 개입 추천 | 즉시조치/중기조치/학습조치 | actionable coaching |
| 9 | 수기 데이터 입력 | 원문 중심 입력 | judgment tagging |
| 10 | 태깅 검증 | 자동 QA + 합의 | check:judgment-tagging |
| 11 | 분석 리포트 | 요약 KPI + 액션 | reports |
| 12 | 메뉴/설정 | 프로필/환경/권한/도움말 | existing menu |

---

## 3) 구현 원칙 (반드시 유지)

1. 화면당 1핵심 행동
- 각 화면은 가장 중요한 CTA 하나를 고정

2. 핵심-상세 2단 구조
- 첫 화면은 핵심 값만, 상세는 펼침/이동으로 분리

3. 점수보다 이유 우선
- 위험 점수는 보여주되 근거 문장과 권장 행동을 함께 고정

4. 기존 데이터 자산 100% 재사용
- 새 구조는 기존 scoreBreakdown/태깅/코드북/QA 스크립트와 연결

---

## 4) 구현 범위 제안 (MVP)

### Phase A (1주차) - 화면 골격 + 데이터 연결
- 12화면 라우팅/탭 구조 확정
- 공통 카드 레이아웃, 공통 CTA, 상태 배지 적용
- 기존 mock/stub 데이터로 화면 연결

### Phase B (2주차) - 핵심 엔진 연결
- 4, 6, 7, 8, 9, 10 화면에 태깅/QA/예측 흐름 연결
- check:judgment-tagging:full 결과를 10,11 화면에서 가시화

### Phase C (3주차) - 운영 안정화
- 화면별 성능 최적화
- 라운드 운영(R1~R5) 실데이터 검증
- 관리자/실무자 권한별 노출 정책 고정

---

## 5) 즉시 착수 백로그 (실행 순서)

1. 모바일 IA 스냅샷 문서화
2. 12화면 컴포넌트 맵 정의
3. 화면별 핵심 KPI/CTA 1개 확정
4. 9번 입력 화면과 태깅 CSV 필드 1:1 매핑
5. 10번 검증 화면과 QA 리포트 표시 연결
6. 11번 리포트 화면과 OPS 3줄 자동요약 연결

---

## 6) 리스크와 대응

리스크 1: 화면 과밀
- 대응: P0 카드만 기본 노출, 상세는 접기

리스크 2: 용어 혼선
- 대응: 용어 사전 단일화(위험지수/전조/개입)

리스크 3: 로컬-워크스페이스 불일치
- 대응: 동기화 체크리스트 기반으로 실행 전 검증

---

## 7) 다음 액션 (바로 실행)

1. 12화면별 핵심 CTA/지표 1개를 확정한 표 작성
2. 9~11번 화면 우선으로 데이터 파이프 연결(입력-검증-리포트)
3. 모바일 QA 체크리스트를 12화면 기준으로 확장

---

## 9) 반영 완료 (2026-05-16, 최종)

### PC UI 라벨 정렬 (1차)
- [components/Layout.tsx](components/Layout.tsx): 페이지 타이틀/모바일 퀵링크를 12화면 용어로 정렬
- [components/Sidebar.tsx](components/Sidebar.tsx): 네비게이션 라벨 / 섹션 타이틀 재구성

### PC 화면별 KPI 카드 추가 (2차)
- [pages/WorkerTraining.tsx](pages/WorkerTraining.tsx) ✅ 9번: 입력 진행도 (작성/청취/체크/서명 4단계)
- [pages/OcrAnalysis.tsx](pages/OcrAnalysis.tsx) ✅ 10번: 검증 상태 + ERROR_TOP5/ACTION_TOP5
- [pages/Reports.tsx](pages/Reports.tsx) ✅ 11번: 생성 상태 (대상수/진행률/최근검증 결과)

### 운영 자동화 체인 로컬 동기화
- git pull origin main: 108개 커밋 병합 완료 (병합 충돌 3건 해결)
- npm install: 의존성 재설치
- npm run check:judgment-tagging:full: 첫 실행 성공 (PASS)
  - reports/judgment-tagging-quality.json
  - reports/judgment-tagging-quality.md
  - reports/judgment-tagging-ops-summary.md

### R1 착수 준비  
- templates/psi_judgment_tagging_r1_worksheet_001_020_2026-05-16_sample.csv (10건 샘플 데이터)
- 데이터 검증 완료: 추락/낙하/협착/감전 시나리오 포함, 태그-코드 1:1

### 최종 검증
- 모든 변경 파일 컴파일 오류 0
- 모바일 9~11 화면 네이티브 매핑 확인

---

## 10) 다음 사항 (우선순위)

**1. R1 필드 데이터 입력** (주간 병렬)
- 20건 중 첫 10건 완성
- npm run check:judgment-tagging:r1:full → closeout 템플릿 자동 생성

**2. 10번 화면 실시간 JSON 바인딩** (2026-05-17~18)
- API 엔드포인트 추가 가능
- 임시: mockData 업데이트

**3. 모바일 12화면 상세 구현** (향후)
- 라벨/카드: 완료
- 다음: 입출력 바인딩, 네트워크 호출

---

## 8) 최종 판단

이 목업은 PSI의 전략 전환과 정확히 맞물린다.

즉,
- 보기 좋은 모바일 앱이 아니라
- 현장 판단 데이터를 수집/해석/예측/개입하는 운영 시스템
으로 구현할 수 있다.

실현 가능성은 충분하고, 이미 만든 태깅/QA 자동화 자산 때문에 구현 속도도 빠르게 가져갈 수 있다.

---

## 11) 최신 진행 업데이트 (2026-05-16)

### Reports 운영 KPI 카드 반영
- 대상 파일: [pages/Reports.tsx](pages/Reports.tsx)
- 반영 내용:
   - 경보 CTA 클릭 로그 필터 결과 기준 KPI 4종 추가
      1. 총 클릭수
      2. 8번 이동률
      3. 10번 이동률
      4. 경보활성 클릭 비율

### 검증 결과
- 명령: `npm run build`
- 결과: PASS (Exit Code 0)

### 다음 즉시 작업
1. 로그 기간 프리셋(오늘/최근7일/최근30일) 추가
2. KPI 카드에 전일 대비 증감률(가능 시) 표시
3. 로컬 로그(localStorage) 서버 영속화 검토

## 12) 2026-05-18 진행 기록

### 이번 세션 반영
- `pages/Reports.tsx`
   - 경보 CTA 클릭 로그 영역에 기간 프리셋을 추가함
   - `전체 / 오늘 / 최근 7일 / 최근 30일 / 사용자 지정` 흐름으로 필터를 단순화함
   - 사용자 지정 선택 시 시작일/종료일 입력만 노출하도록 정리함
   - 현재 선택된 기간을 화면에 표시해 기록 정합성을 유지함

### 진행 원칙
- 다음 작업은 기록된 우선순위에서만 순차 진행
- 보고서/태깅/개입/리포트 흐름 외의 주제는 이번 세션에서 확장하지 않음
- 변경 후에는 항상 해당 파일 기준으로 오류 여부를 먼저 확인하고 다음 단계로 이동함

## 13) 2026-05-18 로그 영속성 검토

### 확인 결과
- `pages/Reports.tsx`의 경보 CTA 클릭 로그는 현재 `localStorage` 기반이다.
- 현재 구현은 단일 브라우저/단일 장치 기준으로는 충분하지만, 장치 변경·브라우저 초기화 시 유실된다.
- 워크스페이스에는 `report_message_logs` 테이블이 이미 존재하지만, 이 테이블은 문자/MMS 발송 이력용이므로 경보 CTA 로그와 의미가 다르다.

### 정리된 방향
- 경보 CTA 로그는 별도의 영속 테이블로 분리하는 것이 맞다.
- 다음 구현 후보는 `ops_alert_click_logs` 계열의 전용 저장소를 두고,
  - localStorage는 즉시 표시용
  - 서버 저장소는 장기 보존용
  으로 이원화하는 방식이다.

### 다음 단계
- 전용 테이블 스키마 여부 확정
- 관리자 API 추가 여부 확정
- 현재 페이지의 저장/조회가 dual-write 또는 fallback-read 구조로 갈지 결정

## 14) 2026-05-18 다음사항 구현 완료 (로그 영속화)

### 확정된 구현안
- 저장 방식: `dual-write` (로컬 즉시 저장 + 서버 비동기 저장)
- 조회 방식: `서버 우선 + 로컬 폴백`
- 분리 원칙: 문자/MMS 로그(`report_message_logs`)와 경보 CTA 로그는 분리

### 반영 파일
- `api/admin/safety-management.ts`
   - `append-ops-alert-click-log` 액션 추가
   - `list-ops-alert-click-logs` 액션 추가
- `pages/Reports.tsx`
   - 서버 조회 병합 로직 추가
   - 클릭 시 서버 저장 비동기 전송 추가
- `supabase_ops_alert_click_logs_migration.sql`
   - 전용 영속 테이블/인덱스/RLS 정책 추가

### 검증
- `npm run build` PASS

## 15) 2026-05-18 운영 혼선 방지 보완

### 보완 배경
- 기존 `전체 초기화`는 로컬만 비우는 구조라, 서버 동기화 후 로그가 다시 보일 수 있었다.

### 보완 적용
- `api/admin/safety-management.ts`
   - `clear-ops-alert-click-logs` 액션 추가 (서버 로그 전체 초기화)
- `pages/Reports.tsx`
   - `전체 초기화`를 서버 초기화 + 로컬 초기화 순서로 변경
   - 경보 CTA 로그 영역에 `동기화 상태(서버 연결/확인 중/로컬 폴백)` 표시 추가

### 운영 효과
- 초기화 동작의 의미가 화면과 실제 저장소에서 일치함
- 스키마 미적용/서버 장애 시에도 현재 상태를 즉시 확인 가능

### 실검증 문서
- `REPORTS_OPS_ALERT_SYNC_QA_CHECKLIST_2026-05-20.md` 기준으로 A~D 시나리오를 순차 실행
- 실행 결과는 `REPORTS_OPS_ALERT_SYNC_QA_RUNLOG_2026-05-20.md`에 즉시 기록
- 기입 예시는 `REPORTS_OPS_ALERT_SYNC_QA_RUNLOG_SAMPLE_2026-05-20.md` 참조
- 단일 진입(권장): `REPORTS_OPS_ALERT_SYNC_QA_DOCSET_LATEST_2026-05-20.md`

## 16) 2026-05-20 소개 화면 즉시 구현 동기화 (PC·모바일 이원화)

### 반영 목표
- 첨부 목업 기준으로 소개 화면 상단을 `PC DASHBOARD` + `MOBILE APP` 구조로 이원화
- 기존 브랜딩 마크(`BrandPhilosophyLogo`) 유지
- 모바일 12화면 IA를 소개 화면에서 즉시 탐색 가능하도록 연결

### 반영 파일
- `pages/Introduction.tsx`
   - Hero 영역을 PC/모바일 분리 목업으로 교체
   - 모바일 12카드(1~12) 추가 및 각 카드 클릭 시 실제 페이지 이동 연결
   - 실데이터 기반 요약값 연결(근로자 수/전조 신호/태깅 대기/QA 대상/리포트 대상 등)
   - 단계 번호 배지(1~12) 고정
   - 카드 상태색 체계 적용
      - 경보·예측·개입: 주황
      - 태깅 검증: 보라
      - 입력·리포트: 초록
      - 기본 흐름: 인디고
   - 카드 내부 막대/설명 문구도 상태색과 통일
   - 버튼/카드/배지 인터랙션을 `duration-200` 기준으로 통일
- `App.tsx`
   - `Introduction`에 `workerRecords`, `onNavigateToPage` 전달

### 모바일 12화면 매핑(소개 화면)
1. 홈 대시보드 → `dashboard`
2. 경보 알림 → `site-issue-management`
3. 개인인지 프로파일 → `worker-management`
4. 위험인지 진단 → `worker-training`
5. 현장 컨텍스트 → `field-context-input`
6. 행동 패턴 분석 → `safety-behavior-management`
7. 위험 예측 → `predictive-analysis`
8. 개입 추천 → `intervention-coaching`
9. 수기 데이터 입력 → `judgment-tagging-input`
10. 태깅 검증 → `ocr-analysis`
11. 분석 리포트 → `reports`
12. 메뉴/설정 → `settings`

### 검증
- `cmd /d /s /c "npm run build"` PASS (Exit Code 0)

### 다음 확인 포인트
1. 실제 브라우저에서 소개 화면 상단 섹션의 뷰포트 가독성 점검
2. 모바일 12카드 라우팅 정확도 점검
3. 운영 용어 사전 기준으로 카드 카피 미세 조정
