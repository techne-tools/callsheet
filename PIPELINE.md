# PIPELINE: callsheet

## Team
- **Head of Dept:** Chris — decides, signs off
- **A1:** Hermes — plans, routes, reviews, holds state between phases
- **Console:** opencode — recon, governance, design capture, build, fix pass
- **Devising:** agy — works with Chris to figure out what he wants
- **Stagehand:** zero — drudge work nobody else wants
- **Design review:** Open Design MCP — judgement pass (spec/critique runs)

## Phases
| # | Phase | Harness | Mode | Output | Gate | Status |
|---|-------|---------|------|--------|------|--------|
| 0 | Recon | opencode | autonomous | scaffolding report | report reviewed | ✅ |
| 1 | Governance (bedrock init) | opencode | autonomous | AGENTS.md, rules, workflows committed | committed | ✅ (done pre-pipeline, verified) |
| 2 | Devising | agy + Chris | interactive | design sketch + bones in tree | Chris signs off | ✅ v2 signed off 2026-08-18 |
| 3 | Design capture (impeccable init/document) | opencode | autonomous | PRODUCT.md + DESIGN.md committed | design truth committed | ✅ f91b84d 2026-08-18 |
| 4 | Build | opencode | autonomous | bones validated, weirdness fixed, hard bits done | diff vs sketch | ✅ e798c11+98937d0+e859348 2026-08-18 |
| 5 | Drudge | zero | autonomous | boilerplate, coverage, docs, obvious fills | diff reviewed | ⬜ |
| 6 | Design review (impeccable critique/audit + Open Design run) | Hermes + OD MCP | autonomous + interactive | numbered fix list, prioritised | fixes triaged with Chris | ⬜ |
| 7 | Fix pass (impeccable polish / compliance sweep) | opencode | autonomous | fixes applied, detector re-run clean | diff vs fix list | ✅ 5945970+3685ad7 2026-08-18 |
| 8 | Review | Hermes + Chris | interactive | final diff vs whole arc | Chris approves merge | ⬜ |

## Design lane invariants (all phases)

- **Design truth is committed.** PRODUCT.md, DESIGN.md, and `.impeccable/` config
  must be tracked in git — untracked docs are invisible to worktree agents
  (FLEET 2026-08-10). If phase 1/3 finds them untracked, committing them is the
  first task of the phase.
- **Refinement preserves; redesign replaces.** Refinement keeps the incumbent
  identity, copy, and behaviour; redesign replaces the look only, never product
  truth, content, or native affordances (impeccable rule).
- **The design system is the contract.** `.impeccable/design.json` (or the
  DESIGN.md north star) binds phases 4–7. Build and drudge may not introduce
  unsanctioned colours, radii, shadows, or typography. The compliance sweep at
  phase 7 enforces it; the Open Design run at phase 6 judges it.
- **One detector run per session minimum.** Phase 3, 4, and 7 each end with the
  impeccable detector (`node <skill-base>/scripts/context.mjs` + detect) on the
  touched UI files. MANUAL_DETECTOR_REQUIRED is not optional — it is the floor.
- **Open Design delivers, Hermes doesn't re-draw.** A review run's deliverable
  is the judgement; fix implementation goes to opencode at phase 7. Never
  substitute your own write_file for a run's deliverable.

## Current phase
**8 — Review** (Hermes + Chris, interactive)

