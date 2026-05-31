# PSI 개발 운영 원칙 (Development Guardrails)

> **이 문서는 영구 고정 원칙 문서입니다.**  
> VS Code 에이전트 재시작, PC 교체, 세션 전환 후에도 이 문서를 먼저 읽고 작업을 시작하십시오.  
> 수정 시 반드시 팀장 승인 후 commit하십시오.

---

## 현재 상태 (2026-05-31 기준)

| 항목 | 내용 |
|------|------|
| 완료 단계 | A1, A1-2 (UI 문구 정비), A1-7 (api/admin TypeScript 문법 오류 수정) |
| 최신 커밋 | `7e5b082` — fix(A1-7): remove orphaned code in deprecated api/admin stubs |
| npm run check:types | ✅ 통과 |
| npm run build | ✅ 성공 |
| git status | ✅ clean (main = origin/main) |
| 다음 단계 | **A2** — AppShell / TopBar / PageHeader UI 골격 개선 |

---

## 1. 원격 기준 운영 원칙

### 핵심 규칙

- **회사 PC와 집 PC의 로컬 파일은 서로 다를 수 있다.**
- **항상 GitHub 원격 `main` 브랜치를 기준 원본으로 본다.**
- 코드 작업 시작 전 반드시 아래 순서로 확인한다:

```bash
git status          # 미커밋 변경 확인
git branch          # 현재 브랜치 확인
git remote -v       # origin이 TELLOWSS/NEW-PSI인지 확인
git fetch origin    # 원격 최신화
git pull origin main  # main 동기화
```

- push되지 않은 변경은 **Vercel에 반영되지 않은 것으로 본다.**
- Vercel Production Branch가 `main`인지 항상 확인한다.
- AI 에이전트는 원격 파일 상태를 먼저 읽은 뒤 수정한다. 로컬 상태를 가정하지 않는다.

---

## 2. Vercel 무료 플랜 보호 원칙

### 절대 금지 사항

| 금지 항목 | 이유 |
|-----------|------|
| 페이지 진입 자동 서버 호출 | Vercel 함수 호출 수 낭비 |
| `setInterval` / 자동 polling | 반복 호출로 한도 초과 위험 |
| 반복 `fetch` (의미 없는 재시도) | 동일 |
| 백그라운드 자동 동기화 | 사용자가 모르는 사이 호출 누적 |

### 허용 조건

- **실제 API 호출은 버튼 클릭 등 명확한 사용자 액션에서만 허용한다.**
- 디자인 확인·레이아웃 검토는 **mock/예시 데이터 우선**으로 한다.

### 보호 대상 API (호출 최소화 대상)

```
Supabase 조회/쓰기
Gemini API (번역, OCR 분석)
OCR 처리
Reports 생성
training (교육 생성/오디오 업로드)
safety-management
```

---

## 3. 상업화 제품 원칙

### 포지셔닝

> PSI는 개발 테스트 앱이 아니라 **상업화 목적의 건설현장 안전관리 제품**이다.

### 실무자 화면 금지 용어

아래 단어는 **실무자 기본 화면에 절대 노출하지 않는다.**

```
harness, workflow, gateway, payload, trace
mock, debug, Supabase, IndexedDB, localStorage
API, SDK, endpoint, migration, schema
```

### 실무자용 권장 표현

| 개발 용어 | 실무자 용어 |
|-----------|-------------|
| API 호출 실패 | 데이터를 불러오지 못했습니다 |
| Supabase 오류 | 서버 연결 문제 |
| payload | 입력 정보 |
| training session | 교육 세션 |
| mock data | 예시 데이터 |
| debug mode | — (노출 금지) |
| DB insert | 저장 |

### 실무자 표현 권장 목록

```
오늘의 위험
TBM 현황
미조치 사항
안전조치 현황
리포트 생성 상태
근로자 인지 확인률
교육 참여 현황
현장 위험도
```

### 근로자 화면 설계 원칙

- 큰 글씨 (최소 16px, 핵심 정보 20px+)
- 큰 버튼 (최소 48px 높이)
- 단계형 입력 (한 화면에 한 질문)
- 다국어 중심 (ko-KR, cmn-CN, vi-VN, km-KH, id-ID, ms-MY, mn-MN, my-MM, ru-RU, uz-UZ, th-TH, kk-KZ)

---

## 4. 디자인 원칙

### 전체 방향

> **Premium Industrial Safety-Tech UI**

### 색상 팔레트

| 구분 | 색상 |
|------|------|
| 기본 배경 | 다크 네이비 / 차콜 |
| 포인트 1 | 세이프티 오렌지 (`#F97316` 계열) |
| 포인트 2 | 전기 블루 (`#3B82F6` 계열) |
| 포인트 3 | 민트 그린 (`#10B981` 계열) |
| 경고/위험 | 레드 (`#EF4444` 계열) |

