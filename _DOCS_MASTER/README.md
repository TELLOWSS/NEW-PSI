# _DOCS_MASTER 설계 & PM 문서

**목적**: 목업, 정보구조(IA), UX 원칙, 컴포넌트 체계 정의  
**대상**: UX/UI 설계자, PM, 프로덕트 의사결정자  
**관리**: 설계팀, PM

---

## 📌 빠른 시작 (15분)

### 1. 전체 그림 이해
현재 프로그램의 3가지 문제점:
1. **정보 혼잡** - 100+ 문서가 분류 없이 섞여있음
2. **역할 혼재** - 개발/설계/실무 정보가 같은 파일
3. **목록 미완성** - 모바일 12화면은 프리뷰만 반영

### 2. 이번주 의사결정
- 모바일 P0 (2/4/8번) 1순위 완성 승인? **→ YES**
- 라우팅 분리 방식 검토 완료? **→ 개발팀과 미팅**
- 설계 표준 문서 확장 필요? **→ YES (이번주)**

### 3. 검토할 전략 문서
```
PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md
  ├─ 라우팅 분리 다이어그램
  ├─ 모바일 12화면 설계안
  ├─ PC 운영 화면 설계안
  ├─ Week 1-3 구현 로드맵
  └─ 성공 기준 (체크리스트)
```

---

## 📚 필독 문서

| 문서 | 내용 | 우선순위 |
|------|------|---------|
| [DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md](../DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md) | 현재 상태 분석 & 개선안 | 🔴 필독 |
| [PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md](../PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md) | 구체 설계 & 구현 전략 | 🔴 필독 |
| [MOBILE_12SCREEN_IA.md](MOBILE_12SCREEN_IA.md) | 모바일 12화면 IA 철저히 | 🟠 다음주 |
| [PC_OPERATIONAL_SPEC.md](PC_OPERATIONAL_SPEC.md) | PC 운영 화면 스펙 | 🟠 다음주 |
| [COMPONENT_SYSTEM.md](COMPONENT_SYSTEM.md) | 공유 컴포넌트 가이드 | 🟡 참고 |
| [UX_PRINCIPLES.md](UX_PRINCIPLES.md) | UX 설계 원칙 | 🟡 참고 |

---

## 🎯 이번주 의사결정 체크리스트

### Mon (2026-05-28 - 오늘)
- [ ] [DESIGN_AND_UX_ANALYSIS_REPORT] 검토 (30분)
- [ ] 팀과 3가지 문제점 공유 (15분)
- [ ] 피드백 수집

### Tue (2026-05-29)
- [ ] [PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY] 상세 검토 (1시간)
- [ ] 라우팅 분리 방식 OK? YES/NO/수정
- [ ] P0 화면 (2/4/8) 최종 승인
- [ ] 개발팀과 기술 리뷰 미팅 (30분)

### Wed (2026-05-30)
- [ ] 설계안 최종 확정
- [ ] 실무팀에 공지: "이번주 변경 예정"
- [ ] 자산 (목업, 폰트, 아이콘) 개발팀에 전달

### Thu-Fri
- [ ] 진행상황 모니터링
- [ ] 질문/이슈 대응

---

## 📂 이 폴더가 관리할 정보

```
_DOCS_MASTER/
├─ MOBILE_12SCREEN_IA.md         ← 모바일 IA 상세
├─ PC_OPERATIONAL_SPEC.md         ← PC 스펙 상세
├─ COMPONENT_SYSTEM.md            ← 컴포넌트 카탈로그
├─ UX_PRINCIPLES.md               ← UX 원칙
├─ INFORMATION_HIERARCHY.md        ← 정보 우선순위
├─ RESPONSIVE_RULES.md            ← 반응형 규칙
├─ BRANDING.md                    ← 브랜드 톤/카피
├─ FIGMA_LINKS.md                 ← 목업/프로토타입 링크
└─ README.md                      ← 이 파일
```

---

