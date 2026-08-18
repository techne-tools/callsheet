# Callsheet — Antigravity Guide

Callsheet is a calm, minimal Tauri v2 desktop day-board app. It shows a pane of colour-coded cards for today (research, making, teaching, body, admin), with basic markdown in cards, drag-and-drop reordering, and day navigation. No reminders, no time-blocking, no analytics. The agentic layer (Hermes/Noema) reads the same SQLite store to propose activity types.

## Tech Stack

- **Frontend:** React 19 + TypeScript (strict), Vite 6
- **Backend:** Rust (Tauri v2), SQLite via rusqlite
- **Package manager:** npm
- **Build:** `npm run tauri dev` (dev), `npm run tauri build` (release)
- **Tests:** Vitest (frontend), `cargo test` from `src-tauri/` (backend)

## Architecture & Directory Map

```
src/                  React frontend (cards, day pane, drag-drop, markdown)
src-tauri/            Rust backend (SQLite persistence, Tauri commands)
src-tauri/src/        Rust source (db.rs, commands in lib.rs)
src-tauri/capabilities/  Tauri permission capabilities
```

- The board is a **dumb surface**: cards, colours, drag-drop, markdown, day navigation. No intelligence in the UI.
- The agent is the **stage manager**: Hermes/Noema reads the same SQLite store, notices patterns, proposes activity types. The board never knows it's being watched.
- Data lives in one SQLite file. No accounts, no sync, no cloud, no notifications, no analytics — the constraints are the design.

## Development Commands

```bash
npm install              # frontend deps
npm run build            # vite build + TS type-check gate (strict)
npm run tauri dev        # full app dev loop (Rust + frontend)
npm run test             # Vitest suites
cd src-tauri && cargo test   # Rust tests
```

## Coding Conventions

- Tauri commands return `Result<..., String>`; propagate errors the same way.
- All state is scoped by the day/date — no cross-day bleed.
- SQLite writes go through parameterized queries — never string-concatenate SQL.
- TypeScript strict mode is the gate: `npm run build` must pass.
- **IMPORTANT:** No reminders, no notifications, no alert tones, no analytics, no time-blocking. The governing principle is *presence not pressure* — the app holds, it never pings.
- **IMPORTANT:** Never commit secrets. Use env vars / `.env` (gitignored).
- **IMPORTANT:** The design language is calm and minimal — colour is the grammar (cards shade by activity type), not decoration.

## Design Truth

- `PRODUCT.md` — product intent
- `DESIGN.md` — design north star
- `.impeccable/` — design system artifacts

Read these before making claims about the design. Design truth is committed before build.
