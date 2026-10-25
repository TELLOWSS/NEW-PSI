# 새 ChatGPT 채팅에서도 NEW-PSI 및 다른 제품 작업 이어가기

## 이 시스템이 저장하는 것과 저장하지 못하는 것
GitHub `AGENTS.md`와 `skills/psi-ai-company/SKILL.md`는 저장소에 계속 유지된다. GitHub 연결을 사용할 수 있는 새 채팅에서 이 파일을 **명시적으로 읽으면** 같은 역할·검증 체계를 재사용할 수 있다.
그러나 채팅 사이에 7명의 별도 자율 에이전트가 계속 돌아가거나, 사용자 계정에 새 ChatGPT 스킬이 자동 설치되거나, 새로운 대화가 이 파일을 반드시 알고 시작하는 것은 아니다.

## 새 채팅 시작 문구 (복사해서 전송)

```text
아틀라스, PSI AI STUDIO 회사형 개발조직으로 이전 작업 이어서 진행해줘.
GitHub TELLOWSS/NEW-PSI 의 AGENTS.md,
skills/psi-ai-company/SKILL.md,
config/psi-company-agent-roster.json,
config/psi-company-product-registry.json 을 먼저 읽어.
작업 대상은 [NEW-PSI / PSI : ZERO DAY / SMART TBM / SMART-SFCS / 제품명] 이야.
해당 제품의 GitHub 열린 PR, 최신 main SHA, CI 검사, Vercel production SHA·도메인을 실조회한 다음,
나비·루미·코어·세이프·키퍼·프루프 역할별 책임을 배정해 사용자 편의성/품질/안전 검토와 실제 개선을 진행해.
부서별로 점검 내용, 조치 내용, 검증 근거, 실패/보류 항목을 투명하게 보고해.
별개 제품 데이터를 섞지 말고 테스트 실패 시 운영 병합을 중단해.
```

## 확인 순서
1. 연결된 GitHub 앱/저장소에 접근 가능한지 확인한다. 없다면 URL을 복사한 것만으로 읽은 척하지 않고 접근 방법을 안내한다.
2. 반드시 실제 소스의 `main`과 `AGENTS.md`를 먼저 읽는다. 과거 답변의 SHA와 PR 상태는 이미 달라졌을 수 있다.
3. 7개 검증된 Vercel 프로젝트는 `config/psi-company-product-registry.json`에서 해당 제품을 선택한다.
4. 열려 있는 PR, 24시간 CI, 그 PR의 preview, main production, 운영 alias를 비교한다.
5. 사람의 승인 없이 권한 확대, DB 파괴 작업, 유료 호출, 문자·메일 전송을 수행하지 않는다.
6. 모든 변경은 해당 제품에만 적용하며 테스트→PR→독립 QA→main 병합→Vercel 최종 확인 순서를 지킨다.
7. 매 작업 종료 시 GitHub 근거를 남기고 남은 과제를 명시한다.

## 제품별 기본 표준
- **NEW-PSI:** 현장 안전지능 메인, `npm run verify:ci`, 전체 부서 Chromium 7흐름
- **PSI : ZERO DAY:** 별도 게임. 기존 `AGENTS.md`의 Master Design Principles·Visual Lock 우선, `npm test`와 `npm run build` 등 기존 원칙 유지
- **SMART TBM:** NEW-PSI와 별도 프로그램, `npm run build` 기준
- **SMART-SFCS:** 별도 안전 운영 앱, `npm run build`는 `verify:env`·`typecheck` 포함
- **기타 제품:** `package.json`·기존 테스트·배포 절차를 읽은 다음만 실행 명령 결정

참고: `config/psi-company-progress.json`은 마지막 검토 순간의 기록 **스냅샷**이다. GitHub Actions의 최신 리포트를 우선한다.