### 화면 유형별 톤

| 화면 유형 | 디자인 방향 |
|-----------|-------------|
| 관리자 대시보드 | 관제센터형 — 정보 밀도 높음, 상태 한눈에 파악 |
| 보고서/문서 | 공문서·증빙자료 보관소 — 신뢰감, 깔끔한 레이아웃 |
| 분석 화면 | AI Safety Lab — 시각적 인상, 기술어는 숨김 |
| 근로자 화면 | 모바일 퍼스트 — 단순, 명확, 큰 UI 요소 |

---

## 5. 기존 계약 보호 원칙

### 구조 계약 (승인 없이 변경 금지)

```
현재: currentPage 기반 Vite SPA (단일 페이지 상태 관리)
금지: URL Router (React Router, Next.js 등)로의 갑작스러운 전환
```

### 핵심 파일 보호 목록

아래 파일은 **명시적 승인 없이 핵심 로직을 변경하지 않는다.**

```
gateway.ts
safety-management.ts
supabaseClient.ts
pages/WorkerTraining.tsx
pages/OcrAnalysis.tsx
pages/Reports.tsx
api/admin/training.ts
lib/server/adminAuthGuard.ts
lib/server/trainingLinkToken.ts
```

### API 계약 보호 (승인 없이 변경 금지)

```
action 이름 (예: 'create', 'delete-session', 'reissue-link', 'awareness-stats', 'upload-audio')
payload 필드명
response 구조
DB 테이블명 (training_sessions, training_logs, training_acknowledgements, workers, ...)
localStorage key (예: psi_dashboard_ui_mode_v1)
IndexedDB key
environment variable 이름
```

### A2 범위 제한

A2에서 허용되는 작업:
```
AppShell 컴포넌트 신규 생성
TopBar 컴포넌트 신규 생성
PageHeader 컴포넌트 신규 생성
UI 골격 레이아웃 개선
```

A2에서 금지되는 작업:
```
gateway.ts 수정
API 계약 변경
DB 스키마 변경
currentPage 라우팅 구조 전환
Supabase 호출 로직 재설계
```

---

## 6. 검증 원칙

### 각 단계 완료 후 필수 확인 순서

```bash
# 1. TypeScript 타입 검사
npm run check:types

# 2. 빌드
npm run build

# 3. git 상태 확인
git status -sb
```

### 추가 확인 항목

- [ ] API 호출 증가 여부 확인 (새로운 자동 fetch 없는지)
- [ ] 실무자 화면 금지 용어 검색 (`harness`, `payload`, `Supabase`, `debug`, `mock`)
- [ ] 근로자 화면 UI 크기 기준 충족 여부
- [ ] Vercel 무료 플랜 영향 없음 확인

### 성공 기준

| 항목 | 기준 |
|------|------|
| check:types | exit 0, 오류 출력 없음 |
| build | exit 0 |
| git status | clean (미커밋 파일 없음) |
| API 호출 | 증가 없음 |
| 금지 용어 | 실무자 화면 0건 |

**위 기준을 모두 충족한 경우에만 다음 단계로 진행한다.**

---

## 7. 단계별 이력

| 단계 | 날짜 | 내용 | 커밋 | 상태 |
|------|------|------|------|------|
| A1 | 2026-05-31 | npm install 성공, build 성공, git status clean 확인 | — | ✅ |
| A1-2 | 2026-05-31 | routeMeta.ts 신규, devDiagnosticsGate.ts 신규, UI 문구 정비 (10개 파일) | `11ccd5b` | ✅ |
| A1-7 | 2026-05-31 | api/admin 5개 파일 TypeScript 문법 오류 최소 수정 (orphaned code 제거) | `7e5b082` | ✅ |
| A1-8 | 2026-05-31 | PSI 개발 운영 원칙 영구 문서화 (본 파일) | — | ✅ |
| A2 | 예정 | AppShell / TopBar / PageHeader UI 골격 개선 | — | ⏳ |

---

## 8. 프로젝트 기본 정보

```
저장소: https://github.com/TELLOWSS/NEW-PSI
branch: main (Production)
Framework: Vite + React + TypeScript
CSS: Tailwind CSS
Backend: Vercel Serverless Functions (api/)
DB: Supabase (PostgreSQL)
Storage: Supabase Storage (training_audio, signatures)
AI: Google Gemini API (번역, OCR)
Deploy: Vercel (Free Plan, Production = main branch)
```

---

> 작성일: 2026-05-31  
> 목적: A2 이후 모든 작업이 이 원칙을 기반으로 진행되도록 영구 고정
