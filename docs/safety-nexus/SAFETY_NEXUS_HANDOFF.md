# SAFETY NEXUS · CONTINUOUS HANDOFF / CHECKLIST
> Target: `TELLOWSS/NEW-PSI`; branch: `feat/safety-nexus-vg1-20261115`; plan v1.1 dated 2026-11-15.
> **Never infer live status from this file alone**. Re-read latest GitHub branch HEAD, PR/CI status, owner-approved plan and production Vercel SHA.
> **Operator instruction**: update each item with EVIDENCE, date, commit and blockers; do not convert implemented into PASS without measured QA.

## Source of truth
- GitHub remote `main` is baseline; this feature branch is isolated. Both company/home computers may be stale.
- Primary reference: uploaded `92203.mp4` (~44s); source plan `NEW_PSI_SAFETY_NEXUS_비주얼혁신_기획서_V1.1_영상급디자인보강.docx`. These two binary attachments have **not** been committed to GitHub; request/reference original files again for side-by-side visual QA.
- Derived repo plan: `docs/safety-nexus/SAFETY_NEXUS_MASTER_PLAN_V1_1.md`.
- Product rules `AGENTS.md`, `docs/PSI_DEVELOPMENT_GUARDRAILS.md`, `docs/PSI_PRODUCT_VALUE_AND_DESIGN_BLUEPRINT_2026-08-21.md`.
- Do NOT merge into main or deploy to production without final owner approval.

## Gate progress as of 2026-11-15
Legend: `[x]` implemented/documented with cited evidence; `[ ]` pending; `REVIEW` means not approved.

### 0. Governance / prerequisites
- [x] Read the owner's v1.1 plan, including section 09 art direction and section 10 visual approval. Evidence: original document inspected in current session.
- [x] Confirm NEW-PSI repository, React/Vite, current `Page` route and brand UX guides. Evidence: GitHub files `App.tsx`, `types.ts`, `config/routeMeta.ts`, `AGENTS.md`, `pages/Dashboard.tsx`.
- [x] Check existing agency skill/roster/registry, legal OSS gate and developmental guardrails. Evidence: `AGENTS.md` linked files.
- [x] Create non-production development branch. Evidence: `feat/safety-nexus-vg1-20261115`.
- [x] Confirm PR #230 head and historical CI at `143c07f49d1cca562b5dfe4b326400899534b6a3`: `43710000575` release PASS and `43710000634` cross-department PASS. Current iteration head must be rechecked after this document commit; no production deployment. Preview deployment not independently confirmed.

### 1. VG-0 — visual reference lock
- [x] Identify reference composition and timing from source plan: particle core, multiple orbital planes, HUD panels, camera move, 0–12s intro.
- [ ] Commit or externally preserve 4–6 exact source reference stills with owner-provided reuse rights; binary file not currently in GitHub repo.
- [ ] Side-by-side matched 16:9 source vs implementation captures and ≥10-second motion comparison. Original 92203.mp4 (~44.3 seconds) is available in the source conversation; internal source still at 12s reviewed. No side-by-side visual approval yet.
- [ ] Owner visual approval of key reference frames.

### 2. VG-1 — first interactive hero prototype
- [x] Implement **new route** `pages/SafetyNexus.tsx` as React lazy module, separate from Dashboard.
- [x] Add Canvas software-projected dense point shell with far/near particle shading, three independently tilted animated orbits and moving luminous tracers.
- [x] Add custom dark/amber/teal editorial UI, 5 interactive Q1–Q5 workflow nodes, six safety-signal labels, contextual details and links to existing pages.
- [x] Add animation pause, document hidden pause, reduced-motion toggle and responsive flat mode.
- [x] Register page type, route metadata, sidebar and practitioner operational mode; no main/dashboard replacement.
- [x] Show loaded-record count only as nonofficial count; mark all currently decorative animation as design, **not live risk**.
- [x] Previous tested commit `143c07f` passed GitHub release `43710000575` (`npm run verify:ci`: type checks, unit tests, build). Newer changes require another full CI run before PASS is current.
- [x] Chromium automation at `143c07f` passed **18/18** checks, artifact `14160391532`, screenshots `nexus-390/768/1440/1920.png`, visual inspection by assistant: desktop core present, 390px first fold initially obscured by overview. Responsive order adjusted in subsequent branch commit; recapture/verification still required.
- [ ] Benchmark FPS, CPU/GPU, animation start/stop and low-power Android.
- [ ] Implement WebGL shader/bloom/true 3D only if visual comparison demonstrates VG-1 software projection insufficient; review OSS/license first.
- [ ] **Owner art approval (V01–V07). Current status: REVIEW / NOT APPROVED.**

