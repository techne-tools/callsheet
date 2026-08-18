# Architectural Guidelines

## Separation of Concerns

- **UI layer** (`src/`): rendering, drag-drop, markdown display. No business logic beyond view state.
- **Domain layer** (Rust): activities, days, ordering, type mapping. Pure functions where possible.
- **Persistence layer** (Rust): SQLite CRUD, migrations. No UI concerns.

## Module Dependency Rules

- `src/` may import from `src-tauri/` only via Tauri `invoke` (typed commands).
- Rust: `db.rs` is the only module that touches SQLite. Commands in `lib.rs` call into it.
- No circular imports. No `any`-typed bridges between layers.

## State Management

- Frontend: React state + hooks. No global store unless complexity demands it.
- Day state: current date + cards for that date, loaded via one Tauri command.
- Optimistic updates for drag-drop; persist on drop.

## API Design

- Tauri commands are the API. Name them as verbs: `get_day`, `move_card`, `add_activity`, `update_card`, `propose_activity_type`.
- Commands return `Result<..., String>` with human-readable errors.

## Database Access

- Repository pattern: `db.rs` exposes typed functions, not raw queries.
- Migrations: schema version table, forward-only.
- **IMPORTANT:** Parameterized queries only.

## Error Handling

- Frontend: errors surface as calm inline messages, never modal alerts (no alert tones).
- Backend: `Result<..., String>` with actionable messages.
- Log to stderr / Tauri log plugin; no crash dialogs.

## Logging

- Minimal logging. No analytics, no telemetry, no usage tracking.
- Debug logs for DB operations only when `RUST_LOG=debug`.
