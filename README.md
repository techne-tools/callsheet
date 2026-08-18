# callsheet

A calm, minimal desktop day-board for macOS. A single pane of colour-coded
cards holds the day's plan — research, making, teaching, body, admin — with
basic markdown, drag-and-drop reordering, and day navigation. It holds, it
never pings.

Built with Tauri v2 (Rust + SQLite) and React 19 + TypeScript (strict).

## Design

- **Presence not pressure** — no reminders, notifications, alert tones,
  analytics, or time-blocking.
- **Dumb surface** — a single centred vertical column of cards for today; no
  timeline, no hour-grid.
- **Colour is the grammar** — five seed activity types with low-saturation
  pastel fills and darker accent borders; custom types get auto-assigned
  pastels with enforced colour uniqueness.
- **Durable vs provisional** — a collapsible left sidebar holds durable
  templates; dragging one into the day pane instantiates a provisional card.
- **Agent presence** — faint dashed-border ghost cards at the bottom of the
  stack propose activity types; a click commits them. They never ping.

See `PRODUCT.md` and `DESIGN.md` for the full contract.

## Development

```sh
npm install
npm run tauri dev     # run the app
npm run build         # TS strict + vite build
npm test              # vitest (frontend)
cd src-tauri && cargo test   # backend tests
```

## Architecture

- `src/` — React frontend: day board (`App.tsx`), cards, ghost cards,
  sidebar, day navigation, markdown renderer, Tauri bridge.
- `src-tauri/src/` — Rust backend: SQLite store (`db.rs`, parameterised
  queries only), colour allocator (`colour_allocator.rs`, uniqueness
  invariant), Tauri commands + window presence modes (`lib.rs`).

## Governance

The design truth lives in `PRODUCT.md`, `DESIGN.md`, and
`.impeccable/` (machine-readable tokens). Impeccable tooling is installed
per-worktree via `npx impeccable install`; the detector runs with
`npx impeccable detect src/ src-tauri/`.
