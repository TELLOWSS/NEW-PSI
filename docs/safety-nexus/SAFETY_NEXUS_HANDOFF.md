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

## Iteration 06 · Staging site scope + GPU failure and reinspection QA · 2026-11-15

**Verified application source HEAD:** `5016369481e53b4ef4805ab3a57c79da5a48ffde` (before this documentation-only commit).

### Implementation and evidence
- [x] **GPU unavailable fallback browser simulation:** `scripts/verify-safety-nexus-browser.mjs` now forces the WebGL context creation API to return null on a separate real Chromium page, captures `nexus-forced-canvas-fallback-390.png`, and checks Q5 remains interactive.
- [x] **Synthetic GPU context loss** triggers 2D fallback and checks for script errors. This does **not** prove physical GPU recovery after system context restoration.
- [x] **Reduced-motion toggle** disables both Canvas/WebGL motion and CSS orbital/panel animations even without OS motion-reduction settings. UI root now exposes `data-reduced-motion`.
- [x] **Staging-only site-scoped anonymous aggregate SQL** in `supabase/proposals/psi_nexus_site_aggregate_staging.sql`. Read-only grants to authenticated site members; **no client write grants**. Requires active tenant membership, active site membership and active site.
- [x] Six `PGlite` cases in `tests/nexusSiteAggregateScope.test.ts` passed for cross-site/tenant isolation, same site+month+trade+cutoff denominator, suspension revocation, blocked client INSERT/UPDATE/DELETE and impossible totals/reconciliation.
- [x] Follow-up and practice/recheck views now share **the exact same loaded record date/trade filter**, via `filterLoadedNexusRecords()` in `utils/safetyNexusViewModel.ts`. No worker names or personal content flow into aggregated UI.
- [x] NEW-PSI existing `buildPracticeVerificationSummary()` reused to display **five independent** signals: education delivered, field observation, recheck events, latest field recheck need, overdue recheck need. No inference of corrective-action closure or work restart.
- [x] Extra unit tests and smoke assertions for filter precision and recheck/education boundary.

### CI results (verified)
- [x] **Release CI PASS**: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43720312705` — includes `nexusSiteAggregateScope.test.ts` **6/6 PASS**.
- [x] **Cross-department CI PASS**: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43720312702` — existing product suite **10/10**, NEXUS focused Chromium **35/35 PASS**, error-free.
- [x] Screenshot/QA artifact `14164415996`: `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43720312702/artifacts/14164415996`.
- [x] Actually viewed screenshot `nexus-immersive-1440.png`, `nexus-390.png` and `nexus-forced-canvas-fallback-390.png`. Fallback core and five Q nodes visually present on 390px. No visual V01–V07 approval asserted.
- [x] Actual 390px hero top **297.734375px**, no sideways overflow, overexposed pixel ratio `0.0008711329273096385` (< `0.09` automated threshold).

### Critical boundaries NOT cleared
- [ ] **Live site authorization is NOT implemented for general WorkerRecord or follow-up histories.** The new SQL is purely `supabase/proposals` with synthetic test data, not a migration and not an authorized production API.
- [ ] **Official report denominator parity is NOT proven.** A staging CHECK constraint validates internal arithmetic and requires matching values when a reconciliation field is set, but cannot establish where an official report denominator came from. Independently verified source+cutoff+server-side write provenance is still required.
- [ ] Cross-site assignments, source evidence reads, anonymous aggregation and clearance of recheck closure must pass server-side authorization and owner-approved migration. Do not enable the site selector prematurely.
- [ ] Physical low-end Android/iOS GPU context loss and sustained FPS/heat; >=10 second side-by-side comparison to original 92203.mp4; visual owner V01–V07 approval.
- [ ] `main` merge, Vercel preview/Production release, DB schema activation and live worker migration: **NOT AUTHORIZED**.

### Next ordered tasks
1. Design authorization-backed site aggregate **read API** that derives tenant, user and site memberships server-side; do not accept client-provided role authorization.
2. Tie independently verified source record IDs, site assignments, report denominator definitions, cutoff and reviewer signoff into a deliberate versioned write pipeline; test no cross-site leakage or backfill guessing.
3. Introduce audited site-scoped follow-up and recheck state read models, keeping local/temporary controls distinct from manager-approved closure.
4. Add true physical-device performance and GPU loss/recovery checks, 10s camera/lighting motion capture, and human art review.
5. Maintain draft PR until the owner specifically approves release; never silently apply staging SQL to production.

## Iteration 07 · Server-authenticated site read API (draft-only) · 2026-11-15

**Application code SHA verified:** `702f6f5ad732875ef594090e27e7dbeda82075aa` (handoff update follows).

