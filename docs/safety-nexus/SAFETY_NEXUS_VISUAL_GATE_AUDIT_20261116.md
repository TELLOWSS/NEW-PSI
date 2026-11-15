# SAFETY NEXUS · Visual gate audit · 2026-11-16 KST

**Status: NOT VISUALLY COMPLETE / NO ART SIGN-OFF.** The existence of a working shader and passing browser smoke tests is not a substitute for the owner's artistic acceptance of the supplied reference.

## Original source actually inspected

- Exact owner-provided source: `92203.mp4`, 44.301144 seconds, 1080 × 2340 portrait recording.
- Exact owner-provided plan: `NEW_PSI_SAFETY_NEXUS_비주얼혁신_기획서_V1.1_영상급디자인보강.docx`, particularly sections 09 / 10 and the 12-second scene storyboard and V01–V07 gates. The user provided these in the conversation; do not commit copied source art or the external brand.
- Source stills checked in-session at approximately 2s / 6s / 12s / 20s / 28s / 35s. At 12s the embedded display shows a comparatively compact orange-white particle nucleus, multiple wide orbit sweeps with bright moving anchors, sparse upper controls, very dense bottom micrographs/telemetry. The portrait social-media frame includes unrelated outer controls/captions; ignore those when designing PSI.
- Baseline REAL Chromium screenshots directly inspected: `nexus-immersive-1440.png` (1440×960) and `nexus-390.png` (390×900) from browser CI artifact `https://github.com/TELLOWSS/NEW-PSI/actions/runs/43720312702/artifacts/14164415996` and locally available user-conversation captures.
- These comparisons use different display ratios/brands/data. No claim of pixel-for-pixel parity or artistic approval.

## Mandatory V01–V07 acceptance matrix

| Gate | Source-approved condition | Current objective evidence | Verdict |
| --- | --- | --- | --- |
| V01 | Front/back particle depth and non-flat nucleus | Native GPU WebGL shell+interior points, perspective/projection, additive two-pass glow, 2D fallback. Prior desktop/mobile screenshots show visible volume and readable PSI wordmark. | **IMPLEMENTED / OWNER ART REVIEW OPEN** |
| V02 | Independent tilted orbits, depth, varying speed and light trails | WebGL three orbital layers, two-three SVG backplane guides, selection traces. The branch now includes GPU moving light anchors on each orbit. | **IMPLEMENTED; NEW EFFECT CAPTURE REVIEW PENDING** |
| V03 | High-end micro-lighting, disciplined bloom and sharp information hierarchy | Functional glow and contrast guard; source frame has more layered light sweeps and periphery information. Real smartphone is not yet measured. | **PARTIAL / ART APPROVAL OPEN** |
| V04 | Smooth, purposeful camera/panel transition, no fake live evidence | New *user-initiated optional* 12-second cinematic shader camera sweep, staggered orbit guides, screenshot timeline, skip/auto-return. Presentation cues are clearly marked non-live; real site risk evidence is NOT yet bound. | **PARTIAL / CINEMATIC BROWSER TEST PENDING** |
| V05 | Real 16:9 comparison and >=10-second motion comparison to the source | Prior comparison was still-only. New browser automation captures 0,3,6,10-second frames and confirms changed frames, but does NOT substitute for an owner-reviewed **video-to-video motion comparison** or independent visual approval. | **NOT COMPLETE** |
| V06 | Responsive/mobile, keyboard/2D access, pause/reduced motion, low-end device performance | Existing Chromium 390/768/1440/1920, synthetic GPU failure fallback and reduced-motion tests passed on previous code SHA. Latest cinema button is disabled when reduced motion. Physical low-end Android/iPhone FPS/GPU/thermal measurements NOT performed. | **PARTIAL** |
| V07 | Owner explicitly accepts fidelity to original `92203.mp4` | No recorded owner V01–V07 signoff. | **NOT APPROVED** |

**Do not report a numerical artistic-completion percentage**; these are independent visual and operational gates, and no scalar completion percentage has been agreed by the owner.

## New work in this iteration (source branch only)

