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

## NEW-PSI Living UI UI·UX 고도화 작업 재개 (2026-11-21 추가)

NEW-PSI의 Code and Chill 템플릿 참조 기반 PC·모바일 디자인 고도화는 별도 단일 인계서를 사용한다.

- 필독: [Living UI 통합 설계·구현·검증 인계서](../PSI_LIVING_UI_MASTER_HANDOFF_20261121.md)
- 작업 브랜치: `feat/psi-living-ui-design-foundation-20261121`
- 사용자 정정: **현장 관리자의 장갑 착용을 UX의 일반적 필수 전제로 가정하지 말 것.** 역할·업무·기기 맥락을 실제 검증한다.
- `L00~L18` 추적표를 읽고, 완료 판정과 배포 SHA는 실시간 재확인한다. Main 병합·Production 배포는 승인 전 보류.

> 2026-11-22 L14 추가: Living UI Draft PR #237에서 `/field-local/` 전용 PWA 설치형 파일럿 구현. 실제 Android 설치/비행기모드/IndexedDB 사진 복원은 미검증. 상세 결정서 `docs/PSI_L14_PWA_DECISION_AND_FIELD_TEST_20261122.md` 및 Living UI 마스터 인계서 L14 절 참조. main/Production 최종 승인 전 보류.

> 2026-11-22 L15 추가: Draft PR #237에서 관리자 모바일 메뉴/QuickFind의 초점 트랩·44px/작은 viewport·100dvh 및 합성 브라우저 QA를 추가. 실제 200% 줌/Android/스크린리더/다국어 검증은 별도. 상세 `docs/PSI_L15_ACCESSIBILITY_FIELD_QA_20261122.md`. L16 성능·저속망/오프라인 검토가 다음 독립 작업이며 main/Production 운영 승인 보류.

> 2026-11-22 L16 추가: `/field-local/`의 브라우저 연결 신호 구분 UI 및 오프라인 캐시·합성 사진 저장/복원·재연결 시 자동 API 0 검증을 추가. 실제 3G/Android 배터리·iOS 실측은 미검증. `docs/PSI_L16_NETWORK_BATTERY_FIELD_QA_20261122.md` 및 Living UI 마스터 인계서 L16 참조. 다음 L17 보안·권한·무결성·OSS. main/Production 반영 보류.

> 2026-11-22 L17 추가: `/field-local` 관련 경로의 noindex/no-referrer, OSS 후보 런타임 미도입·API/공유·인증·PWA 범위의 source-only 정적 보안 게이트 추가. CSP 광범위 허용, 실 HTTP 헤더, Supabase RLS/현장별 권한 및 상용 라이선스는 미검증. 상세 `docs/PSI_L17_SECURITY_OSS_GATE_20261122.md`. 다음 L18 통합 품질·실기기·승인 검토. main/Production 보류.

> 2026-11-22 L18: 동일 HEAD `639b861`에서 L17 릴리스·전사 Chromium·Inspector 모바일 QA 모두 PASS 확인. 실 Supabase PSI-Database 읽기 전용 RLS/GRANT/RPC 메타데이터 조사(PR #237 코멘트). 신설 `config/psi-living-ui-release-acceptance.json` 13개 human gate 전부 PENDING, `scripts/verify-psi-l18-release-gate.mjs` CI 합성 증거 집계 후에도 출시 BLOCKED를 보장. 최신 HEAD CI는 push 후 재조회. 상세 `docs/PSI_L18_RELEASE_READINESS_20261122.md`. 다음 L06 근로자 Q1~Q5 직접 입력/현장·Android·원어민/서버권한 실제 검증. main/Production 보류.
