# Changelog

## v0.7.0 — Phase 0 (branch phase-0/audit-records, staging only)
Spec: MouldVision Phase 0 Specification rev 2 + four implementation safeguards (9 Oct 2026).
- Trial lifecycle state machine (ARMED → LOCKED → BLANK); single `submitAnswer()` with synchronous guard; pointer/keyboard/touch dedupe.
- Full trial records; quick-mode skips recorded as not presented (never as misses).
- Run record schema 1 with versions, geometry, device, ladder, rendering model, integrity hash (SHA-256 over test definition + responses), structured validation.
- `finaliseRun()` idempotent; COMPLETE_UNSAVED on storage failure or limit; INCOMPLETE drafts exportable only.
- Browser storage treated as temporary: warning at 80, stop-saving at 100, user-confirmed delete of exported records only.
- POSITIVE/NEGATIVE/biotoxin labels removed; heading "Visual contrast test results"; seven-section report; reference curve off.
- Rows 7–9 marked exploratory (computed sub-step amplitude under the assumed rendering model); v1 scoring rule unchanged.
- Staging build target with separate storage keys and banner.
Unchanged: drawGrating(), contrast ladder, sequence, visual design, branding. Live artefact not republished (pinned in app/live-artifact.json).

## v0.6.0-prototype — baseline as delivered 9 Oct 2026