1. `pages/NexusWebGLCore.tsx`: explicit opt-in `u_story` 0–12 second shader cue for formation, camera drift, shallow dolly, tilt and depth; independent orbit tracers. Normal mode always paints immediately and requires no intro wait.
2. `pages/SafetyNexus.tsx`: optional **12초 시네마틱 보기** control with **12초 연출 중단** and automatic return, no change to loaded data or action states. Honors reduced motion and 2D mode; Canvas fallback supports camera parallax.
3. `pages/SafetyNexus.css`: restrained orbit sweep, fine captions, small-screen controls, reduced-motion bypass. The visual declares **그래픽 시연 / 실시간 위험 경보 아님**.
4. `scripts/verify-safety-nexus-browser.mjs`: record 0/3/6/10-second screenshots, compare stage screenshot digests for motion, assert normal interaction returns after 12 seconds, verify reduced-motion replay disabled. This is functional motion QA, **not owner approval**.

## Verified VG-7 browser correction and motion evidence (2026-11-16 KST)

**Tested source-code SHA: `fda49654ca4996850f771e2c804aa30ef35d131d`.** This is the implementation reference preceding documentation-only commits.

- [x] GitHub Release CI PASS: https://github.com/TELLOWSS/NEW-PSI/actions/runs/43755965841
- [x] GitHub company browser CI PASS: https://github.com/TELLOWSS/NEW-PSI/actions/runs/43755965810 — company product **10/10**, Safety Nexus **44/44** checks.
- [x] Browser artifact: https://github.com/TELLOWSS/NEW-PSI/actions/runs/43755965810/artifacts/14178980175 — `browser/safety-nexus/nexus-immersive-1440.png`, `nexus-390.png`, `nexus-cinema-00s.png`, `03s.png`, `06s.png`, `10s.png`, `nexus-cinematic-12s.webm`, 2D forced fallback, results JSON.
- [x] CRITICAL REGRESSION FOUND AND FIXED: initial cinematic CI passed **43/43** while silently falling back to Canvas 2D because a GPU shader referenced a ring variable outside its scope. The missing local identifier prevented GPU shader compilation. Restored correct shader scope and real angular ordering of orbital tracer points in `pages/NexusWebGLCore.tsx`; **new QA explicitly FAILS if the primary Chromium cinematic scene is not WebGL**. Forced GPU-unavailable functionality remains an independent test.
- [x] Browser result JSON explicitly confirms `renderer:'webgl'`, 1440px cinematic still, 390px hero top **297.734375px**, and absence of horizontal scrolling. Mobile overexposed bright-pixel ratio **0.0009999090991728026** under 0.09 threshold.
- [x] 0/3/6/10-second captures differ in their SHA-256 snapshot digests; normal controls return after the 12-second opt-in sequence. A true continuous **15.44s WebM screen recording**, including the 12s sequence and navigation, was generated and personally inspected. Replay is disabled in the in-app reduced-motion mode.
- [x] Actual current desktop immersive and 390px screenshots inspected. Current GPU sphere is legible and dimensional; however the original source has a stronger wide orbital sweep, external anchors and more dramatic changing camera framing. **These remain artistic gaps, even though WebGL and motion QA now pass.**
- [ ] V05 **human side-by-side video-to-video approval** remains PENDING. The new WebM is a playable comparison input, not evidence that the owner approves its motion aesthetics.
- [ ] V07 explicit owner signoff and physical Android/iPhone GPU/FPS/temperature remain PENDING.

## Unresolved visual issues / ordered next work

1. Visually inspect newest 1440/390 screenshots and all cinema frames in the current CI artifact; check luminance clipping, text contrast, orbit readability, stage control wrapping, and genuine camera movement.
2. Produce a **video-to-video** 10+ second reference comparison with matched inner-screen cropping and proper time axes. Do not claim approval merely because the two clips both move.
3. Refine source-inspired peripheral HUD density without copying the original creator's logos, branding, labels or fabricated numerical telemetry. Avoid clutter that obscures workflow evidence.
4. Measure native Android/iOS FPS, battery/heat and GPU loss/recovery on representative devices; keep a minimum-function 2D route.
5. Obtain the user's V01–V07 visual acceptance explicitly before permitting merge/deployment. The official report/tenant authorization gates remain independently blocked by the Iteration 08 handoff.

**Release state:** `main` untouched, production Vercel untouched, real data/official report gate incomplete. Draft PR #230 must stay unmerged.