## 🚀 이번주 스핀 (Sprint)

### Sprint 1: Info Architecture Clarity
**목표**: 정보 구조 명확화, 설계 표준 문서화

**산출물:**
- [ ] 모바일 12화면 IA 문서 최종화
- [ ] PC 운영 화면 IA 최종화
- [ ] 컴포넌트 시스템 다이어그램
- [ ] 공유 컴포넌트 props 정의

### Sprint 2: P0 Screen Refinement
**목표**: 모바일 2/4/8번 화면 디자인 최적화

**검토 항목:**
- [ ] CTA 위치/텍스트 명확한가?
- [ ] 정보 계층(우선순위) 명확한가?
- [ ] 모바일 기기별 반응형 OK?
- [ ] 색상/타입 일관성 OK?

---

## 📊 설계 표준 (Template)

### 화면 카드
```
┌─────────────────────────────┐
│ [eyebrow] 라벨              │
│ 제목 (title)            [🔔]│  ← 뱃지 (선택)
├─────────────────────────────┤
│                             │
│ + 본문 영역 (body)          │
│ + 부연 설명 (subtitle)      │
│ + 시각화 (차트/이미지)      │
│                             │
├─────────────────────────────┤
│ [액션1]          [액션2]    │  ← CTA 최대 2개
└─────────────────────────────┘
```

### 색상 체계
- **적**: 고위험 (68% 이상)
- **황**: 중위험 (40-67%)
- **녹**: 안전 (0-39%)
- **회**: 중립 정보

### 타입 규칙
- 제목: Bold 16px 이상
- 본문: Regular 14px
- 라벨: Bold 10px, Uppercase

---

## 💡 핵심 가이드

### "언제 모바일 화면이 완성되었다고 본단가?"
1. ✅ 라우팅 작동 (이전/다음 화면 이동)
2. ✅ 데이터 저장 (상태 변경 후 새로고침해도 유지)
3. ✅ CTA 반응 (버튼 클릭 → 예상 행동)
4. ✅ 오류 처리 (로딩/실패 상태 표시)
5. ✅ 실기기 테스트 (최소 1대 실제 기기)

### "PC와 모바일 어떻게 구분?"
| 항목 | 모바일 | PC |
|------|--------|-----|
| 목적 | 현장 실시간 | 관리/보고 |
| 정보량 | 최소화 | 풍부함 |
| 네비 | 하단 탭 바 | 좌측 메뉴 |
| 작업 | 선형 (한 가지) | 병렬 (다중) |

---

## 🔗 참고 자료

- **전체 분석**: [DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md](../DESIGN_AND_UX_ANALYSIS_REPORT_2026-05-28.md)
- **구현 전략**: [PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md](../PC_VS_MOBILE_DESIGN_SEPARATION_STRATEGY_2026-05-28.md)
- **정보 구조**: [INFORMATION_ARCHITECTURE_BY_ROLE_2026-05-28.md](../INFORMATION_ARCHITECTURE_BY_ROLE_2026-05-28.md)
- **목업 링크**: [FIGMA_LINKS.md](FIGMA_LINKS.md)

---

## 📞 의문점

**Q: 공유 컴포넌트가 코드상 이미 45개인데 더 만들면 복잡해지지 않나?**  
A: 우리는 "새로 만들기"가 아니라 "기존 컴포넌트를 모바일/PC에서 잘 쓰도록 props 확장"입니다.

**Q: 이 설계가 실제로 개발 가능한가?**  
A: YES. 라우팅/레이아웃만 분리하고 비즈니스 로직은 공유하므로 기술 부채가 적습니다.

**Q: 설계 표준을 개발팀이 따를까?**  
A: [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)에 코드 예시를 넣어둡니다. 개발팀과 1:1 리뷰 권장.

---

**작성자**: 설계팀, PM  
**최종 업데이트**: 2026-05-28  
**다음 업데이트**: 2026-06-04 (Sprint 1 완료 후)
