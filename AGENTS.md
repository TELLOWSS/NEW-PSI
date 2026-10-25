# NEW-PSI — 에이전트 진입 규칙 (AGENTS.md)

이 저장소에서 작업하는 Codex/AI 코드 작업자는 먼저 다음 문서를 읽는다.
1. `.agents/skills/psi-ai-company/SKILL.md` — 제품 간 공통 AI 회사형 7명 애칭/책임/결재/검증
2. `config/psi-company-agent-roster.json` — 이름·고유 역할·권한
3. `config/psi-company-product-registry.json` — 각 GitHub/Vercel 제품을 섞지 않도록 하는 제품 등록부
4. `docs/psi-ai-company/OPERATING_CHARTER.md` — NEW-PSI 조직 승인·산업안전 판단 경계
5. `docs/psi-ai-company/NEW_CHAT_HANDOFF.md` — 새 채팅 재개 순서
6. `config/psi-company-progress.json` — 마지막 검토 사본. 실시간 상태 아님. 반드시 GitHub/CI/Vercel 현재 상태 재조회.

## 현장 우선 원칙
NEW-PSI는 위험성평가·사진점검·6대 지표 등 현장 안전 지능 메인 시스템. SMART TBM·PSI : ZERO DAY는 **별개**.
실근로자 기록·공유 링크 토큰·사진·개인정보/산재자료로 합성 자동테스트를 수행하지 않는다. 현장 작업중지·재개와 처벌 판단을 AI 단독 확정하지 않는다.

## 부르기
- 아틀라스 (ATLAS): 개발총괄
- 나비 (NAVI): 제품·UX
- 루미 (LUMI): UI·디자인
- 코어 (CORE): 기술구현
- 세이프 (SAFI): 안전지능
- 키퍼 (KEEPER): DB·보안
- 프루프 (PROOF): 독립 검증

이 이름은 역할·책임을 부르는 편의 명칭이다. 독립적으로 상시 실행되는 여러 AI 프로세스의 존재를 주장해서는 안 된다.

## 기본 QA
`npm run verify:ci`, `node scripts/check-psi-company-ownership.cjs`, `node scripts/verify-psi-company-browser.mjs`(npm build·Chromium 필요). GitHub PR CI 최종 결과와 Vercel preview/production commit SHA + 운영 도메인을 대조한다. 보안·품질 미승인 때 병합을 중지한다.

## 새 채팅 재개
사용자에게 `docs/psi-ai-company/NEW_CHAT_HANDOFF.md`에 있는 복사 가능한 한 문장을 제시한다. 일반 ChatGPT 새 채팅에 GitHub 파일이 자동 주입될 것으로 가정하지 않는다. 최초 작업 때 실제 저장소를 읽어야 한다.
