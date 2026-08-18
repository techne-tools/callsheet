# Testing Guidelines & Standards

## Framework

- **Frontend:** Vitest + React Testing Library.
- **Backend:** Rust `cargo test` (unit + integration in `src-tauri/`).

## File Naming & Structure

- Frontend: `src/**/*.test.ts(x)` colocated with source.
- Backend: `src-tauri/src/**/*.rs` with `#[cfg(test)]` modules, or `tests/` for integration.

## Coverage Thresholds

- Core logic (day navigation, card reordering, activity type mapping): ≥80%.
- UI components: smoke tests for render + key interactions.
- Rust: DB layer must be tested (CRUD, migrations, parameterized queries).

## What Must Be Tested

- Day navigation (prev/next, today).
- Card drag-drop reordering (persists order).
- Activity type colour mapping.
- Markdown rendering (bold, italic, lists, blockquote).
- SQLite CRUD + migration path.
- **IMPORTANT:** No test may assert on notifications, reminders, or analytics — those features must not exist.

## Unit Test Patterns

- Setup/teardown: fresh in-memory SQLite per test.
- Mocking: mock Tauri `invoke` in frontend tests.
- Fixtures: sample activities per type.

## Example

```ts
// src/lib/days.test.ts
import { describe, it, expect } from 'vitest';
import { shiftDay } from './days';

describe('shiftDay', () => {
  it('moves forward a day', () => {
    expect(shiftDay('2026-08-18', 1)).toBe('2026-08-19');
  });

  it('wraps month boundaries', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
  });
});
```
