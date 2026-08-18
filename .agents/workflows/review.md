---
description: Review the current changeset for bugs, security issues, and style violations.
---

# Code Review Workflow

1. Analyze the current changeset or staged files (`git diff` / `git diff --cached`).
2. Check for:
   - Bugs and logic errors
   - Security issues (SQL injection, XSS, path traversal, secrets)
   - Style violations (see `rules/format.md`)
   - Proper error handling and edge cases
3. Verify test coverage for new or modified code (see `rules/testing.md`).
4. Output a structured review summary with severity levels:

```
## Review Summary
### Critical
- [ ] ...
### Warning
- [ ] ...
### Info
- [ ] ...
```

5. **IMPORTANT:** Flag any code that adds reminders, notifications, alert tones, analytics, or time-blocking — those features must not exist in callsheet.
