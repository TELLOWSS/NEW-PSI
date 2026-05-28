# 🚀 START HERE (2026-05-28)
**최신 상태**: PSI 프로그램 디자인 & 정보구조 재정비 시작  
**기준일**: 2026-05-28  
**핵심 메시지**: 당신의 역할에 맞는 문서부터 읽으세요

---

## 🎯 당신의 역할은?

### 👨‍💻 **개발자** (코드 구현, 기능 개발, 버그 수정)

**지금 읽어야 할 것:**
1. **[_DOCS_DEV/README.md](_DOCS_DEV/README.md)** (5분)
   - 개발 환경 설정
   - 프로젝트 구조 빠른 이해

2. **[PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md](PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md)** (15분)
   - 이번주 구현 목표: Week 1 라우팅 분리
   - 모바일 라우팅 추가, PCLayout/MobileLayout 분리

3. **[INFORMATION_ARCHITECTURE_BY_ROLE_2026-05-28.md](INFORMATION_ARCHITECTURE_BY_ROLE_2026-05-28.md) - Section 1** (10분)
   - 개발자가 알아야 할 정보

4. **코드** ([/pages](/pages), [/components](/components))
   - 구현 시작: `pages/mobile/` 폴더 생성 → 모바일 12화면 라우팅

**다음 액션:**
- [ ] 로컬 환경 설정 확인: `npm install && npm run dev`
- [ ] 라우팅 구조 리뷰: [App.tsx](App.tsx)
- [ ] 모바일 라우팅 구현 시작
- [ ] Week 1 목표 체크: 2026-06-04까지 완료

---

### 👨‍💼 **현장 실무자** (앱 사용, 데이터 입력, 일일 운영)

**지금 읽어야 할 것:**
1. **[_DOCS_USER/README.md](_DOCS_USER/README.md)** (5분)
   - 앱 사용의 기본

2. **[_DOCS_USER/MOBILE_USER_GUIDE.md](_DOCS_USER/MOBILE_USER_GUIDE.md)** (20분 - 화면별)
   - 12개 화면 한 번에 이해하기
   - 각 화면 "뭘 하는 곳인가" 설명

3. **[_DOCS_USER/FAQ.md](_DOCS_USER/FAQ.md)** (필요할 때)
   - "이게 뭐냐고?"는 여기서 찾기

**지금 사용 중이라면:**
- 모바일 앱 첫 진입 → 홈 대시보드
- 경보 알림 보이면 → 2번 경보 화면으로 이동
- 10개 문항 입력? → 9번 화면 가이드 보기

**다음 액션:**
- [ ] 모바일 앱 오늘부터 사용 시작
- [ ] 3개 화면(홈/경보/진단)만 먼저 익히기
- [ ] 문제 발생 시 FAQ 확인 또는 팀에 물어보기

---

### 🎨 **설계자 / UX/UI / PM**

**지금 읽어야 할 것:**
1. **[DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md](DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md)** (30분)
   - 3가지 핵심 문제점 이해
   - 개선 방향 확인

2. **[_DOCS_MASTER/README.md](_DOCS_MASTER/README.md)** (10분)
   - 설계 표준 문서 위치

3. **[_DOCS_MASTER/MOBILE_12SCREEN_IA.md](_DOCS_MASTER/MOBILE_12SCREEN_IA.md)** (20분)
   - 12화면 정보구조
   - 컴포넌트별 설계 원칙

4. **[PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md](PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md)** (25분)
   - 이번주 실행 계획
   - Week 1-3 로드맵

**의사결정 필요:**
- [ ] 모바일 P0 화면 (2/4/8번) 1순위 승인
- [ ] 라우팅 분리 방식 (제안 검토 후 수정)
- [ ] 공유 컴포넌트 props 확장 (isMobile 등 필요한가?)

**다음 액션:**
- [ ] 개발팀과 Week 1-3 계획 리뷰 미팅 (15분)
- [ ] 목업 업데이트 필요 부분 정리
- [ ] 실무팀에 "이번주 변경 예정" 공지

---

### 📊 **PM / 관리자** (상태 추적, 일정 관리, 리스크 모니터링)

**지금 읽어야 할 것:**
1. **[DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md](DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md) - 요약 부분** (15분)
   - Executive Summary
   - 문제점 3가지 + 원인분석

2. **[_DOCS_STATUS/STATUS_DASHBOARD_2026-05-28.md](_DOCS_STATUS/STATUS_DASHBOARD_2026-05-28.md)** (10분)
   - 현재 진행률 75%
   - 이번주 포커스: 정보 구조 정리 + 모바일 P0 완성

3. **[PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md](PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md) - Week 1-3 로드맵** (20분)
   - Gantt 차트 수준 일정
   - 성공 기준 명확화

**주간 체크사항:**
- [ ] Week 1 완료 기준 (2026-06-04)
  - 라우팅 분리 완료 ✓
  - 빌드 성공 ✓
  - 테스트 통과 ✓

- [ ] 팀 역량 할당
  - 개발자 1-2명: 라우팅 구현
  - 디자이너 1명: 모바일 P0 화면 최적화

**다음 액션:**
- [ ] 개발팀 데일리 (오전 10시) 시작 (15분)
- [ ] 역할별 팀 공지: "START_HERE.md를 먼저 읽으세요"
- [ ] Week 1 산출물 체크리스트 준비

---

### ⚙️ **운영자 / QA / 신뢰성**

