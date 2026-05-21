# 📋 Phase 5: 런타임 검증 & 데이터 동기화 (2026-05-24~25)

**목표**: Supabase SQL 적용 + localStorage ↔ 서버 동기화 검증  
**담당**: AI Agent + 사용자  
**예상 소요**: 6시간

---

## 📌 Phase 5 상세 체크리스트

### 5-1. Supabase SQL 적용 (120분)

#### 5-1-1. 사전 준비
- [ ] **Supabase 로그인**
  - URL: https://supabase.com/dashboard
  - Project: NEW-PSI (또는 해당 프로젝트 이름)
  - 권한: SQL Editor 접근 가능

- [ ] **SQL 파일 준비**
  - 파일: supabase_ops_alert_click_logs_migration.sql
  - 내용 확인: 테이블 생성, 인덱스, 정책, Grants 포함

#### 5-1-2. SQL 실행 단계

**Step 1: Supabase SQL Editor 열기**
- [ ] https://supabase.com/dashboard/project/[PROJECT_ID]/sql → 열기
- [ ] "New Query" 버튼 클릭

**Step 2: 메인 스크립트 실행**
- [ ] supabase_ops_alert_click_logs_migration.sql 파일 내용 복사
- [ ] SQL Editor에 붙여넣기
- [ ] "Run" 버튼 클릭
- [ ] 완료 메시지 확인: ✅ "Query executed successfully"

```sql
-- 실행할 스크립트 (파일 라인 1~100)
create extension if not exists pgcrypto;

create table if not exists public.ops_alert_click_logs (
    id text primary key,
    clicked_at timestamptz not null,
    action text not null check (action in ('go-intervention', 'go-tagging-validation')),
    delay_alert_active boolean not null default false,
    tagging_error_count integer not null default 0,
    intervention_not_started_count integer not null default 0,
    created_by text null,
    created_at timestamptz not null default now()
);

-- [나머지 스크립트 계속...]
```

#### 5-1-3. 생성 확인 (검증 쿼리 실행)

**Query 1: 테이블 구조 확인**
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'ops_alert_click_logs'
order by ordinal_position;
```

- [ ] 실행하여 8개 컬럼 확인
  - [ ] id (text)
  - [ ] clicked_at (timestamptz)
  - [ ] action (text)
  - [ ] delay_alert_active (boolean)
  - [ ] tagging_error_count (integer)
  - [ ] intervention_not_started_count (integer)
  - [ ] created_by (text)
  - [ ] created_at (timestamptz)

**Query 2: 인덱스 확인**
```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'ops_alert_click_logs'
order by indexname;
```

- [ ] 실행하여 3개 인덱스 확인
  - [ ] ops_alert_click_logs_action_clicked_at_idx
  - [ ] ops_alert_click_logs_clicked_at_idx
  - [ ] ops_alert_click_logs_delay_alert_clicked_at_idx

**Query 3: 정책 확인**
```sql
select policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'ops_alert_click_logs'
order by policyname;
```

- [ ] 실행하여 2개 정책 확인
  - [ ] ops_alert_click_logs_authenticated_select
  - [ ] ops_alert_click_logs_service_role_all

**Query 4: 기본값 확인**
```sql
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'ops_alert_click_logs'
  and column_name in ('created_by', 'tagging_error_count', 'intervention_not_started_count');
```

- [ ] 실행하여 기본값 확인
  - [ ] created_by: 'reports-ui'
  - [ ] tagging_error_count: 0
  - [ ] intervention_not_started_count: 0

**Query 5: 제약조건 확인**
```sql
select conname, pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conrelid = 'public.ops_alert_click_logs'::regclass
order by conname;
```

- [ ] 실행하여 non-negative check 확인

**Query 6: 권한 확인**
```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'ops_alert_click_logs'
order by grantee, privilege_type;
```

- [ ] 실행하여 authenticated/service_role 권한 확인

#### 5-1-4. 스مو克 테스트 (선택사항)

**테스트 데이터 삽입**
```sql
insert into public.ops_alert_click_logs (
  id, clicked_at, action, delay_alert_active,
  tagging_error_count, intervention_not_started_count
) values (
  'test-' || to_char(now(), 'YYYYMMDDHH24MISSMS'),
  now(),
  'go-intervention',
  true,
  2,
  3
);
```

- [ ] 실행하여 데이터 삽입 확인

**테스트 데이터 조회**
```sql
select id, action, delay_alert_active, tagging_error_count, intervention_not_started_count, created_by, created_at
from public.ops_alert_click_logs
where id like 'test-%'
order by created_at desc
limit 1;
```

- [ ] 실행하여 방금 삽입한 데이터 조회 확인
- [ ] created_by = 'reports-ui' 확인

**테스트 데이터 삭제**
```sql
delete from public.ops_alert_click_logs where id like 'test-%';
```

- [ ] 실행하여 테스트 데이터 정리

---

### 5-2. 앱 코드에서 Supabase 호출 추가 (120분)

#### 5-2-1. Reports.tsx에 로그 저장 함수 추가
**파일**: pages/Reports.tsx

```typescript
// 기존 imports에 추가:
import { supabase } from '../lib/supabase'; // 또는 경로 조정

