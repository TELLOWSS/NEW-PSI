# NEW-PSI SAFETY NEXUS · Visual Master Plan v1.1
> **Source**: owner-provided 92203.mp4 (~44 seconds) and \`NEW_PSI_SAFETY_NEXUS_비주얼혁신_기획서_V1.1_영상급디자인보강.docx\` (2026-11-15, 8 pages). This Markdown execution specification accompanies that original Word/PDF plan; it does not supersede the owner-approved visual reference.

## Goal / non-negotiable
Build a **cinematic, refined safety intelligence interface** whose first impression recalls the reference video's luminous, depth-rich particle core, differentiated orbital layers, selective glow and deliberate camera movements, while remaining a **useful NEW-PSI safety management UI**.
Do **not** confuse a functioning 3D object with an approved visual design. The owner separately approves visual fidelity and operational validity.

## Boundaries
- Product: **TELLOWSS/NEW-PSI only**. SMART TBM and PSI ZERO DAY are separate.
- Scope: optional administrator/practitioner visualization mode, **not** default dashboard replacement. Keep WorkerTraining / OCR / Reports / Dashboard contracts intact.
- Data truth: Worker Q1 dangerous work → Q2 hazards → Q3 self-assessed high/medium/low **and reason** → Q4 feasible controls → Q5 behavioral commitment. Six signals: risk awareness, education comprehension, practice participation, PPE/rules, communication/reporting, stop-work sensitivity.
- AI is suggestive; human administrator reviews source and approves. No worker ranking, auto-declared compliance, auto work-stop/restart or invented causal improvement.
- Delayed controls must remain *unresolved*: reason, interim protection, responsible party, target date, reinspection date; only verified evidence/approval closes.
- Data missing, rejected, pending and approved MUST be distinct; no fake data in management reports.
- Interaction and reduced-motion 2D fallback must retain equal route access.
- Follow \`docs/PSI_PRODUCT_VALUE_AND_DESIGN_BLUEPRINT_2026-08-21.md\`, \`PSI_BRAND_VOICE_GUIDE.md\`, \`docs/PSI_DEVELOPMENT_GUARDRAILS.md\`, \`AGENTS.md\`.

## Video reference and art language
- Ambient black/charcoal depth, amber-white microscopic point-cloud shell in the main field, different orbital inclinations/speeds/depth, restrained teal as secondary telemetry, sparse HUD micro-panels.
- Graphic effects must never conceal body text or misrepresent risk severity.
- First **3 seconds**: hero is compelling even as a still.
- 0–2s: stars establish dense luminous geometry; 2–5s: independent orbit planes appear; 5–8s: grounded node + information reveal; 8–12s: focused node and evidence panel.
- No video producer wordmark, content or visual assets copied.
- Audio silent by default.

## Architecture / sequencing
1. **P0** inspect current page contract, record/approval/action state semantics, official report count definitions, access roles, tests.
2. **VG-0** freeze 4–6 actual frames from 92203.mp4 (core / deep orbit / data nodes / alert / camera transition). Verify visual reference availability.
3. **VG-1** develop real interactive first art-quality prototype. Mandatory reference comparison; no feature-complete claim until human approves.
4. **VG-2 / P2** implement read-only 2D operational view, month/site/trade filters and evidence navigation. Document source and cutoff of every value.
5. **VG-3 / P3** bind 3D presentation to *verified* state from established data adapters; no autonomous server polling or new external AI keys.
6. **P4 / VG-4** compare reference frame-by-frame, UX/visual QA on 320/390/768/1366/1440/1920 widths, low-end Android, iPhone, keyboard, reduced motion, safe error fallback, typecheck, tests, build, production regression.
7. **P5** feature flag, explicit final owner signoff, gated merge and deployment; confirm deployed SHA / domain / rollback.

## Visual approval gates (separate from functional QA)
| ID | Visual condition | Rejection |
|---|---|---|
| V01 | Core has perceptible *front and back* particle depth and dimensional luminance | Flat amber circle or static image |
| V02 | Multiple orbital planes with independent speed, tilt, depth and light trail | One SVG ring rotating |
| V03 | Fine-grain lighting, translucent atmosphere, controlled highlights, sharp typography | Orange fog obscures data |
| V04 | Focused camera/panel motion and click interaction remain consistent with semantic evidence | Animation unrelated to source data while marketed as live |
| V05 | 16:9 desktop composition passes screenshot and ≥10s motion review side by side | Feature-only acceptance |
| V06 | Mobile, pause, keyboard and low-motion alternative are readable and functional | Pretty but unusable |
| V07 | Owner expressly approves comparison with uploaded video | Developer self-certification |

## Operational gates
- O01 verified counts exactly agree with corresponding approved report under same scope and timestamp.
- O02 pending, planned, overdue, mitigating, reinspection and closed are never conflated.
- O03 no cross-site/worker privacy leak; role controls are enforced server-side for privileged reads.
- O04 original source, editor, history, approval and education evidence traceable.
- O05 no API call during animation; no polling, no chargeable runtime inference in the visualization loop.
- O06 \`npm run verify:ci\` and focused browser/visual/performance QA pass.
- O07 \`main\` unchanged until specific owner-approved merge; Vercel deployment remains blocked.

## Current technical implementation decision (VG-1)
- Design prototype uses **Canvas 2D with software projected sphere/orbits** and existing React/Vite; no new external package/license/cost.
- This is a performant initial **3D-looking prototype**, not yet WebGL/production-grade 3D renderer. If owner visual review demands full shader + GPU depth + post-processing, benchmark native WebGL/Three.js licensing/performance on an isolated branch before adopting.
- Present only a transparent count of currently loaded records, *not* unvalidated approval statistics.
- Animation stops on tab hide / pause / reduced motion. Refined 2D path and direct links to existing PSI work screens.
- Do not call this production complete until all gates pass.

## Handoff
Live checklist and explicit evidence: [SAFETY_NEXUS_HANDOFF.md](./SAFETY_NEXUS_HANDOFF.md).
