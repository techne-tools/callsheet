# TASK: callsheet — Phase 4: Build (bones validated, weirdness fixed, hard bits done)

## Goal
Build the working bones of callsheet from the design truth (PRODUCT.md,
DESIGN.md, `.impeccable/design.json` — all committed in f91b84d). The app
must be runnable (`npm run tauri dev`), implement the signed-off visual world,
and have the hard structural bits (SQLite persistence, colour-uniqueness
allocator, window presence modes) actually working — not stubbed.

## Prerequisite
Phase 3 design capture is DONE and verified (commit f91b84d). The design
truth is the contract — follow it exactly. Where something is unresolved
(e.g. font family, corner radius marked "to be resolved during
implementation"), pick a calm minimal default consistent with the north star
(The Quiet Day-Board) and note it in DESIGN.md as implemented.

**Tooling (Q22):** impeccable is vendored in this worktree — use
`.agents/skills/impeccable/` (or `.opencode/skills/impeccable/`) as the skill
base, NEVER `~/.hermes/skills/impeccable/` (sandbox rejects external reads).
Load `.agents/skills/impeccable/reference/craft-floor.md` before editing any
UI. Run the context setup once: `node .agents/skills/impeccable/scripts/context.mjs`.

## The design truth (signed off by Chris — non-negotiable)

- **Presence not pressure.** No reminders, notifications, alert tones,
  analytics, or time-blocking. The app holds, it never pings.
- **Day surface:** single centred vertical column of cards for today; no
  timeline, no hour-grid, no hour-scrolling.
- **Colour grammar:** five seed activity types, low-saturation pastel fills
  (~92–94% lightness) each framed by a slightly darker accent border (same
  hue, ~70% lightness):
  - Research Slate `hsl(215,15%,93%)` fill / `hsl(215,15%,70%)` border
  - Making Sage `hsl(120,15%,92%)` / `hsl(120,15%,70%)`
  - Teaching Ochre `hsl(38,30%,93%)` / `hsl(38,30%,70%)`
  - Body Rose `hsl(350,20%,94%)` / `hsl(350,20%,70%)`
  - Admin Sand `hsl(30,10%,93%)` / `hsl(30,10%,70%)`
  - Neutrals: Ink `hsl(0,0%,6%)`, Paper `hsl(0,0%,97%)`, Ghost Border `hsl(0,0%,60%)`
- **Custom activity types:** user-addable; auto-assigned pastel from a
  palette pool; **colour uniqueness is a hard invariant** — the allocator
  tracks the used set and never reuses a colour across types.
- **Durable vs provisional:** collapsible left sidebar lists durable repeatable
  templates (the call board); dragging a template into the day pane
  instantiates a provisional card; editing/deleting a card never touches the
  template.
- **Markdown in cards:** H1–H3, bold, italic, bullet lists, blockquotes.
  Single click edits raw text; blur renders + saves.
- **Clipboard:** cards behave like text — Cmd+C / Cmd+V / Cmd+X on selected
  cards.
- **Drag-drop & keyboard:** grab handle for mouse reorder; Tab/Shift+Tab
  navigate; Cmd+Shift+Up/Down shift order; Enter edit; Esc save+blur.
- **Day navigation:** left/right gutter arrows; Cmd+Left/Right; quiet centred
  date header.
- **Window presence (3 modes):** window open (normal window order — never
  floats above other windows until focused); status bar (minimise to menu
  bar); dock toggle (hide/show in dock).
- **Agent presence:** faint dashed-border ghost cards proposed at the bottom
  of the stack; click commits; never pings or notifies. (The agent layer
  itself is Hermes/Noema reading the SQLite store — the UI just needs the
  ghost-card surface + a way proposals can be written to the store.)
- **Typography:** smaller than default; dense, quiet; type recedes behind
  colour.
- **Colour accessibility:** activity types must be distinguishable by more
  than hue alone (accent border + text affordances).

## Scope

### Frontend (React 19 + TS strict)
- Replace the stock greet demo entirely. App.tsx → the day board.
- Card pane: vertical column of activity cards, whole day visible at once.
- Card: activity-type colour (fill + accent border), markdown render/edit
  (click to edit raw, blur to save), grab handle.
- Sidebar: collapsible left panel of durable templates; drag into pane
  instantiates a provisional card.
- Ghost cards: dashed-border proposal cards at bottom of stack, click to
  commit.
- Keyboard grammar + clipboard ops on selected cards.
- Day navigation (gutter arrows, Cmd+Left/Right, quiet date header).
- Markdown: use a small, calm markdown renderer (e.g. `marked` + minimal
  styles, or hand-rolled for the H1–H3/bold/italic/bullets/blockquote subset —
  your call, keep it dependency-light).

### Backend (Rust / Tauri v2)
- Add `rusqlite` (bundled feature) to Cargo.toml — recon confirmed it is
  MISSING; this is the phase that adds it.
- SQLite store (single file, e.g. `callsheet.db` in app data dir):
  - `activity_types` table (id, name, colour token, is_seed) — the durable
    list, including custom types
  - `templates` table (durable sidebar items)
  - `cards` table (id, date, activity_type_id, position, markdown, is_ghost)
  - **Parameterized queries only** — never string-concatenate SQL.
  - Day-scoped state: no cross-day bleed.
- Tauri commands returning `Result<..., String>`: list/get/save/delete cards
  per day, CRUD activity types + templates, move card, commit ghost card.
- Colour allocator lives in Rust: tracks used colours, assigns from palette
  pool, enforces uniqueness (hard invariant).
- Window presence: normal window; Tauri menu bar / dock hide-show wiring for
  the three modes (macOS). No floating-above behavior.

### Tests
- Add Vitest (frontend) and `cargo test` (backend) — recon confirmed neither
  is wired. At minimum: colour-allocator uniqueness test (Rust), a card
  store round-trip test, one markdown render test.

## Out of scope
- No agentic/Hermes integration beyond the ghost-card store surface (that is
  a later phase).
- No drudge polish (phase 5), no design review fixes (phases 6–7).
- No CI (not in scope for this pipeline).
- Do NOT implement calendar-event awareness ("shapes of the day") — not in
  the signed sketch.

## Acceptance criteria
- [ ] `npm run tauri dev` runs; app opens to the day board (no greet demo)
- [ ] `npm run build` passes (TS strict is the gate)
- [ ] `cargo check` / `cargo test` pass in `src-tauri/`
- [ ] Vitest passes for the added frontend tests
- [ ] SQLite persistence works: cards, templates, activity types survive a
      restart; day-scoped (no bleed)
- [ ] Colour allocator enforces uniqueness (test proves it)
- [ ] All five seed types present with exact DESIGN.md HSL tokens; ghost
      cards, sidebar, keyboard grammar, clipboard, day nav implemented
- [ ] Window presence modes implemented (normal / status bar / dock toggle)
- [ ] Detector run clean-ish: `npx impeccable detect src/ src-tauri/` — no
      new severe findings; scaffold greet-demo colours gone; any residual
      findings are documented advisories with rationale, or gitignored report
      (do NOT write to /tmp)
- [ ] Chore commit(s) landed; worktree git status clean
- [ ] DESIGN.md updated with implementation resolutions (font family, radius,
      spacing chosen)

## Harness & budget
- Harness: opencode
- Budget: generous — this is the main build phase. Expect multiple passes.
  Work only inside this worktree. No /tmp paths.
- If you hit a blocker that is architectural (not just fiddly), stop and
  record it in TASK.md Status + PIPELINE.md handoff log rather than guessing.

## Status
- [ ] In progress
- [ ] Done — _agent writes summary of what changed here on exit_

## Evidence
_Ledger: `~/Development/agent-dispatch/evidence <repo> <task> <state>`._
Record `reported` before exit ("exit 0, unverified") — Hermes records
`verified` after checking against the acceptance criteria. `reported` ≠ `verified`.
