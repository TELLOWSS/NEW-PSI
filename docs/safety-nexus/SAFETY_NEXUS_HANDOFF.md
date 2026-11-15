# SAFETY NEXUS · CONTINUOUS HANDOFF / CHECKLIST
> Target: \`TELLOWSS/NEW-PSI\`; branch: \`feat/safety-nexus-vg1-20261115\`; plan v1.1 dated 2026-11-15.
> **Never infer live status from this file alone**. Re-read latest GitHub branch HEAD, PR/CI status, owner-approved plan and production Vercel SHA.
> **Operator instruction**: update each item with EVIDENCE, date, commit and blockers; do not convert implemented into PASS without measured QA.

## Source of truth
- GitHub remote \`main\` is baseline; this feature branch is isolated. Both company/home computers may be stale.
- Primary reference: uploaded \`92203.mp4\` (~44s); source plan \`NEW_PSI_SAFETY_NEXUS_비주얼혁신_기획서_V1.1_영상급디자인보강.docx\`. These two binary attachments have **not** been committed to GitHub; request/reference original files again for side-by-side visual QA.
- Derived repo plan: \`docs/safety-nexus/SAFETY_NEXUS_MASTER_PLAN_V1_1.md\`.
- Product rules \`AGENTS.md\`, \`docs/PSI_DEVELOPMENT_GUARDRAILS.md\`, \`docs/PSI_PRODUCT_VALUE_AND_DESIGN_BLUEPRINT_2026-08-21.md\`.
- Do NOT merge into main or deploy to production without final owner approval.

## Gate progress as of 2026-11-15
Legend: \`[x]\` implemented/documented with cited evidence; \`[ ]\` pending; \`REVIEW\` means not approved.

### 0. Governance / prerequisites
- [x] Read the owner's v1.1 plan, including section 09 art direction and section 10 visual approval. Evidence: original document inspected in current session.
- [x] Confirm NEW-PSI repository, React/Vite, current \`Page\` route and brand UX guides. Evidence: GitHub files \`App.tsx\`, \`types.ts\`, \`config/routeMeta.ts\`, \`AGENTS.md\`, \`pages/Dashboard.tsx\`.
- [x] Check existing agency skill/roster/registry, legal OSS gate and developmental guardrails. Evidence: \`AGENTS.md\` linked files.
- [x] Create non-production development branch. Evidence: \`feat/safety-nexus-vg1-20261115\`.
- [ ] Confirm current branch HEAD and current CI / preview / Vercel deployment after PR; record exact links and SHA.

### 1. VG-0 — visual reference lock
- [x] Identify reference composition and timing from source plan: particle core, multiple orbital planes, HUD panels, camera move, 0–12s intro.
- [ ] Commit or externally preserve 4–6 exact source reference stills with owner-provided reuse rights; binary file not currently in GitHub repo.
- [ ] Side-by-side matched 16:9 source vs implementation captures and ≥10-second motion comparison.
- [ ] Owner visual approval of key reference frames.

### 2. VG-1 — first interactive hero prototype
- [x] Implement **new route** \`pages/SafetyNexus.tsx\` as React lazy module, separate from Dashboard.
- [x] Add Canvas software-projected dense point shell with far/near particle shading, three independently tilted animated orbits and moving luminous tracers.
- [x] Add custom dark/amber/teal editorial UI, 5 interactive Q1–Q5 workflow nodes, six safety-signal labels, contextual details and links to existing pages.
- [x] Add animation pause, document hidden pause, reduced-motion toggle and responsive flat mode.
- [x] Register page type, route metadata, sidebar and practitioner operational mode; no main/dashboard replacement.
- [x] Show loaded-record count only as nonofficial count; mark all currently decorative animation as design, **not live risk**.
- [ ] Run typecheck/test/build and fix any failures.
- [ ] Take real browser screenshots at desktop and mobile breakpoints; inspect for clipping and readability.
- [ ] Benchmark FPS, CPU/GPU, animation start/stop and low-power Android.
- [ ] Implement WebGL shader/bloom/true 3D only if visual comparison demonstrates VG-1 software projection insufficient; review OSS/license first.
- [ ] **Owner art approval (V01–V07). Current status: REVIEW / NOT APPROVED.**

### 3. P0/P2 — audited data view
- [ ] Map site/month/trade/user role from trusted existing selectors and persisted scopes (currently not finalized).
- [ ] Map approval/review, missing/pending, interim controls, due/reinspection, official report denominator and education completion exactly.
- [ ] Build read-only view model and 2D list/detail fallback with tested counts; no guessed metrics or scores.
- [ ] Require proper authorization for source record/PII drilldown; avoid cross-site leakage.

### 4. VG-3 / P3 / P4 / VG-4
- [ ] Bind visual intensity / state exclusively to verified data; unverified remains muted and labeled.
- [ ] Keep delayed/overdue/temporary mitigation and reinspection pending explicitly unresolved.
- [ ] Test accessibility, color-independent state, keyboard, screen-reader and motion restrictions.
- [ ] Protect existing OCR / Dashboard / Reports / EducationReturn / Inspector from regression.
- [ ] Side-by-side stills and video motion QA vs owner 92203.mp4; 320/390/768/1366/1440/1920 widths.
- [ ] Independent security/access review and release QA (\`npm run verify:ci\`).

### 5. Release gate
- [ ] Complete owner's aesthetic signoff **and** functional/data/QA approval.
- [ ] Verify PR head SHA + CI; explicit owner decision to merge.
- [ ] Confirm Vercel preview, Vercel production SHA and operating domain if deployed with permission.
- [ ] Record rollback route and owner approval. **Production deployment not authorized yet.**

## Current modified files
- \`pages/SafetyNexus.tsx\` (new)
- \`pages/SafetyNexus.css\` (new)
- \`App.tsx\` (lazy route)
- \`types.ts\` (Page union)
- \`config/routeMeta.ts\` (optional practitioner page)
- \`components/Sidebar.tsx\` (pilot menu)
- \`utils/operationalModeUtils.ts\` (visibility)
- \`docs/safety-nexus/SAFETY_NEXUS_MASTER_PLAN_V1_1.md\` (new)
- \`docs/safety-nexus/SAFETY_NEXUS_HANDOFF.md\` (this file)

## Next strictly ordered work
1. Pull branch head and ensure TS builds / CI. Do not mark PASS prematurely.
2. Capture desktop 1366/1440 and mobile 390/768 previews and compare with owner's video.
3. Improve shader/depth/light effects for true video-grade visual **only on branch**, while profiling power and lower-end hardware.
4. Audit data semantics, introduce view model and 2D operational states; add tests.
5. Update this handoff after EVERY increment, including actual SHA, checks, evidence, blockers.
6. Present actual comparison to owner; no production merge.

## Re-entry prompt
> NEW-PSI SAFETY NEXUS 개발을 이어서 진행해줘. GitHub \`TELLOWSS/NEW-PSI\`의 \`feat/safety-nexus-vg1-20261115\` 브랜치와 \`docs/safety-nexus/SAFETY_NEXUS_MASTER_PLAN_V1_1.md\`, \`docs/safety-nexus/SAFETY_NEXUS_HANDOFF.md\`를 먼저 확인하고 실제 HEAD·PR·CI·미완료 체크리스트를 조회해. 사용자 영상 \`92203.mp4\`와 기획서 v1.1의 **영상급 비주얼 V01–V07** 조건으로 한 단계씩 구현하고 QA를 남겨줘. 최종 승인 전까지 main 병합·운영 배포 보류.