// 새로운 함수 추가 (보고서 상단):
const saveAlertClickLog = async (action: 'go-intervention' | 'go-tagging-validation', stats: {
  delayAlertActive: boolean;
  taggingErrorCount: number;
  interventionNotStartedCount: number;
}) => {
  try {
    const { error } = await supabase
      .from('ops_alert_click_logs')
      .insert({
        id: `click_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        clicked_at: new Date().toISOString(),
        action,
        delay_alert_active: stats.delayAlertActive,
        tagging_error_count: stats.taggingErrorCount,
        intervention_not_started_count: stats.interventionNotStartedCount,
      })
      .select();

    if (error) {
      console.error('Failed to save alert click log:', error);
    }
  } catch (err) {
    console.error('Error saving alert click log:', err);
  }
};

// 경보 CTA 클릭 핸들러 수정 (기존 함수 찾아서):
const handleAlertCtaClick = async (action: 'go-intervention' | 'go-tagging-validation') => {
  // 기존 로직...
  
  // 추가: Supabase 로그 저장
  await saveAlertClickLog(action, {
    delayAlertActive: activeAlert?.delayAlert ?? false,
    taggingErrorCount: stats.taggingError ?? 0,
    interventionNotStartedCount: stats.interventionNotStarted ?? 0,
  });
  
  // 기존 로직 계속...
  if (action === 'go-intervention') {
    setCurrentPage('intervention-coaching');
  } else if (action === 'go-tagging-validation') {
    setCurrentPage('ocr-analysis');
  }
};
```

- [ ] 위치: pages/Reports.tsx (경보 CTA 클릭 처리 부근)
- [ ] 라인: ~200줄

#### 5-2-2. Environment 변수 확인
**파일**: .env.local 또는 .env

```
VITE_SUPABASE_URL=https://[PROJECT_ID].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

- [ ] 확인: 이미 설정되어 있는지 체크
- [ ] 없으면 Supabase Console에서 복사해서 추가

#### 5-2-3. 빌드 검증
```bash
npm run build 2>&1
# 예상: ✅ PASS, 0 errors
```

- [ ] 빌드 성공 확인

---

### 5-3. localStorage ↔ 서버 동기화 테스트 (120분)

#### 5-3-1. Introduction QA RUNLOG 동기화 테스트

**테스트 환경**: 브라우저 개발자 도구 (F12)

**Step 1: 초기 상태 확인**
```javascript
// Console에서 실행:
localStorage.getItem('psi_intro_mobile_feature_qa_alert_runlog_v1')
// 예상: 배열 또는 null
```

- [ ] 결과 기록

**Step 2: Introduction 화면 방문**
- [ ] 앱 로드
- [ ] Page 1 (Introduction) 이동
- [ ] mobileFeatureValidation 트리거 (QA 실행)

**Step 3: localStorage 업데이트 확인**
```javascript
// Console에서 다시 실행:
const log = JSON.parse(localStorage.getItem('psi_intro_mobile_feature_qa_alert_runlog_v1'));
console.log('RUNLOG entries:', log);
// 예상: 배열에 새로운 항목 추가됨
```

- [ ] 최신 항목 확인

**Step 4: Reports 화면에서 읽기 확인**
- [ ] Page 11 (Reports) 이동
- [ ] "Introduction QA RUNLOG" 섹션 표시 여부 확인
- [ ] 최신 검증 정보 표시 확인

**Step 5: 크로스 탭 동기화 테스트**
- [ ] 브라우저 새 탭 열기
- [ ] 같은 앱 주소 로드
- [ ] Tab 1에서: Introduction 새로고침 (QA 다시 실행)
- [ ] Tab 2에서: localStorage 확인 (새 항목 반영 여부?)
  ```javascript
  // Tab 2 Console:
  localStorage.getItem('psi_intro_mobile_feature_qa_alert_runlog_v1')
  ```
- [ ] 결과 기록 (크로스 탭 동기화는 자동 아님 - 정상)

#### 5-3-2. Reports CTA 로그 동기화 테스트

**테스트 시나리오**: Reports 화면에서 경보 CTA 클릭 → Supabase 저장 확인

**Step 1: Reports 화면 접근**
- [ ] Page 11 (Reports) 이동
- [ ] 경보 알림 섹션 표시 여부 확인

**Step 2: CTA 클릭**
- [ ] "개입 시작" 또는 "검증 시작" 버튼 클릭
- [ ] Network 탭 모니터링 (Insert 요청 발생 여부)

**Step 3: Supabase에서 로그 확인**
```sql
select * from public.ops_alert_click_logs
order by created_at desc
limit 5;
```

- [ ] SQL Editor에서 실행
- [ ] 방금 클릭한 로그 항목 조회 확인
  - [ ] id: 고유값
  - [ ] clicked_at: 현재 시각
  - [ ] action: 'go-intervention' 또는 'go-tagging-validation'
  - [ ] delay_alert_active: true/false
  - [ ] tagging_error_count: 숫자
  - [ ] intervention_not_started_count: 숫자
  - [ ] created_by: 'reports-ui'
  - [ ] created_at: 자동 타임스탐프

#### 5-3-3. 12화면 localStorage 데이터 확인

| 화면 | localStorage 키 | 예상 데이터 |
|------|----------------|-----------|
| 1 | - | 없음 |
| 2 (경보) | psi_site_issues | 경보 목록 |
| 3 (프로파일) | - | (확인 필요) |
| 4 (진단) | psi_worker_training | 진행 상태 |
| 5 (컨텍스트) | psi_field_context_v1 | 입력값 |
| 6 (패턴) | - | (확인 필요) |
| 7 (예측) | - | (확인 필요) |
| 8 (개입) | psi_intervention_status | 상태 |
| 9 (입력) | psi_tagging_entries_v1 | 입력 기록 |
| 10 (검증) | - | (서버 기반) |
| 11 (리포트) | psi_intro_mobile_feature_qa_alert_runlog_v1 | QA 로그 |
| 12 (설정) | psi_dashboard_ui_mode_v1 | 모드 선택 |

**테스트**:
```javascript
// Console에서:
Object.keys(localStorage).forEach(key => {
  console.log(key, ':', localStorage.getItem(key).substring(0, 100));
});
```

- [ ] 각 유관 키 존재 여부 확인

---

## 🔍 구체적 검증 방법

### Phase 5 완료 시 검증 항목

#### 빌드 검증
- [ ] `npm run build 2>&1` → ✅ PASS, 0 errors

#### SQL 검증
- [ ] 6개 검증 쿼리 모두 실행 완료
- [ ] 테이블, 인덱스, 정책, 권한 생성 확인
- [ ] 스모크 테스트 완료 (테스트 데이터 삽입/조회/삭제)

#### 앱 코드 검증
- [ ] Reports.tsx에 saveAlertClickLog 함수 추가
- [ ] CTA 클릭 시 함수 호출
- [ ] .env.local에 Supabase 정보 있음

#### 런타임 검증 (브라우저)
- [ ] localhost:5173 에서 앱 실행
- [ ] Introduction → Reports → CTA 클릭 → Supabase 로그 확인
- [ ] 각 localStorage 키 존재 및 데이터 저장 확인

---

## 📊 변경 파일 요약

| 파일 | 변경 사항 | 라인 수 |
|------|----------|--------|
| pages/Reports.tsx | saveAlertClickLog 함수 + 호출 | 40줄 |
| .env.local | (확인만, 변경 없음) | 0줄 |

**예상 총 수정**: 40줄

---

## ⏹️ 중단된 경우 재개 방법

**상태 확인**:
- [ ] 5-1 (SQL 적용) 완료?
- [ ] 5-2 (앱 코드 추가) 완료?
- [ ] 5-3 (동기화 테스트) 완료?

**미완료 항목부터 재개**

---

**상태**: 📋 대기 중 (Phase 4 완료 후 시작)
