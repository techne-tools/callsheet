# Code Formatting & Style Rules

## Indentation & Width

- 2 spaces, no tabs.
- Max line length 100 chars (soft), 120 (hard).
- Prettier defaults for TS/JS; `rustfmt` defaults for Rust.

## Naming Conventions

- **Variables/functions:** `camelCase` (TS), `snake_case` (Rust).
- **Components:** `PascalCase` (e.g. `DayBoard`, `ActivityCard`).
- **Constants:** `UPPER_SNAKE_CASE` for module-level constants.
- **Files:** `kebab-case.tsx` for components, `camelCase.ts` for utils, `snake_case.rs` for Rust.
- **Types/interfaces:** `PascalCase`, prefixed `I` only for legacy interop.

## Import Ordering

1. React / framework imports
2. Third-party libraries (alphabetical)
3. Local modules (`@/` or relative, alphabetical)
4. Types (grouped with their module)

## Comments

- JSDoc for exported functions and components.
- Inline comments explain *why*, not *what*.
- No commented-out code — delete it.

## TypeScript

- Strict mode always. No `any` unless absolutely required (then document why).
- Prefer `type` over `interface` for unions and simple shapes.
- Use `satisfies` for literal-type validation.

## React Patterns

- Function components only, hooks for state.
- One component per file, named export.
- Props typed with `type Props = {...}`.
- No inline styles — use CSS modules or the design system tokens.

## Rust Patterns

- `rustfmt` formatting, clippy-clean.
- Tauri commands return `Result<..., String>`.
- SQLite via parameterized queries only.

## Gold Standard

```tsx
// src/components/ActivityCard.tsx
import { useCallback } from 'react';
import type { Activity } from '@/types';

type Props = {
  activity: Activity;
  onMove: (id: string, day: string) => void;
};

export function ActivityCard({ activity, onMove }: Props) {
  const handleDragEnd = useCallback(() => {
    onMove(activity.id, activity.day);
  }, [activity, onMove]);

  return (
    <article className="card" data-type={activity.type} draggable>
      <h3>{activity.title}</h3>
      {activity.note && <p>{activity.note}</p>}
    </article>
  );
}
```
