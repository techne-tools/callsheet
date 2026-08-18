# TASK: callsheet — Phase 7: Fix pass (approved design-review fixes)

## Goal
Implement ALL 9 items from the phase-6 fix list (DESIGN_REVIEW.md, committed
28eb850, triaged by Chris: all approved). Two passes, one commit each:
1. **Compliance sweep** — tokenise hard-coded HSL, fix the detector advisory,
   normalise contrast.
2. **Design pass** — the ergonomic fixes (undo, error copy, title, keyboard
   hint, dead props, comment).

## Prerequisite
Phase 6 fix list exists and Chris triaged ALL 9 items as approved. Work ONLY
these items — nothing outside the list.

## The approved fix list (from DESIGN_REVIEW.md)

### P1
1. **Unguarded delete** — `src/components/Card.tsx:99-102`: Backspace on a
   selected card deletes instantly. Fix: undo — snapshot the last deleted
   card in App state, Cmd+Z restores it (more on-voice than a modal).
2. **Raw error text** — `src/App.tsx:414-416`: renders `String(e)` verbatim.
   Fix: map known errors to calm copy ("Couldn't save this card. It's still
   here — try again."), keep technical detail in a console log.

### P2
3. **Stock window title** — `index.html:7`: "Tauri + React + Typescript" +
   vite.svg favicon. Fix: `<title>callsheet</title>`, replace favicon with a
   quiet inline SVG or drop the link.
4. **Hard-coded HSL not tokenised** — `src/App.css`: ~15 hard-coded HSL
   values (selection, focus-visible, hover states, caret, ghost hover,
   template hover, day-pane--over). Fix: promote to custom properties in
   `:root` (`--accent-focus`, `--ghost-hover`, `--ghost-label`, etc.).
5. **Keyboard grammar invisible** — Fix: quiet one-line hint in the empty
   state ("Tab to move between cards · Cmd+Shift+↑↓ to reorder") or a small
   "?" affordance. Keep it on-voice — no modal, no tutorial.

### P3
6. **Sidebar width transition** — `src/App.css:341` animates `width`
   (detector finding). Fix: `grid-template-columns` animation or accept as
   documented (if you accept, note it in the commit message).
7. **Ghost-card label contrast** — `.ghost-card__label` 11px uppercase
   `hsl(0,0%,55%)` on paper ≈ 3.2:1. Fix: darken to ~40% lightness.
8. **Dead nav props** — `src/App.tsx:406-407`: `canGoPrev`/`canGoNext`
   hard-coded `true`. Fix: wire to actual bounds or remove the dead props.
9. **`dangerouslySetInnerHTML` comment** — `src/components/Card.tsx:97` and
   `src/components/GhostCard.tsx:19`: add a one-line comment explaining the
   markdown renderer HTML-escapes (test-proven), so future maintainers know
   it is safe.

## Out of scope
- Redesign — refinement preserves the incumbent world; nothing outside the
  fix list
- New design tokens beyond the ones the fix list names
- Test fixture changes, docs rewrites, dependency changes
- `git add -A` — stage only files you touched

## Acceptance criteria
- [ ] All 9 fixes implemented
- [ ] Detector re-run clean on touched files (or named evidence for ignores)
- [ ] Tests + build green (`npm run build`, `npm test`, `cargo test`)
- [ ] One commit per pass (compliance sweep, then design pass), fix list in
      the message, deliberate non-fixes flagged
- [ ] Worktree git status clean apart from staged changes

## Harness & budget
- Harness: opencode
- Budget: ~1–2 h; bounded QA — inspect once, fix in one batch, confirm at
  most once more, then stop polishing
- Work only inside this worktree. Do NOT use /tmp paths (sandbox auto-rejects).
- Impeccable is vendored at `.agents/skills/impeccable/` — use those paths,
  NEVER `~/.hermes/skills/`.

## Status
- [ ] In progress
- [ ] Done — _agent writes summary of what changed here on exit_

## Evidence
_Ledger: `~/Development/agent-dispatch/evidence <repo> <task> <state>`._
Record `reported` before exit ("exit 0, unverified") — Hermes records
`verified` after checking against the acceptance criteria. `reported` ≠ `verified`.