### Work completed
- [x] Added `lib/server/tenantNexusSiteRead.ts` and wired it into `api/saas/access.ts?resource=nexus-site-aggregates`. Reuses `requireTenantContext()`, which authenticates the individual JWT with Supabase Auth and validates active tenant membership with a user-scoped anon/publishable client.
- [x] **Feature OFF unless `PSI_NEXUS_SITE_READ_ENABLED=true`**. A disabled API returns `503 NEXUS_NOT_ACTIVATED`, even if tenant headers are supplied. Existing shared administrator password/cookie cannot substitute for an individual bearer JWT.
- [x] GET-only; rejects role/tenant/user-supplied authority filters before any identity/DB query; no client INSERT/UPDATE/DELETE; no service_role credentials, key, images, names, IDs of workers or raw evidence in response.
- [x] `mode=sites` reads site memberships of the verified user and active sites using RLS-scoped queries; fails closed for wrong tenant/user, suspended/duplicate membership or malformed sites, rather than exposing cross-site or cross-tenant contents.
- [x] `mode=aggregate` requires **one explicit site UUID**, valid `YYYY-MM`, exact trade and valid past UTC `cutoffAt`. It reads one matching row from the still-unapplied `psi_nexus_site_aggregate_staging` contract; checks the returned tenant/site/scope/time and integer counts again before returning an anonymous DTO.
- [x] No matching authorized row is `NO_AUTHORIZED_AGGREGATE` with `aggregate:null`, **not zero risk**. A mismatched total, foreign row, absent schema or RLS provider failure produces a controlled error with no leaked provider diagnostics.
- [x] `recordedInternalMatch` only means two stored numeric fields agree; the API always returns `independentOfficialReportVerified:false`. Stored completion is `completionLogged`, never reinspection approval or work-restart permission. Server read does **not** yet activate a UI site selector.
- [x] `tests/tenantNexusSiteRead.test.ts`: 12 API contract tests for feature-disabled, GET-only, JWT/tenant denial, input injection, authorized site list, foreign site denial, no-PII aggregate, missing data, corrupted totals, stored versus independently verified report, missing-schema fail-closed.
- [x] Fixed incorrect 8-4-4-12 UUID regex found by CI to the standard **8-4-4-4-12** shape. Security validation was **not** relaxed. Temporary diagnostic logging was removed before validation.

### Evidence
- [x] **Release CI PASS** code SHA `702f6f5`: https://github.com/TELLOWSS/NEW-PSI/actions/runs/43739368092 . **1,901/1,901 tests**, including new 12/12 server read tests; TypeScript/build gates passed.
- [x] **Cross-department browser CI PASS**: https://github.com/TELLOWSS/NEW-PSI/actions/runs/43739368067 . Existing product journeys **10/10**, SAFETY NEXUS synthetic Chromium **35/35**. No new front-end screenshots required because this iteration changed server route + tests only.
- [x] Checked current PR #230 remains **DRAFT**, unmerged into `main`. No production Vercel deployment or operational DB mutation performed in this iteration.

### Still BLOCKED (do not mark production ready)
- [ ] The `psi_nexus_site_aggregate_staging` table exists **as GitHub proposal only**. User-scoped authorization path is coded/tested against a synthetic contract, but the real API cannot serve field records until authorized DB migration and source writer exist. `PSI_NEXUS_SITE_READ_ENABLED` must stay absent/off.
- [ ] **Official report parity:** independently obtain signed report source, exact authorized site assignments, source record IDs, matching month/trade/cutoff, denominator rules and reviewer acceptance. A stored `report_reconciled_at` alone does **not** prove an official report.
- [ ] **Site-bound followup/recheck approval:** current general WorkerRecord and `psi_tenant_actions.site_name` are not site_id/RLS proof. Build scoped immutable event IDs, evidence provenance, independent manager review and precise closure states before enabling; never equate interim control or recheck logged with approved work restart.
- [ ] Check whether `mode=sites` response field `sourceReady` could be misconstrued as aggregate readiness; clarify or rename before feature activation (currently OFF).
- [ ] Physical Android/iOS GPU/thermal testing, 10+ second source-video motion comparison and owner V01–V07 aesthetic signoff remain required.
- [ ] Absolutely no merge to main, preview-to-production promotion, production migration, real worker backfill or flag enablement without explicit approval.

### Next ordered development
1. Build **server-attested source provenance writer/manifest** for site-assigned source IDs and immutable snapshot cutoff; reconcile with *independently retrieved* official report denominator under identical scopes. Include two-site cross-leakage, missing ID, duplicate, stale month and changed cutoff tests.
2. Implement site-scoped follow-up and separate reinspection approval history in staging with actor/reviewer separation, evidence links and immutable transitions; avoid old `site_name` text as authorization.
3. Bind only server-attested, independently reconciled data to the optional SAFETY NEXUS site selector (off until backend is ready); use an explicit `NOT_VERIFIED` state.
4. Real device GPU/thermal and reference 92203.mp4 side-by-side motion review, then owner aesthetic and release acceptance.

