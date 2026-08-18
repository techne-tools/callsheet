# TASK: callsheet — Phase 3: Design capture (impeccable init/document)

## Goal
Capture callsheet's design truth into committed, harness-readable form:
PRODUCT.md (what the product is for), DESIGN.md (the design north star), and
`.impeccable/config.json` (tokens, design-system binding), so every later
phase works from the same visual contract.

## Prerequisite
Phase 2 devising is DONE and Chris signed off. The signed-off sketch is
`DESIGN-SKETCH.md` in this worktree (v2, includes Chris's amendments:
accent borders, custom activity types with non-reused auto-colours, window
presence modes, smaller text, clipboard card ops, ghost-card approval).
This phase runs AFTER that sign-off — do not invent design decisions that were
not made. Where the sketch is silent, record the incumbent reality and flag
the gap, don't improvise.

## Product context (from AGENTS.md + recon + devising)

Callsheet is a calm, minimal Tauri v2 desktop day-board. A pane of colour-coded
cards for today (research, making, teaching, body, admin), basic markdown in
cards, drag-and-drop reordering, day navigation. **No reminders, no
time-blocking, no analytics, no notifications, no alert tones** — the
governing principle is *presence not pressure*: the app holds, it never pings.
The agentic layer (Hermes/Noema) reads the same SQLite store to propose
activity types (ghost cards); the board is a dumb surface.

Stack: React 19 + TypeScript (strict) + Vite, Rust (Tauri v2), SQLite via
rusqlite (to be added in phase 4 — recon confirmed rusqlite NOT yet in
Cargo.toml). Greenfield UI — the scaffold is the stock greet demo; there is
NO existing UI to extract tokens from. This is a from-sketch design capture.

## Scope
- The impeccable skill tooling is symlinked into this worktree at
  `.impeccable-tool/` (gitignored — it points at the global skill). Use it as
  the skill base: `node .impeccable-tool/scripts/context.mjs` once, keep cwd
  in the worktree. Load playbooks from `.impeccable-tool/reference/`
  (init.md, document.md, new-work.md, craft-floor.md) as the skill directs.
  Do NOT try to read `~/.hermes/skills/impeccable/` — the sandbox rejects
  external reads; the symlink IS the access path.
- `init` — write/refresh PRODUCT.md (durable product context)
- `document` — greenfield: capture the DESIGN-SKETCH.md tokens and rules into
  DESIGN.md and `.impeccable/config.json` (tokens, radius, shadows, accent %,
  typography — small text, calm palette)
- Commit the design truth files with a chore commit

The signed-off sketch's design decisions that MUST be encoded:
- Day surface: single centred vertical column of cards, no timeline/hour-grid
- Colour grammar: low-saturation pastel fills (HSL ~92–94% lightness), each
  activity type with a **slightly darker accent border** (same hue, lower
  lightness ~70%) to frame the card
- Five seed types: Research Slate hsl(215,15%,93%), Making Sage hsl(120,15%,92%),
  Teaching Ochre hsl(38,30%,93%), Body Rose hsl(350,20%,94%), Admin Sand hsl(30,10%,93%)
- **Custom activity types**: user-addable; auto-assigned pastel from a palette
  pool; **colour uniqueness enforced — never reused across types** (allocator
  tracks used set). DESIGN.md must specify this rule.
- Durable vs provisional: collapsible left sidebar (durable templates/call
  board) → drag into day pane instantiates provisional card
- Window presence: 3 modes — window open (normal window order, never floats
  above other windows), status bar (menu bar), dock toggle (hide/show in dock)
- Typography: smaller than default; dense, quiet; type recedes behind colour
- Markdown in cards: H1-H3, bold, italic, bullets, blockquotes; click edits,
  blur renders+saves
- Clipboard: Cmd+C / Cmd+V / Cmd+X on selected cards (cards behave like text)
- Drag-drop + keyboard: grab handle reorder; Tab/Shift+Tab navigate;
  Cmd+Shift+Up/Down shift order; Enter edit; Esc save+blur
- Day navigation: gutter arrows + Cmd+Left/Right; quiet centred date header
- Agent presence: faint dashed-border ghost cards at bottom of stack; click
  commits; never pings or notifies

## Out of scope
- No UI implementation (that is phase 4)
- No visual design decisions beyond the signed-off sketch
- No refactoring of existing components (there are none to refactor)

## Acceptance criteria
- [ ] PRODUCT.md exists, committed, reflects the product intent
- [ ] DESIGN.md exists, committed, and encodes the signed-off visual world
      (tokens, radius, shadows, accent %, typography, colour-uniqueness rule,
      presence modes)
- [ ] `.impeccable/` config committed (design system binding)
- [ ] Detector run clean on any touched UI files (MANUAL_DETECTOR_REQUIRED is
      not optional — it is the floor)
- [ ] Chore commit landed; worktree git status clean
- [ ] Design truth files are TRACKED — untracked docs are invisible to
      worktree agents (FLEET 2026-08-10)

## Harness & budget
- Harness: opencode (impeccable skill installed globally)
- Budget: ~30–60 min
- Work only inside this worktree. Do NOT use /tmp paths (sandbox auto-rejects).

## Status
- [ ] In progress
- [ ] Done — _agent writes summary of what changed here on exit_

## Evidence
_Ledger: `~/Development/agent-dispatch/evidence <repo> <task> <state>`._
Record `reported` before exit ("exit 0, unverified") — Hermes records
`verified` after checking against the acceptance criteria. `reported` ≠ `verified`.
