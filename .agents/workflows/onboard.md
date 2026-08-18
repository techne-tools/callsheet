---
description: Onboard a new developer or agent to the callsheet codebase.
---

# Onboarding Workflow

1. **High-level walkthrough:** Callsheet is a calm day-board — a pane of colour-coded cards for today. The board is a dumb surface; the agent (Hermes/Noema) is the stage manager that reads the same SQLite store and proposes activity types. No reminders, no time-blocking, no analytics.
2. **Key files to understand first:**
   - `AGENTS.md` — this guide
   - `PRODUCT.md` / `DESIGN.md` — design truth
   - `src/App.tsx` — frontend entry
   - `src-tauri/src/lib.rs` — Tauri commands
   - `src-tauri/src/db.rs` — SQLite persistence
3. **Local dev setup:**
   ```bash
   npm install
   npm run tauri dev
   ```
   Requires Rust toolchain (cargo 1.97+) and Node 20+.
4. **Common pitfalls:**
   - The design language is calm and minimal — colour is the grammar, not decoration.
   - Never add reminders, notifications, alert tones, analytics, or time-blocking.
   - SQLite writes must use parameterized queries.
   - TypeScript strict mode is the build gate.
