# Agent Layer Plan — Ghost-Card Proposals (Phase 9)

**Status:** Proposed · **Owner:** Hermes + Chris · **Target:** callsheet v0.2.0

The board is a dumb surface; the agent is the stage manager. This phase wires the
one remaining thread from the OpenDesign review: Hermes/Noema proposing cards by
writing `isGhost` rows, and the app silently showing them.

## Governing constraints (from AGENTS.md / DESIGN.md)

- **Presence not pressure** — the app holds, it never pings. Ghost cards appear
  silently; no notification, no tone, no badge. The cron job's output is *visible
  not sent* (deliver=local).
- **Day-scoped state** — proposals are for a specific date; no cross-day bleed.
- **Parameterized SQL only** — the agent's write path must never string-concatenate.
- **TypeScript strict + cargo test gates** must stay green.

## Current state (verified 2026-08-18, after audit commit 81db296)

- DB: `app_data_dir()/callsheet.db` (`~/Library/Application Support/com.chris.callsheet/`),
  single `Mutex<Connection>` in Tauri state. **No WAL, no busy_timeout** — a second
  process writing needs both. (Audit commit added `PRAGMA foreign_keys`, indexes on
  `cards(date)` and `cards(activity_type_id)`, poisoned-mutex recovery via stored
  path, and ISO date validation at the store boundary — none of which change the
  concurrent-writer gap.)
- `reorder_cards` is now transactional and day-scoped (audit commit) — orthogonal
  hardening, not agent-layer work.
- `list_cards(date)` returns ghosts too; `App.tsx` filters `isGhost` and renders
  `GhostCard` (commit button → `commitGhostCard`). No dismiss path.
- `proposeGhost` (◌) is a manual placeholder — creates a ghost with fixed text via
  `saveCard`. No `propose_ghost_card` command, no `source` column.
- No events, no polling, no agent-facing write API. The app only reloads on date
  change / explicit actions.

---

## Phase A — Backend hardening (Rust)

**Goal:** safe concurrent access + a first-class propose command.

1. **WAL + busy_timeout** in `db::open` (`src-tauri/src/db.rs`): ✅ **done (2026-08-18)**
   ```rust
   conn.pragma_update(None, "journal_mode", "WAL")?;
   conn.pragma_update(None, "busy_timeout", 5000)?;
   ```
   WAL lets the agent's script write while the app reads; busy_timeout prevents
   `SQLITE_BUSY` on contention. Test `open_enables_wal_and_busy_timeout` asserts
   `journal_mode` is `wal` and `busy_timeout` is 5000. Verified: 11/11 cargo
   tests, 45/45 vitest, tsc strict build.

2. **New command `propose_ghost_card`** (`db.rs` + `lib.rs` + `src/tauri.ts`): ✅ **done (2026-08-18)**
   ```rust
   pub fn propose_ghost_card(
       conn: &Connection,
       date: &str,
       activity_type_id: i64,
       markdown: &str,
       source: &str,          // "agent" | "manual"
   ) -> Result<Card>
   ```
   Inserts `is_ghost = 1` at the end of the day's card order (`MAX(position)+1`,
   day-scoped). `source` is a new nullable column on `cards`, added via a
   `PRAGMA table_info` migration guard in `init_schema` (old DBs get
   `ALTER TABLE ADD COLUMN`; new DBs get it in CREATE TABLE). `Card` now carries
   `source: Option<String>` through list/get. Tests:
   `propose_ghost_card_appends_at_end_with_source` (append order, day-scoping,
   source round-trip) and `init_schema_migrates_old_cards_table_without_source`.
   Verified: 13/13 cargo tests, 45/45 vitest, tsc strict build.

3. **Emit a Tauri event after any card write** (`cards-changed`): ✅ **done (2026-08-18)**
   `app.emit("cards-changed", ())` from `save_card`, `delete_card`,
   `commit_ghost_card`, `propose_ghost_card` — emitted only after the DB write
   succeeds, so a failed write never signals a refresh. Commands now take
   `app: tauri::AppHandle`; `Emitter` trait imported. This is the app's only
   "wake up" signal — silent, no UI. Verified: 13/13 cargo tests.

4. **Dismiss path:** reuse existing `delete_card` — a ghost is just a card with
   `is_ghost=1`; no new command needed.

**Acceptance:** `cargo test` green (new tests: WAL pragma, propose inserts ghost at
end of day, source column round-trips); `npm run build` green.

## Phase B — Frontend refresh (React)

**Goal:** the board notices new proposals without pinging.

1. **Listen for `cards-changed`** in `App.tsx` (`@tauri-apps/api/event` — the dep
   exists in `package.json`): ✅ **done (2026-08-18)**
   `listen("cards-changed", ...)` → `loadCards(dateKeyRef.current)`. Silent: no
   toast, no flash. Listener registered once (effect keyed on `loadCards`),
   unregistered on unmount with a cancelled-flag guard for the async
   registration race.
