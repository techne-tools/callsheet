# Security Guardrails

## Input Validation

- Validate all Tauri command inputs (types, lengths, allowed characters).
- Day/date strings must match `YYYY-MM-DD` — reject anything else.
- Card content: cap length (e.g. 10k chars), strip control characters.

## Authentication / Authorization

- Local-first app: no accounts, no auth. Do not add remote auth without explicit decision.

## Secrets Management

- **IMPORTANT:** Never hardcode secrets. Use env vars / `.env` (gitignored).
- No API keys in config files committed to git.

## Dependency Security

- `npm audit` before release; pin major versions.
- `cargo audit` for Rust deps where available.

## Vulnerability Prevention

- **SQL injection:** parameterized queries only — never string-concatenate SQL.
- **XSS:** markdown rendering must escape raw HTML; use a safe renderer (e.g. `marked` with sanitization, or `react-markdown`).
- **Path traversal:** any file access goes through validated paths under the app data dir.

## File System & Network

- App reads/writes only its own SQLite file in the app data directory.
- No network calls in the app. If calendar awareness is added later, it must be opt-in and read-only.