### 3. P0/P2 — audited data view
- [ ] Map site/month/trade/user role from trusted existing selectors and persisted scopes (currently not finalized).
- [ ] Map approval/review, missing/pending, interim controls, due/reinspection, official report denominator and education completion exactly.
- [ ] Complete P2 trusted-scoped 2D operations view and report parity. **Partial implementation:** `utils/safetyNexusViewModel.ts` read-only *currently loaded* `selfAssessedRiskLevel` distribution (상/중/하/미분류), no individual info, no claim of site/month scope or verified approvals. `tests/safetyNexusViewModel.test.ts` added; requires latest CI confirmation. No official report parity claim.
- [ ] Require proper authorization for source record/PII drilldown; avoid cross-site leakage.

### 4. VG-3 / P3 / P4 / VG-4
- [ ] Bind visual intensity / state exclusively to verified data; unverified remains muted and labeled.
- [ ] Keep delayed/overdue/temporary mitigation and reinspection pending explicitly unresolved.
- [ ] Test accessibility, color-independent state, keyboard, screen-reader and motion restrictions.
- [ ] Protect existing OCR / Dashboard / Reports / EducationReturn / Inspector from regression.
- [ ] Side-by-side stills and video motion QA vs owner 92203.mp4; 320/390/768/1366/1440/1920 widths.
- [ ] Independent security/access review and release QA (`npm run verify:ci`).

### 5. Release gate
- [ ] Complete owner's aesthetic signoff **and** functional/data/QA approval.
- [ ] Verify PR head SHA + CI; explicit owner decision to merge.
- [ ] Confirm Vercel preview, Vercel production SHA and operating domain if deployed with permission.
- [ ] Record rollback route and owner approval. **Production deployment not authorized yet.**

## Iteration 02 · 2026-11-15 11:38 KST onward
**Observed CI failure and fix**
- PR #230 first cross-department run `43709519575` FAILED only on new Nexus browser check: script used `__setCurrentPage`, which is dev-only and absent from production build. Nine pre-existing journeys passed; this was test entrypoint error, not evidence of broken runtime.
- Fixed `scripts/verify-safety-nexus-browser.mjs` to navigate via actual sidebar button, and registered page in `utils/uiCompositionConfig.ts` so default normalized menu includes the feature.
- Revalidation on commit `143c07f`: release PASS `43710000575`; company QA PASS `43710000634`; newly added Nexus Chromium smoke **18/18 PASS** (synthetic only).
- Downloadable GitHub CI screenshot artifact: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43710000634/artifacts/14160391532`.
- Reviewed actual desktop 1440 and mobile 390 screenshots. Identified crucial 390px first-fold problem: long overview displaced the glowing hero.

**Subsequent improvements on feature branch, not yet independently visually approved**
- Responsive hero first at tablet/mobile sizes; text sizes enlarged for operating copy.
- Mobile starts with animated rotation **paused**; still 3D lighting remains, explicit play available.
- Active Q1–Q5 core focus interpolates smoothly instead of resetting its animation state on every click; selected orbital connection trace added.
- Automated browser assertion now checks hero appears *before* overview and within first mobile viewport.
- Added minimal, privacy-safe view-model for self-assessed risk distribution, not official risk classification, not cross-site/month report. New unit tests cover missing values and privacy.
- Latest source head before documentation update: `04897ec717936e2d740b09cb5a5f6bee5f720e22`; CI started `43710681128` / `43710681142`, results must be refreshed.
- These changes **do not** satisfy V01–V07 art sign-off, live data parity, server roles or actual-device benchmarking.

## Iteration 03 · Visual-first immersion and verified screenshots (2026-11-15)
- Added **fullscreen cinematic presentation mode** using an isolated React portal, with explicit on-screen exit and Escape key. The normal AppShell remains intact; no production Dashboard replacement.
- In the prototype-only Canvas renderer, selected node has smooth easing and a highlighted **navigation path**, without claiming verified field connection.
- CI source commit `a349ba39eb340a02d4de1849bcc9c917bb25ffe2`: **release verification PASS** GitHub Actions `43710991301`; **cross-department synthetic browser PASS** `43710991255`. Nexus smoke: **21/21 PASS**, including mobile hero-before-overview, full-screen open, screenshot, Escape exit, Q4 delayed-action meaning, 2D fallback and no horizontal clipping.
- Real Chromium screenshot artifact: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43710991255/artifacts/14160815410`; contains `browser/safety-nexus/nexus-390.png`, `nexus-768.png`, `nexus-1440.png`, `nexus-1920.png` and `nexus-immersive-1440.png`.
- Inspected 1440px immersive and 390px mobile captures in-session. Assessment: immersed desktop layout is more cinematic with central glowing sphere and balanced evidence panel, but current software-projected Canvas still differs from reference video in bloom, particle intensity and camera dynamics. **V01–V07 owner approval is NOT claimed.**
- Mobile screenshot still showed a duplicate global page heading above the graphic. Fixed by hiding the common PageHeader for `safety-nexus` alone (`config/routeMeta.ts`) and strengthening the visual smoke threshold to `hero.y < 400` at 390px. **Latest header-only revision requires fresh CI/screenshots.**
- Original video comparison frames independently extracted from the owner-provided 92203.mp4 at **6/12/20/27/35 seconds** in the current conversation. The reference assets are not published or copied to the repo.
- Safe data view still counts loaded record rows and Q3 self-risk classification only; site/month/official denominator, approval controls and verified action states remain pending.
- Release remains **BLOCKED** pending visual approval, performance on real devices, data/role audit and explicit user approval. No `main` merge, no production deployment.