**지금 읽어야 할 것:**
1. **[_DOCS_OPS/README.md](_DOCS_OPS/README.md)** (10분)
   - 이번주 QA 계획

2. **[_DOCS_OPS/QA_TEST_PLAN.md](_DOCS_OPS/QA_TEST_PLAN.md)** (30분)
   - Week 1-2 테스트 시나리오
   - 모바일 P0 화면 (2/4/8) 자동화 테스트

3. **[PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md](PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md) - 체크리스트** (15분)
   - QA 포인트

**테스트 준비:**
- [ ] 테스트 환경 구성 (모바일 시뮬레이터 + 실기기)
- [ ] 테스트 시나리오 작성 (모바일 2/4/8번)
- [ ] 회귀 테스트 스크립트 업데이트

**다음 액션:**
- [ ] 개발팀에 "Week 1 빌드 예상 일정" 확인
- [ ] 테스트 환경 준비 (크롬 + iPhone + Android)
- [ ] 테스트 자동화 준비

---

## 📂 폴더 구조 가이드

새로 추가된 폴더:

```
📁 _DOCS_MASTER/        ← 설계자/PM용 (목업, IA, 원칙)
   ├─ README.md
   ├─ MOBILE_12SCREEN_IA.md
   ├─ PC_OPERATIONAL_SPEC.md
   └─ COMPONENT_SYSTEM.md

📁 _DOCS_DEV/           ← 개발자용 (구현 스펙, API)
   ├─ README.md
   ├─ SETUP.md
   ├─ COMPONENT_REFERENCE.md
   ├─ MOBILE_SPECS.md
   └─ PC_SPECS.md

📁 _DOCS_USER/          ← 실무자용 (사용 가이드)
   ├─ README.md
   ├─ MOBILE_USER_GUIDE.md
   ├─ PC_OPERATION_GUIDE.md
   └─ FAQ.md

📁 _DOCS_OPS/           ← 운영/QA용 (배포, 테스트)
   ├─ README.md
   ├─ QA_TEST_PLAN.md
   ├─ DEPLOYMENT_CHECKLIST.md
   └─ PERFORMANCE_BASELINE.md

📁 _DOCS_STATUS/        ← PM용 (상태, 우선순위)
   ├─ README.md
   ├─ STATUS_DASHBOARD_2026-05-28.md
   ├─ ROADMAP_2026.md
   └─ PRIORITY_MATRIX.md

📁 _DOCS_LOGS/          ← 일일 로그 (최신 1주)
   └─ DAILY_LOG.md

📁 _DOCS_ARCHIVE/       ← 완료/과거 문서 (참고용)
   └─ (기존 100+ 마크다운 파일)
```

---

## 📌 이번주 핵심 일정

### Mon (2026-05-28) - 오늘 ✅ 완료
- [x] 3개 분석 문서 작성 완료
- [x] 폴더 구조 생성 완료
- [x] START_HERE.md 배포 (지금)

### Tue-Wed (2026-05-29~30)
- [ ] 개발팀: 라우팅 분리 구현 시작
- [ ] 설계팀: 모바일 P0 화면 (2/4/8) 최종 검토
- [ ] PM: 팀 개인별 "읽어야 할 문서" 안내

### Thu-Fri (2026-05-31 ~ 2026-06-01)
- [ ] 개발팀: Week 1 구현 진행중 (라우팅 50%)
- [ ] 설계/QA: P0 화면 검증 시작

### Next Mon (2026-06-04) - Week 1 마감
- [ ] 라우팅 분리 완료 ✓
- [ ] 메인 빌드 성공 ✓
- [ ] 초기 QA 통과 ✓

---

## 🆘 헷갈리는 경우

**"어디서부터 읽어야 하나?"**
→ 위의 **당신의 역할은?** 섹션에서 시작

**"지금 뭘 하고 있는 건가?"**
→ `_DOCS_STATUS/STATUS_DASHBOARD_2026-05-28.md` 확인

**"기술 비용 어느 정도?"**
→ `_DOCS_DEV/README.md` 또는 개발팀에 물어보기

**"사용자 입장에서 뭐가 바뀌나?"**
→ `_DOCS_USER/MOBILE_USER_GUIDE.md`의 "변경 사항" 섹션

**"과거에 뭘 했었나?"**
→ `_DOCS_ARCHIVE/` 폴더 참고 (실제로는 거의 안 필요함)

---

## 💡 핵심 메시지

| 문제 | 해결책 | 기대 효과 |
|------|--------|---------|
| 100+ 파일 혼합 | 역할별 폴더 분리 | 찾기 30% 빠름 |
| 역할 구분 없음 | START_HERE.md로 진입 | 온보딩 90% 빠름 |
| 목업 vs 기능 격차 | 라우팅 분리 + P0 집중 | 사용성 60% 개선 |

---

## 📞 문의

- **기술 문제?** → [개발팀 (@dev)] 또는 [_DOCS_DEV/TROUBLESHOOTING.md](_DOCS_DEV/TROUBLESHOOTING.md)
- **사용 방법?** → [실무팀] 또는 [_DOCS_USER/FAQ.md](_DOCS_USER/FAQ.md)
- **설계 의견?** → [설계팀 (@design)]
- **일정/상태?** → [PM (@pm)] 또는 STATUS_DASHBOARD 최신 확인

---

**마지막 말:**  
"이 한 문서가 모든 혼란의 시작점입니다. 이걸 읽고 자신의 역할 문서로 가세요. 5분이면 충분합니다."

---

*Generated on 2026-05-28*  
*Next Review: 2026-06-04*
