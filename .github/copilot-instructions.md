# GitHub Copilot / VS Code Agent 영구 지침

> 이 파일은 VS Code 에이전트가 이 저장소에서 작업할 때 **항상** 적용되는 지침입니다.  
> 에이전트 재시작, PC 교체 후에도 이 파일이 원칙을 복원합니다.

상세 원칙은 [`docs/PSI_DEVELOPMENT_GUARDRAILS.md`](../docs/PSI_DEVELOPMENT_GUARDRAILS.md)를 참조하십시오.

---

## 이 저장소 정체

- **PSI (Proactive Safety Intelligence)** — 건설현장 안전관리 상업화 제품
- Vite + React + TypeScript SPA, Vercel Serverless, Supabase
- 배포: Vercel Free Plan, Production Branch = `main`

---

## 시작 전 필수 확인 (매 세션)

```bash
git status          # 미커밋 변경 확인
git branch          # 현재 브랜치 확인
git remote -v       # origin = TELLOWSS/NEW-PSI 확인
git fetch origin    # 원격 최신화
git pull origin main
```

---

## 절대 금지 (승인 없이 수행 불가)

1. **페이지 진입 자동 API 호출** — Vercel 함수 호출 낭비
2. **setInterval / 자동 polling / 반복 fetch** — 무료 플랜 한도 초과
3. **currentPage 라우팅을 URL Router로 전환** — 구조 계약 파괴
4. **아래 핵심 파일 로직 변경** (명시적 승인 필요):
   - `gateway.ts`
   - `safety-management.ts`
   - `supabaseClient.ts`
   - `pages/WorkerTraining.tsx`
   - `pages/OcrAnalysis.tsx`
   - `pages/Reports.tsx`
   - `api/admin/training.ts`
5. **API action명 / payload 필드 / response 구조 / DB 테이블명 / localStorage key 변경**
6. **실무자 화면에 기술 용어 노출** (`harness`, `payload`, `Supabase`, `debug`, `mock`, `gateway` 등)

---

## 실무자 화면 언어 원칙

- 개발자 용어를 사용자에게 절대 노출하지 않는다
- 권장: `오늘의 위험`, `TBM 현황`, `미조치 사항`, `안전조치 현황`, `리포트 생성 상태`
- 금지: `API`, `payload`, `Supabase`, `mock`, `debug`, `schema`, `migration`

---

## 디자인 방향

- **Premium Industrial Safety-Tech UI**
- 다크 네이비/차콜 기반, 세이프티 오렌지/전기 블루/민트 그린 포인트
- 관리자 = 관제센터형 대시보드
- 보고서 = 신뢰감 있는 공문서·증빙자료
- 근로자 화면 = 큰 글씨, 큰 버튼, 단계형, 다국어 (12개 언어)

---

## 각 작업 단계 완료 후 검증 순서

```bash
npm run check:types   # 반드시 통과
npm run build         # 반드시 성공
git status -sb        # 반드시 clean
```

추가 확인:
- 새로운 자동 API 호출 없는지
- 실무자 화면 금지 용어 0건인지

**모두 통과한 경우에만 다음 단계로 진행한다.**

---

## 현재 상태 (2026-05-31)

| 항목 | 상태 |
|------|------|
| 최신 커밋 | `7e5b082` (A1-7 fix) |
| check:types | ✅ 통과 |
| build | ✅ 성공 |
| git | ✅ clean |
| 다음 단계 | **A2** — AppShell/TopBar/PageHeader UI 골격 개선 |

---

> 상세 원칙 전문: [`docs/PSI_DEVELOPMENT_GUARDRAILS.md`](../docs/PSI_DEVELOPMENT_GUARDRAILS.md)
