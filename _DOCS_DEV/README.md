# _DOCS_DEV 개발자 문서

**목적**: 코드 구현, 아키텍처, API 연결에 필요한 정보  
**대상**: TypeScript/React 개발자  
**관리**: 개발팀

---

## 📌 빠른 시작 (5분)

### 1. 로컬 환경 설정
```bash
git clone <repo>
cd NEW-PSI
npm install
npm run dev
```

### 2. 프로젝트 구조 이해
```
/src
  ├─ App.tsx              // 메인 라우팅 (현재: PC 중심, 곧 모바일 분리)
  ├─ index.tsx            // 진입점
  ├─ types.ts             // 데이터 타입 (WorkerRecord 등)
  ├─ pages/               // 화면 페이지
  ├─ components/          // 공유 컴포넌트
  ├─ services/            // API/비즈니스 로직
  └─ utils/               // 유틸리티
```

### 3. 이번주 목표: Week 1 라우팅 분리
- [ ] `routes/pcRoutes.tsx`, `routes/mobileRoutes.tsx` 생성
- [ ] `components/PCLayout.tsx`, `components/MobileLayout.tsx` 생성
- [ ] App.tsx 수정 (단말 감지 → 라우팅 분리)
- [ ] 빌드 & 테스트 통과

---

## 📚 필독 문서

각 문서는 구체적인 구현 스펙을 담고 있습니다:

| 문서 | 내용 | 읽기 시간 |
|------|------|---------|
| [SETUP.md](SETUP.md) | 로컬 환경 상세히 | 10분 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 프로젝트 구조 심화 | 15분 |
| [MOBILE_SPECS.md](MOBILE_SPECS.md) | 모바일 12화면 구현 스펙 | 30분 |
| [PC_SPECS.md](PC_SPECS.md) | PC 라우팅/화면 구현 스펙 | 20분 |
| [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) | 공유 컴포넌트 카탈로그 | 25분 |
| [TYPE_DEFINITIONS.md](TYPE_DEFINITIONS.md) | 데이터 타입 정의 | 15분 |
| [API_INTEGRATION.md](API_INTEGRATION.md) | API 연결 가이드 | 20분 |
| [TESTING.md](TESTING.md) | 테스트 작성 방법 | 15분 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 일반 문제 사항 | 필요시 |

---

## 🚀 이번주 실행 계획

### Week 1 (2026-05-28 ~ 2026-06-04)
**라우팅 분리**

```bash
# Branch 생성
git checkout -b feat/routing-separation

# Step 1: 라우팅 파일 생성
mkdir -p src/routes
touch src/routes/pcRoutes.tsx
touch src/routes/mobileRoutes.tsx

# Step 2: 레이아웃 생성
touch src/components/PCLayout.tsx
touch src/components/MobileLayout.tsx

# Step 3: App.tsx 수정
# (레퍼런스: [PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY] 참조)

# Step 4: 테스트
npm run build
npm run dev
# PC: localhost:3000/dashboard
# Mobile: localhost:3000/mobile/home
```

**산출물:**
- [ ] 라우팅 분리 완료
- [ ] 메인 빌드 성공
- [ ] PR 리뷰 완료

---

## 💻 개발 환경

### Node/Package 버전
- Node: 18.x 이상
- npm: 9.x 이상
- React: 19.2.0
- TypeScript: 5.3.x

### 개발 스크립트
```bash
npm run dev              # 개발 서버 시작
npm run build           # 빌드
npm run build:check     # 빌드 에러 체크
npm run check:types     # 타입 체크
npm run build:visualize # 번들 분석

# 검증/자동화
npm run check:judgment-tagging:full
npm run check:judgment-tagging:r1:full
```

---

## 📦 주요 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| react | 19.2.0 | UI 프레임워크 |
| typescript | 5.3.x | 정적 타입 |
| tailwindcss | 3.x | 스타일링 (CDN) |
| react-dom | 19.2.0 | DOM 렌더링 |

---

## 🔗 참고 링크

- **설계 기준**: [PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md](../PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md)
- **전체 로드맵**: [_DOCS_STATUS/ROADMAP_2026.md](_DOCS_STATUS/ROADMAP_2026.md)
- **타입 정의**: [../types.ts](../types.ts)

---

## ❓ 자주 묻는 질문

**Q: 모바일과 PC가 같은 pages 폴더에 있으면 안 되나?**  
A: 기술적으로는 가능하지만, 로직 차이가 크면 분리가 권장됩니다. 폴더 구조: `pages/pc/*`, `pages/mobile/*`

**Q: 공유 컴포넌트는 어떻게?**  
A: `components/shared/*`로 통합 관리. `isMobile` prop으로 렌더링 분기.

**Q: 빌드 실패하면?**  
A: `npm run build:check` 실행 → 에러 메시지 확인 → [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 참조

---

**작성자**: 개발팀  
**최종 업데이트**: 2026-05-28