2. **Slow fallback poll** (30s, only while `document.visibilityState === "visible"`):
   ✅ **done (2026-08-18)** — `setInterval` in an effect, cleared on unmount.
   Covers the case where the agent wrote directly and the event was missed.
   This is *presence* — the board quietly stays current.
3. **GhostCard dismiss button** (`GhostCard.tsx`): ✅ **done (2026-08-18)**
   Small × next to "Proposed", calls `delete_card` via `onDismiss` →
   `handleDelete`. Ghost card is now a `div` (role=button) with a head row;
   the × stops propagation so it never triggers commit. Mirrors the card
   delete affordance (quiet red hover).
4. **`proposeGhost` placeholder** stays as the manual demo: ✅ **done (2026-08-18)**
   Now calls the real `proposeGhostCard(date, typeId, text, "manual")` command
   (source="manual") instead of a raw `saveCard` ghost insert.

**Acceptance:** vitest green (new tests: event listener triggers reload, poll
interval set/cleared — `src/agent-wakeup.test.tsx`, 3 tests); manual: run
`npm run tauri dev`, insert a ghost row via
sqlite3 CLI, watch it appear within 30s with no notification.

## Phase C — Agent write path (script)

**Goal:** a safe, documented CLI for Hermes/Noema to propose cards.

1. **`~/.hermes/scripts/callsheet-propose.py`** — stdlib-only (sqlite3, argparse):
   - `list --date YYYY-MM-DD` → JSON of the day's cards (incl. ghosts)
   - `propose --date YYYY-MM-DD --type <id|name> --markdown "..." [--source agent]`
     → inserts ghost row (parameterized SQL, WAL-safe, busy_timeout 5000)
   - `dismiss --id N` → deletes a ghost row
   - `--db` override; default resolves the macOS app-data path
     (`~/Library/Application Support/com.chris.callsheet/callsheet.db`)
   - No secrets, no network, no deps. Exit non-zero with a clear message on failure.

2. **DB path resolution** documented in the script header + `PIPELINE.md` (the
   macOS path is stable; `--db` covers other platforms).

**Acceptance:** `python3 callsheet-propose.py list --date $(date +%F)` returns JSON;
`propose` then `list` shows the ghost; `dismiss` removes it. Run against a copy of
the DB first, then live.

## Phase D — Agent cron (Hermes/Noema)

**Goal:** the stage manager proposes, the board shows.

1. **Cron job** (daily, e.g. `0 7 * * *`, deliver=local — *visible not sent*):
   - Loads the `callsheet-agent` skill (new, Phase E) + `noema` context
   - Reads today's cards via `callsheet-propose.py list`
   - Consults Noema (recent days' patterns, project register, user preferences)
   - Proposes **1–3** ghost cards max (calm, not noisy) via
     `callsheet-propose.py propose --source agent`
   - Logs a Noema trace (`20260818-...-callsheet-proposals`) with what it proposed
     and why
   - **Never pings.** Output is local-only; the ghost cards are the message.

2. **On-demand trigger:** `cronjob action='run'` for "propose for tomorrow" before
   bed, or a `/callsheet-propose` slash command later.

**Acceptance:** job runs, ghosts appear in the app next time it's open, trace
exists in Noema, no delivery to any channel.

## Phase E — Skill + docs

1. **New skill `callsheet-agent`** (`~/.hermes/skills/`): trigger conditions
   (daily proposal run, "what should I do today"), the script's exact commands,
   proposal quality bar (specific, actionable, ≤3, day-scoped, no pings), Noema
   consultation order, pitfalls (WAL/busy_timeout, path resolution, don't propose
   for past days).
2. **Docs:** `PIPELINE.md` phase 9 log, `CONTRACT.md` (new command + event),
   `CHANGELOG.md` (v0.2.0), project register, Noema trace.

**Acceptance:** skill loads cleanly; docs committed; register updated.

---

## Sequencing & gates

| Step | Gate |
|---|---|
| A1–A4 backend | `cargo test` + `npm run build` |
| B1–B4 frontend | vitest + manual ghost-insert test |
| C1–C2 script | live list/propose/dismiss round-trip |
| D1–D2 cron | one manual `action='run'` + app shows ghosts |
| E1–E2 docs | all committed, register updated |

**Out of scope (explicitly):** notifications of any kind, agent editing existing
cards, cross-day proposals, schema versioning, HTTP sidecar.

**Risk:** agent writes while app holds the connection → mitigated by WAL +
busy_timeout (A1) and the script's own busy_timeout (C1). Worst case is a
`SQLITE_BUSY` retry, never corruption.
