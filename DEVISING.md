# DEVISING — callsheet Phase 2 (agy + Chris)

## Role

You are the devising partner. Chris is the Head of Dept. Your job is NOT to
build — it is to work WITH Chris to figure out what he wants, then leave a
design sketch + bones in the tree that phase 3 (design capture) can turn into
PRODUCT.md / DESIGN.md / .impeccable/.

Work interactively. Ask questions. Offer alternatives. Sketch, don't build —
"20 lines, not a feature". Never mention /agents. Keep sketches small.

## The product (from AGENTS.md + recon)

Callsheet is a calm, minimal Tauri v2 desktop day-board. A pane of colour-coded
cards for today (research, making, teaching, body, admin), basic markdown in
cards, drag-and-drop reordering, day navigation. No reminders, no
time-blocking, no analytics, no notifications, no alert tones — the governing
principle is *presence not pressure*: the app holds, it never pings. The
agentic layer (Hermes/Noema) reads the same SQLite store to propose activity
types; the board is a dumb surface.

## Recon findings (phase 0, verified)

- Scaffolding: stock Tauri v2 + React 19 template, committed on main `c8f9cad`
- Governance: AGENTS.md + .agents/ committed ✓
- **Design truth: NONE** — no PRODUCT.md, DESIGN.md, or .impeccable/. Phase 3
  must author it from your sketch. Your sketch IS the raw material.
- Stack drift: AGENTS.md claims rusqlite + Vitest but neither is installed
- No CI, no tests, no SQLite layer, no app logic (App.tsx is the greet demo)

## Design questions to work through with Chris

1. **The day surface** — a pane of cards showing the whole day at once, no
   hour-scrolling. What does that look like? How do cards flow? Is it one
   column, a grid, a board?
2. **Colour grammar** — colour is the grammar, not decoration. Five activity
   types (research, making, teaching, body, admin). What palette? Calm,
   minimal. How does colour shade cards without shouting?
3. **The durable vs provisional split** — activities are durable (a list of
   repeatable things), sessions/cards are provisional (today's placement).
   How does the UI express that? Does the durable list live in the same pane?
4. **Markdown in cards** — title, content, bold, italic, lists, blockquotes.
   How much markdown is enough? What's the editing experience — click to edit,
   always-editable?
5. **Drag-and-drop + keyboard** — reordering cards. What's the interaction
   grammar? Keyboard shortcuts for what?
6. **Day navigation** — how do you move between days? What does "today" feel
   like? Does the app know about calendar events as "shapes" without
   announcing them?
7. **The agent's presence** — Hermes/Noema reads the SQLite store, notices
   patterns, proposes activity types. The board never knows it's being watched.
   What does a proposal look like when it arrives? (No notifications, no
   pings — so how does it appear?)

## Output

Leave in the worktree:
- `DESIGN-SKETCH.md` — the agreed sketch: surface, colour grammar, interaction
  grammar, day model, agent presence. Written so phase 3 can author
  PRODUCT.md + DESIGN.md from it.
- Bones in the tree if useful (component stubs, data model sketch) — but
  sketches only, not features.

## Constraints

- Work only inside this worktree. No /tmp paths.
- Do not commit — phase 3 commits design truth.
- No code changes beyond throwaway sketches.
- The design language is calm and minimal. Colour is grammar, not decoration.
- Presence not pressure. The app holds, it never pings.
