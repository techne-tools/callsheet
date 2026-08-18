# CONTRACT: callsheet phase 4 build

Shared interface between the frontend (React/TS) and backend (Rust/Tauri) lanes.
Both lanes build against this contract. Do not change it unilaterally.

## SQLite schema (single file `callsheet.db` in app data dir)

```sql
CREATE TABLE IF NOT EXISTS activity_types (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  colour TEXT NOT NULL,          -- fill HSL token, e.g. "hsl(215, 15%, 93%)"
  is_seed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  markdown TEXT NOT NULL DEFAULT '',
  activity_type_id INTEGER NOT NULL REFERENCES activity_types(id)
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,            -- ISO yyyy-mm-dd, day-scoped
  activity_type_id INTEGER NOT NULL REFERENCES activity_types(id),
  position INTEGER NOT NULL,
  markdown TEXT NOT NULL DEFAULT '',
  is_ghost INTEGER NOT NULL DEFAULT 0,
  source TEXT                    -- "agent" | "manual" (nullable; who proposed)
);
```

- Parameterized queries only. Never string-concatenate SQL.
- All card state is scoped by `date` — no cross-day bleed.
- `source` is added by a migration guard in `init_schema` (PRAGMA table_info
  check + `ALTER TABLE ADD COLUMN` for pre-existing DBs; new DBs get it in
  CREATE TABLE). The app migrates on next launch — the agent script must be
  schema-tolerant until then.

## Seed activity types (exact DESIGN.md HSL tokens)

| name | fill | border (derived) |
|---|---|---|
| Research | `hsl(215, 15%, 93%)` | `hsl(215, 15%, 70%)` |
| Making | `hsl(120, 15%, 92%)` | `hsl(120, 15%, 70%)` |
| Teaching | `hsl(38, 30%, 93%)` | `hsl(38, 30%, 70%)` |
| Body | `hsl(350, 20%, 94%)` | `hsl(350, 20%, 70%)` |
| Admin | `hsl(30, 10%, 93%)` | `hsl(30, 10%, 70%)` |

The DB stores the **fill** token in `activity_types.colour`. The border is
derived from the same hue at 70% lightness. The frontend derives the border
from the fill via a small HSL helper (parse `hsl(h, s%, l%)`, set lightness to
70%). Custom types get a fill from the palette pool; border derived the same way.

## Colour allocator (Rust)

- Module `colour_allocator` in `src-tauri/src/`.
- Palette pool of pastel fill HSL tokens (low saturation, ~92–94% lightness).
- `allocate(used: &HashSet<String>) -> String` returns the first pool colour not
  in `used`. Uniqueness is a hard invariant — never reuse a colour across types.
- Test proves uniqueness.

## Tauri commands (all `Result<..., String>`)

Cards:
- `list_cards(date: String) -> Vec<Card>`
- `save_card(card: CardInput) -> Card`  (upsert by id; 0 = insert)
- `delete_card(id: i64) -> ()`
- `commit_ghost_card(id: i64) -> Card`  (sets is_ghost=0)
- `propose_ghost_card(date: String, activity_type_id: i64, markdown: String, source: String) -> Card`
  (inserts is_ghost=1 at end of day's order; source = "agent" | "manual")

Events (agent wake-up):
- `cards-changed` — emitted after any card write (`save_card`, `delete_card`,
  `commit_ghost_card`, `propose_ghost_card`). Silent; the frontend reloads the
  current day. This is the app's only wake-up signal.

Activity types:
- `list_activity_types() -> Vec<ActivityType>`
- `create_activity_type(name: String) -> ActivityType`  (allocates colour)
- `delete_activity_type(id: i64) -> ()`

Templates:
- `list_templates() -> Vec<Template>`
- `create_template(name: String, markdown: String, activity_type_id: i64) -> Template`
- `delete_template(id: i64) -> ()`

Window presence:
- `set_window_presence(mode: String) -> ()`  // "normal" | "statusbar" | "dock"

## Data shapes (serde, camelCase in JSON)

```rust
struct Card { id: i64, date: String, activity_type_id: i64, position: i64, markdown: String, is_ghost: bool, source: Option<String> }
struct CardInput { id: i64, date: String, activity_type_id: i64, position: i64, markdown: String, is_ghost: bool }
struct ActivityType { id: i64, name: String, colour: String, is_seed: bool }
struct Template { id: i64, name: String, markdown: String, activity_type_id: i64 }
```

## Frontend responsibilities

- Replace the greet demo entirely. `App.tsx` → the day board.
- Card pane: single centred vertical column of cards for the selected day.
- Card: activity-type fill + derived accent border, markdown render/edit
  (click to edit raw, blur to save), grab handle.
- Sidebar: collapsible left panel of durable templates; drag into pane
  instantiates a provisional card.
- Ghost cards: dashed-border proposal cards at bottom of stack; click commits.
- Keyboard grammar: Tab/Shift+Tab navigate, Cmd+Shift+Up/Down shift order,
  Enter edit, Esc save+blur. Clipboard: Cmd+C / Cmd+V / Cmd+X on selected cards.
- Day nav: left/right gutter arrows, Cmd+Left/Right, quiet centred date header.
- Markdown: H1–H3, bold, italic, bullet lists, blockquotes. Dependency-light.
- Vitest tests: at minimum one markdown render test.