## Iteration 04 · Final validation of mobile header improvement (2026-11-15)
- **Code revision under test**: `91819b2aaddbb10bc133c5b10090dab8f016e6a0`, PR #230 remains draft and unmerged.
- **Release CI PASS**: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43711514938`.
- **Full synthetic cross-department CI PASS**: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43711514992`.
- **Safety Nexus Chromium smoke PASS 21/21**, screenshot artifact `14161315178`: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43711514992/artifacts/14161315178`.
- **Measured 390px first-fold hero top**: previous 422.109375px → now **313.234375px**; `overviewTop=856.53125px`. Real Chromium 390 screenshot reviewed: complete luminous core and 5 interactive nodes visible above mobile bottom navigation.
- **Immersive mode**: 1440px screenshot reviewed, on-screen exit and Escape verified; ordinary AppShell is preserved.
- **Residual visual gap**: current 2D Canvas software projection remains softer than source video's stronger glow, richer particle bloom and camera sweep; V01–V07 owner visual approval remains **PENDING**, not simulated by CI.
- **Residual operational gap**: trusted site/month/trade scoping, official report denominators, action due/recheck state contracts, privileged source authorization, low-end real device and GPU/thermal profiling remain **PENDING**.
- **Branch strategy**: this documentation-only checkpoint does not change application source; prior code SHA above is the verified reference. Production is unchanged.

## Iteration 05 · Native GPU bloom + defensible loaded-record status view · 2026-11-15

**Implemented and verified code SHA:** `7450e48715959bf8ba18ee4d55fd2e8ee99a5495` (before documentation-only handoff update).
- [x] Add `pages/NexusWebGLCore.tsx`: native WebGL 1 additive point sprites with warm/teal particles, depth projection, three independent orbit planes, moving camera, bloom/solid passes, visibility pause, low-power profile, mobile density control. No package, remote AI calls, or API keys.
- [x] Keep Canvas 2D fallback when GPU context/shaders fail; improve fallback highlight bloom and camera parallax. **Fallback implementation exists but forced WebGL-disabled Chromium smoke is still PENDING.**
- [x] Correct first GPU rendering's hollow center by adding interior volumetric points. Correct follow-up excessive whiteout by controlling bloom luminance based on actual display width and ensuring PSI text contrast.
- [x] Preserve 2D alternative, pause, reduced motion, cinematic immersive view, 5 interactive stages and six signals.
- [x] Add `sliceLoadedNexusRecords()` with strict valid date parsing, read-only month and trade filtering and explicit missing-date exclusions; unit tests cover exact month, trade, missing dates, unmapped/empty data.
- [x] Reuse `buildMonthlyFieldFollowupSummary()` (existing tested state semantics) to show six distinct **loaded-record** follow-up categories: unresolved, overdue, interim control, scheduled, reopened-history, recorded completion; no conflation with work-restart authorization.
- [x] Explicitly show authenticated **site** scope as unavailable/disabled: ordinary WorkerRecord has no verified site_id / site-specific RLS. The 2026-11-01 SQL proposals are not applied to the operational worker data path. **NO verified site/month report parity claim.**
- [x] Synthetic browser QA added 5 status/source checks and measured exposure clipping criterion from an actual 390px stage screenshot (white pixels RGB >246/243/215 must be <9%). Functional accessibility/overflow/navigational tests retained.

**Evidence and observed findings**
- [x] GitHub release verify **PASS**: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43715061508`.
- [x] GitHub cross-department browser verify **PASS**: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43715061446`.
- [x] Safety Nexus smoke **27 / 27 PASS**, WebGL active in CI, 390px overexposed white ratio **0.0008711329273096385** (<0.09 limit).
- [x] Source-only screenshot artifact (synthetic data): `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43715061446/artifacts/14162526259`, files `browser/safety-nexus/nexus-390.png`, `nexus-768.png`, `nexus-1440.png`, `nexus-1920.png`, `nexus-immersive-1440.png`.
- [x] Desktop and mobile screenshots manually reviewed. Initial hollow desktop orb and severely blown-out mobile orb **rejected and improved**. Current tested desktop has a visible volumetric luminous core; mobile readable PSI and visible fine-grain particle texture.
- [ ] **Owner final V01–V07 aesthetic approval** still PENDING. Screenshots do not substitute for reference-video motion comparison.
- [ ] Low-end Android/iOS actual-device FPS/thermal/energy and GPU context-loss retry must be verified.
- [ ] Fully authenticated site_id → month/trade → official report denominator reconciliation must be built using real server-enforced per-site access; 2026-11-01 staging proposals alone are insufficient.
- [ ] Privileged evidence drilldowns, verified action-closure/reinspection approvals, historical data migrations and production error monitoring remain separate P0/P2/P4 tasks.
- [ ] 10+ sec video motion comparison and owner final art signoff remain release blockers.

**Safety rules / release state:** `main` untouched; PR #230 remains **DRAFT**, unmerged. No Vercel Production release. No site claims, AI risk adjudication, work-restart decision or personal worker ranking inferred.

**Next implementation order**
1. Create authorized test fixture for verified site_id without making tenant policy bypass; compare month/trade official report row denominators under the same scope and cutoff.
2. Connect action follow-up + reinspection to authenticated server-provided site scope; never equate interim control or logged completion with reviewed safe state.
3. Add forced-GPU-failure test, mobile actual-device FPS/thermal budget, 10-second camera motion clip and direct reference comparison.
4. Ask owner to approve visual gates V01–V07, then complete independent release gates. Do not merge/deploy before explicit approval.

## Current modified files
- `pages/SafetyNexus.tsx` (new)
- `pages/SafetyNexus.css` (new)
- `App.tsx` (lazy route)
- `types.ts` (Page union)
- `config/routeMeta.ts` (optional practitioner page)
- `components/Sidebar.tsx` (pilot menu)
- `utils/operationalModeUtils.ts` (visibility)
- `docs/safety-nexus/SAFETY_NEXUS_MASTER_PLAN_V1_1.md` (new)
- `docs/safety-nexus/SAFETY_NEXUS_HANDOFF.md` (this file)
- `utils/uiCompositionConfig.ts` (new route default sidebar registration)
- `scripts/verify-safety-nexus-browser.mjs` (real menu navigation, responsive screenshots, hero-first assertion)
- `scripts/verify-psi-company-browser.mjs` (cross-department scenario)
- `utils/safetyNexusViewModel.ts` (loaded-record-only anonymized self-assessment)
- `tests/safetyNexusViewModel.test.ts` (pure unit tests)

## Next strictly ordered work
1. Pull latest branch head and verify latest release + full Chromium CI; if failed, inspect the exact job log and fix without weakening tests. A previous SHA's pass is not the latest SHA's result.
2. Retrieve latest CI screenshot artifact (especially 390px hero above-fold and 1440px core), inspect for actual visual quality and overlap, then compare with owner's video.
3. Continue visual refinement from native GPU volumetric bloom VG-5; measure a 10-second source comparison and profile real low-end hardware. This is not yet owner-approved cinematic equivalence.
4. Audit data semantics, introduce view model and 2D operational states; add tests.
5. Update this handoff after EVERY increment, including actual SHA, checks, evidence, blockers.
6. Present actual comparison to owner; no production merge.

## Re-entry prompt
> NEW-PSI SAFETY NEXUS 개발을 이어서 진행해줘. GitHub `TELLOWSS/NEW-PSI`의 `feat/safety-nexus-vg1-20261115` 브랜치와 `docs/safety-nexus/SAFETY_NEXUS_MASTER_PLAN_V1_1.md`, `docs/safety-nexus/SAFETY_NEXUS_HANDOFF.md`를 먼저 확인하고 실제 HEAD·PR·CI·미완료 체크리스트를 조회해. 사용자 영상 `92203.mp4`와 기획서 v1.1의 **영상급 비주얼 V01–V07** 조건으로 한 단계씩 구현하고 QA를 남겨줘. 최종 승인 전까지 main 병합·운영 배포 보류.