## Handoff log
- **Phase 0 (opencode):** Recon complete — RECON.md written, TASK.md status updated. Verified by Hermes: all 5 acceptance criteria met; spot-checks confirmed (Cargo.lock untracked, rusqlite absent, no test script). Ledger: verified.
- **Phase 1 (bedrock):** Done pre-pipeline in root commit c8f9cad (AGENTS.md + .agents/ committed). Verified by recon.
- **Phase 2 (agy + Chris):** First-pass sketch produced; Chris amendments applied (accent borders, custom types + colour uniqueness, window presence modes, smaller text, clipboard ops, ghost cards approved) → DESIGN-SKETCH.md v2 signed off 2026-08-18.
- **Phase 3 (opencode):** Two failed dispatch attempts (sandbox external read → symlink fix; detector /tmp write → host-side verify), then completed by Hermes host-side: PRODUCT.md + DESIGN.md + .impeccable/ committed f91b84d. Impeccable CLI installed project-level (`npx impeccable install` — wires .agents/skills, .opencode, .codex hooks; tooling gitignored). Ledger: verified.
  - **Lesson (Q22):** impeccable tooling must be installed per-worktree via `npx impeccable install` (detects harnesses, vendors skill into project). Skill-script fallback (symlink) works but its detector runs DEGRADED (no htmlparser2/css-select). Full-strength detector = `npx impeccable detect`.
- **Phase 4 (opencode):** Build complete. Two parallel lanes (frontend @designer, backend @fixer) against a shared `CONTRACT.md`. Frontend: greet demo replaced with the day board (cards, sidebar, ghost cards, keyboard+clipboard grammar, day nav, markdown, Vitest). Backend: rusqlite + SQLite store, colour allocator (uniqueness invariant), 12 Tauri commands, window presence modes, cargo tests. Verified: `npm run build` PASS, `npm test` PASS (12), `cargo check`+`cargo test` PASS (5). Detector clean except 1 documented advisory (sidebar width transition). DESIGN.md updated with implementation resolutions. Ledger: reported (exit 0, unverified).
  - **Hermes verification (2026-08-18):** All 10 ACs met. Live launch confirmed — `tauri dev` compiled + ran `target/debug/callsheet` (pid 89511, ASN registered in lsappinfo), killed cleanly. SQLite parameterised-only (no format! in SQL), seed HSL tokens exact, allocator uniqueness test passes, greet demo fully removed (no greet/#396cd8 in src/). Detector re-run host-side: 1 advisory only, documented. Ledger: verified.
- **Phase 5 (Hermes):** Drudge done host-side (zero has two strikes per FLEET — exit 0 unverified). README rewritten from stock template (design contract, dev commands, architecture); unused `@tauri-apps/plugin-opener` dropped from package.json. Commit afdfdd5. Ledger: verified.
- **Phase 6 (Hermes):** Design review — impeccable critique (heuristics 31/40 Good) + audit (15/20 Good) + detector (1 documented advisory). ⚠️ DEGRADED: delegation provider HTTP 401 → assessments A+B ran inline single-context (banner declared). Open Design MCP run deferred (not in active toolset). DESIGN_REVIEW.md: 9-item numbered P1/P2/P3 fix list, committed 28eb850. Chris triaged: ALL 9 approved. Ledger: reported.
- **Phase 7 (opencode + Hermes):** Fix pass — 2 commits: 5945970 (pass 1 compliance: HSL tokenised into :root, ghost label contrast), 3685ad7 (pass 2 design: Cmd+Z undo, calmError copy, title+favicon, keyboard hint, dead nav props, safety comments). Item 6 (sidebar width transition) accepted as documented. Gates: build PASS, vitest 12, cargo 5, detector 1 known advisory. Note: original dispatch survived session interruption; duplicate dispatch killed; pass-2 JSX comment placement + await-in-sync-callback fixed host-side. Ledger: verified.
- **Phase 8 (Hermes + Chris):** Review opened; Chris returned to work with a 4.5h dev session's uncommitted work in the tree (handoff trace 20260818-callsheet-caret-fix). Verified + committed as one commit 23e6006 (split into logical commits attempted, abandoned — hunks interleaved, intermediate states don't compile): inline contentEditable markdown editor (src/editor.ts, 23 tests), pointer-based drag & drop replacing HTML5 DnD (WKWebView unreliability), template CRUD (sidebar + / double-click edit / delete, update_template backend), add-card + button, Backspace/Delete delete, editor owns keyboard while editing. Gates re-verified: build PASS, vitest 40/40, cargo 6/6. Ledger: verified.
