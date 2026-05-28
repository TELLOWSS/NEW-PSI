# _DOCS_OPS 운영 & QA 문서

**목적**: 배포 체크리스트, QA 계획, 성능 모니터링, 보안  
**대상**: QA 팀, 운영자, 신뢰성 엔지니어  
**관리**: QA/운영팀

---

## 📌 빠른 시작 (10분)

### Week 1-2 QA 일정
```
Mon (2026-05-28): 라우팅 분리 시작 (개발)
Tue-Wed: QA 환경 준비
Thu: 초기 스모크 테스트
Fri (2026-06-04): 라우팅 완성 검증

Mon (2026-06-04): 모바일 P0 화면 집중 테스트 시작
Wed-Fri: 기능 & 성능 테스트
Mon (2026-06-11): 최종 QA 통과
```

### 이번주 우선순위
1. **라우팅 분리** (Tech QA)
   - [ ] 모바일 라우팅 작동 확인
   - [ ] PC 라우팅 기존 동작 유지
   - [ ] 빌드 성공 (에러 0)

2. **모바일 P0 테스트 준비**
   - [ ] 테스트 환경 구성 (시뮬레이터 + 실기기)
   - [ ] 테스트 케이스 작성
   - [ ] 자동화 스크립트 준비

---

## 🧪 테스트 계획

### Phase 1: Unit 테스트 (코드 레벨)
```bash
npm run build        # 컴파일 에러 체크
npm run check:types  # 타입 에러 체크
npm test            # 유닛 테스트 (준비 중)
```

**체크 항목:**
- [ ] 빌드 성공 (에러 0)
- [ ] 타입 에러 0
- [ ] 번들 사이즈 증가 미미 (<5%)

### Phase 2: Integration 테스트 (화면 레벨)
```
모바일 라우팅:
  http://localhost:3000/mobile/home → MobileHome 렌더링
  http://localhost:3000/mobile/alerts → MobileAlerts 렌더링
  http://localhost:3000/mobile/diagnosis → MobileDiagnosis 렌더링
  
PC 라우팅 (기존 유지):
  http://localhost:3000/dashboard → PCDashboard 렌더링
```

**체크 항목:**
- [ ] 모바일 12화면 모두 라우팅 작동
- [ ] PC 화면 기존 기능 유지
- [ ] 로딩 상태 표시
- [ ] 오류 바운더리 작동

### Phase 3: Browser 테스트 (호환성)

| 브라우저 | 버전 | 모바일 | PC |
|---------|------|--------|-----|
| Chrome | 최신 | ✅ | ✅ |
| Safari | 최신 | ✅ | ✅ |
| Firefox | 최신 | ✅ | ✅ |
| Edge | 최신 | - | ✅ |

### Phase 4: Device 테스트 (실기기)

| 기기 | OS | 화면 | 상태 |
|------|-----|------|------|
| iPhone 13 | iOS 16 | 390x844 | 테스트 필요 |
| Pixel 6 | Android 12 | 412x892 | 테스트 필요 |
| iPad | iPadOS | 768x1024 | 선택 |

### Phase 5: Performance 테스트

```bash
# Lighthouse 점수 (목표 90점 이상)
npm run audit       # 빌드 후 성능 측정

# 메트릭
- First Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1
```

---

## 📋 모바일 P0 화면 테스트 케이스

### 2번 경보 알림

**TC-001: 경보 리스트 표시**
```
전제: 고위험 근로자 3명, 중위험 5명 존재
검증:
  ✅ 화면 로드 3초 이내
  ✅ 고위험부터 정렬됨
  ✅ 각 경보 카드에 심각도 색상 표시
```

**TC-002: CTA 동작**
```
전제: 경보 화면 열림
검증:
  ✅ "즉시 조치" 버튼 클릭 → 8번 개입 화면으로 이동
  ✅ 경보 카드 클릭 → 해당 근로자 상세 보기
```

### 4번 위험인지 진단

**TC-003: 진행도 표시**
```
전제: 5개 문항 입력 완료
검증:
  ✅ 진행도 카드: "5/10 완료"
  ✅ 프로그레스 바: 50% 채워짐
  ✅ "다음" 버튼 활성화
```

**TC-004: 입력 검증**
```
전제: 6번 문항 페이지 열림
검증:
  ✅ 입력칸 클릭 → 키보드 활성화
  ✅ 텍스트 입력 가능
  ✅ 저장 버튼 클릭 → 다음 문항으로
  ✅ 페이지 새로고침 후 진행도 유지
```

### 8번 개입 추천

**TC-005: 상태 변경**
```
전제: 개입 추천 화면, 미착수 상태
검증:
  ✅ "지정하기" 클릭 → 상태 변경 (진행중)
  ✅ 배경색 변경 (빨강 → 노랑)
  ✅ "완료" 클릭 → 상태 변경 (완료)
  ✅ 배경색 변경 (노랑 → 초록)
```

**TC-006: 데이터 영속성**
```
전제: TC-005 상태 변경 완료
검증:
  ✅ 이전 화면 갔다가 다시 돌아올 때 상태 유지
  ✅ 핸드폰 재부팅 후 상태 유지
  ✅ 서버 동기화 (로그 기록 확인)
```

---

## 🚀 QA 자동화

### 필요 도구
- Selenium (브라우저 자동화)
- Jest (시나리오 테스트)
- Lighthouse (성능 측정)

### 예시 스크립트
```javascript
// tests/mobile/alerts.test.ts
describe('Mobile Alerts (2번)', () => {
  test('경보 리스트 로드', async () => {
    await page.goto('/mobile/alerts');
    const alerts = await page.$$('[data-testid="alert-card"]');
    expect(alerts.length).toBeGreaterThan(0);
  });

  test('CTA 클릭 → 개입 화면 이동', async () => {
    await page.click('[data-testid="cta-immediate-action"]');
    await page.waitForNavigation();
    const url = page.url();
    expect(url).toContain('/mobile/intervention');
  });
});
```

---

## 📊 성능 기준 (Baseline)

### 로드 시간
| 화면 | 목표 | 기준 |
|------|------|------|
| 1번 홈 | < 2s | 🟢 양호 |
| 2번 경보 | < 1.5s | 🟢 양호 |
| 4번 진단 | < 1s | 🟡 주의 |
| 8번 개입 | < 1s | 🟡 주의 |

### 번들 사이즈
```
목표: < 500KB (gzipped)
기준: 현재 450KB
```

---

## 🔒 보안 체크

### 배포 전체크리스트
- [ ] 민감 정보 노출 없음 (API key, 비밀번호)
- [ ] HTTPS 적용
- [ ] 세션 관리 (타임아웃 설정)
- [ ] 입력 검증 (XSS 방지)
- [ ] SQL Injection 방지

---

## 📞 이슈 보고 (Bug Report)

### 버그 발견 시 필수 정보
```
제목: [P0/P1/P2] 화면명 - 문제 설명

상세:
- 재현 단계
- 예상 동작
- 실제 동작
- 스크린샷 또는 비디오
- 기기/OS/브라우저
```

### 우선순위
- **P0**: 기능 불가 (배포 블로킹)
- **P1**: 주요 기능 부분 오류 (곧 수정)
- **P2**: 마이너 UI 오류 (다음 스프린트)

---

**작성자**: QA/운영팀  
**최종 업데이트**: 2026-05-28  
**다음 리뷰**: 2026-06-04