## Iteration 08 · Official report original / source denominator lineage · 2026-11-16 KST

**Verified application code SHA:** `262af71c56bcc0edbef1eeb9930f3670f738a316` (this handoff-only commit follows).

### Real source-code findings and denominator definitions
- The current `pages/MonthlyGuidanceReport.tsx` generates **`analyzedRecords = records.length`** and a separate **`totalWorkers = new Set(worker identity fallback).size`**. The latter can fall back to a worker name when a stable key is absent; neither becomes an independently authenticated official denominator simply because it appears in the client report.
- `pages/Reports.tsx` also derives `filteredSourceRecords` using UI filters; those rows have no server-attested `site_id` ownership boundary. `getConfiguredSiteName()` is a display/configuration value, **not** authenticated site assignment.
- A monthly risk-assessment period may differ from the calendar month of downstream education. The official original must explicitly identify the **assessment period, denominator definition and source snapshot cutoff** before comparison. Do not equate “participating people” to “assessment form rows.”

### Implemented source provenance guards
- [x] `lib/server/nexusSourceProvenance.ts` provides a **deterministic snapshot** of exact `tenantId + siteId + assessment YYYY-MM + trade + immutable UTC cutoff`. It accepts only explicit source UUIDs, per-row site and tenant scope, assessment date, source-committed timestamp and Q3 self-assessment value.
- [x] Fails closed on **missing/duplicate source ID** (case-insensitive), cross-site or cross-tenant sources, wrong month/trade, invalid calendar date, later revision than cutoff, empty set, invalid risk levels, malformed scope and excessive row count. No silent filtering or guessing; 10,000 rows per snapshot ceiling.
- [x] Produces independent **SHA-256 digest of the sorted source-ID set**, and **canonical snapshot SHA-256** that binds the scope, cutoff, committed source states and risk distribution. No worker identities, names, statements or raw evidence are returned.
- [x] `compareNexusReportOriginal()` accepts **actual external PDF/XLSX byte content** and separately supplied original metadata; verifies file SHA-256, exact scope/cutoff, report issued after snapshot cutoff, `assessment_record_rows` denominator kind, count, and optional externally declared ID-set digest. Rejects cross-site, changed cutoff, wrong denominator kind, mismatched bytes/record counts and record-set claims.
- [x] An identical stored count is **not independently verified official evidence**. Positive comparison returns only `COUNTS_MATCH_PENDING_INDEPENDENT_APPROVAL`, with `independentOfficialReportVerified=false`, `acceptedByReviewer=false`, `authorizesActionClosure=false`, `authorizesWorkRestart=false`. Wording uses `declaredExternalDenominator` and `externalReportDeclaresSourceIdSet`; no deceptive “official” or “independently supplied” assertion is emitted.
- [x] `lib/server/tenantNexusSiteRead.ts` no longer claims `sourceReady=true` when the API merely found site memberships. It reports `sourceReady=false` / `sourceAvailability=PROPOSAL_ONLY_NOT_ACTIVATED`. Feature flag remains OFF in production.

### Staging-only immutable provenance receipts
- [x] `supabase/proposals/psi_nexus_report_provenance_staging.sql` proposes two separate append-only, RLS-protected tables: anonymous **source manifest** (site/month/trade/cutoff/count/hashes) and **external report original receipt** (original digest, document MIME, issuer label, declared denominator, same source scope).
- [x] Every report receipt has a **composite foreign key** binding its manifest's tenant/site/month/trade/cutoff. Cross-site associations and silent updates/deletes are blocked. All `anon/authenticated/service_role` client writes are revoked. Only active site+tenant members may read under RLS.
- [x] Database state stays **`scope_checked_not_server_attested`** and **`pending_external_evidence_review`**; there is deliberately no operational “approved” column or automatic passage to work-restart status.
- [x] These are **proposal files only**. They were not run against production or used to write actual site or worker data.

