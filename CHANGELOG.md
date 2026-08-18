# Changelog

All notable changes to callsheet are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-08-18

Agent layer (Phase 9): the board can now receive quiet proposals from
Hermes/Noema — ghost cards appear without any notification.

### Added

- `propose_ghost_card` Tauri command — inserts a ghost card at the end of a
  day's order with a `source` ("agent" | "manual")
- `source` column on `cards` (migration guard in `init_schema`; old DBs
  upgrade on next launch)
- `cards-changed` Tauri event — emitted after any card write; the frontend
  reloads silently (no toast, no flash)
- 30s fallback poll (visible window only) so direct agent writes are picked
  up even if the event is missed
- Ghost card dismiss button (×) — quiet red hover, mirrors card delete
- `~/.hermes/scripts/callsheet-propose.py` — stdlib-only CLI for the agent
  write path (`list` / `propose` / `dismiss`, WAL-safe, parameterized SQL)
- `callsheet-agent` skill + daily 07:00 cron job (deliver=local — visible
  not sent)

## [0.1.0] — 2026-08-18

Initial release. A calm, minimal desktop day-board: colour-coded cards for
research, making, teaching, body, and admin — presence, not pressure.

### Added

- Day board with colour-coded cards across five activity types
- Inline markdown editing (headings, bold, italics, flat lists, blockquotes)
- Pointer-based drag-and-drop card reordering
- Day navigation (previous / next / today)
- Template sidebar: create, edit, and delete reusable card templates
- Add-card button and keyboard grammar (Tab to move, Cmd+Shift+↑↓ to reorder)
- Cmd+Z undo for deleted cards
- Local-first SQLite persistence — no accounts, no sync, no cloud
- Custom activity types with auto-assigned unique colours

[0.1.0]: https://github.com/prismatic7/callsheet/releases/tag/v0.1.0
