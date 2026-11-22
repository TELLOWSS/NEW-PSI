# NEW-PSI Living UI visual-only production candidate (2026-11-22)

This is an isolated UI-only subset of draft PR #237, based on main `8aa4dea89f789d569a715386e1646d848ceb17c1`.

Included: operational AppShell-scoped motion stylesheet; PageHeader page-entry class; route-key remount; operational CSS import; source test; synthetic Chromium computed-style normal/reduced-motion verification. Existing current production navigation, camera, OCR, L06 Q1-Q5, security and database are otherwise unchanged.

Excluded: PR #237 L03~L18 workflow features, unapproved worker submission, Supabase staging SQL, any schema/RLS/GRANT, data migrations, accounts, real worker records, paid API, external calls and unsafe claims of actual safety completion.

Release gates for *this narrow decorative UI subset*: same-HEAD unit/build, company Chromium synthetic motion QA and Inspector regression, production ready/hash and alias check. This does **not** authorize the full PR #237, whose 13 human acceptance gates remain pending. Real Android/TalkBack, field printer and language QA are not automatically verified by this change.

The product owner explicitly requested main/Vercel synchronization on 2026-11-22. Preserve PR #237 as Draft until broader user acceptance, never bypass its feature gates by claiming the cosmetic subset covers those features.