### Tests / evidence
- [x] `tests/nexusSourceProvenance.test.ts`: **14/14 PASS** with deterministic fixtures covering malformed IDs, duplicate IDs, mixed sites, changed cutoff, post-cutoff edits, wrong period/trade, report byte/hash mismatch, count mismatch, count-vs-person discrepancy, externally declared source-set mismatch and no automatic official approval.
- [x] `tests/nexusReportProvenanceSql.test.ts`: **6/6 PASS** using PGlite with two tenants and three sites; tests site RLS, membership suspension revocation, all client writes blocked, append-only mutation rejected, wrong-site report links and pending-only states.
- [x] **Release CI PASS**: https://github.com/TELLOWSS/NEW-PSI/actions/runs/43750545940 — entire **1,921/1,921 tests** green, TypeScript and build passed on application code SHA `262af71c`.
- [x] **Company browser CI PASS**: https://github.com/TELLOWSS/NEW-PSI/actions/runs/43750545976 — existing product journeys **10/10**, SAFETY NEXUS synthetic Chromium **35/35**. No new UI release or art approval implied.
- [x] Initial provenance test run failed due to incorrect UUID grouping; corrected to strict **8-4-4-4-12** and revalidated without weakening checks.

### Deliberate nonclaims — still BLOCKING release
- [ ] The current WorkerRecord and follow-up records still lack an activated, server-authorized, versioned **site_id + source-commit revision** path. The SHA-256 manifest is deterministic but **not a cryptographic server attestation** or identity proof until the writer loads the records from a trusted source.
- [ ] **No independently obtained, signed original official report has been bound to this code.** An issuer string and a checksum supplied by a caller are not proof of authenticity. Actual original-byte custody, issuer/signature verification, separate reviewer identity and review acceptance must precede any “officially reconciled” claim.
- [ ] No authorized server writer/read adapter persists these staging receipts. No real site/month/trade official denominator has been independently checked. DO NOT use old UI display site names, worker names, user-submitted roles, or self-supplied record lists as a source of authority.
- [ ] Real action closure, interim control, reinspection and work-restart authorization remain separate; never infer from a matched report count.
- [ ] No production schema activation, client flag enablement, `main` merge, Vercel deployment, real-data backfill, external sharing or visual V01–V07 acceptance. Real-device performance and ≥10s reference-video comparison are still open.

### Next strictly ordered step (Iteration 09)
1. Establish verified site-owned `WorkerRecord` source IDs and **DB-committed revision timestamps** with per-site RLS, authorized selection and repeatable snapshot cutoff. Implement source provenance creation **inside a server reader**, never from client-provided array data.
2. Create independently authenticated **report original intake** (actual signed PDF/XLSX bytes from the authority's source, cryptographic issuer evidence and immutable custody record), compare exact denominator kind/scope/cutoff and require a different authorized reviewer to approve.
3. Add write-once **server attestation/signature** and separately versioned approval event transitions; until then, keep all statuses explicitly pending and the site API default OFF.
4. Reconcile against both official assessment-record denominator and separately defined unique-participant denominator when the official original supports each, with mismatch reason codes and audit receipts.
5. Only then consider site-selector activation, live report parity tests, mobile/device load and visual signoff; keep Draft PR and production blocked.

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
- `lib/server/nexusSourceProvenance.ts` (new source SHA-256 and original report matching; pending only)
- `tests/nexusSourceProvenance.test.ts` (14 deterministic source/report lineage tests)
- `supabase/proposals/psi_nexus_report_provenance_staging.sql` (unapplied immutable RLS receipt proposal)
- `tests/nexusReportProvenanceSql.test.ts` (6 synthetic cross-site/immutability tests)
- `lib/server/tenantNexusSiteRead.ts` (sourceReady false until backend activation)

## Next strictly ordered work
1. Verify the latest source HEAD and read Iteration 06 evidence above; code SHA `501636948` passed CI. Documentation-only commits require separate status check.
2. Retrieve latest CI screenshot artifact (especially 390px hero above-fold and 1440px core), inspect for actual visual quality and overlap, then compare with owner's video.
3. Prioritize real authenticated site-scope read API and official report denominator parity; staging table and simulated RLS tests are NOT live authorization.
4. Audit data semantics, introduce view model and 2D operational states; add tests.
5. Update this handoff after EVERY increment, including actual SHA, checks, evidence, blockers.
6. Present actual comparison to owner; no production merge.

## Re-entry prompt
> NEW-PSI SAFETY NEXUS 개발을 이어서 진행해줘. GitHub `TELLOWSS/NEW-PSI`의 `feat/safety-nexus-vg1-20261115` 브랜치와 `docs/safety-nexus/SAFETY_NEXUS_MASTER_PLAN_V1_1.md`, `docs/safety-nexus/SAFETY_NEXUS_HANDOFF.md`를 먼저 확인하고 실제 HEAD·PR·CI·미완료 체크리스트를 조회해. 사용자 영상 `92203.mp4`와 기획서 v1.1의 **영상급 비주얼 V01–V07** 조건으로 한 단계씩 구현하고 QA를 남겨줘. 최종 승인 전까지 main 병합·운영 배포 보류.
