---
name: ship
description: Finish a task in this repo - branch check, pre-commit checks, code review, commit, push (CLAUDE.md 4.2). Use at the end of every task that changed files, or when the owner says ship / commit / push.
---

# Ship the current task

Follow these steps in order; stop and report if one fails.

1. **Branch**: `git branch --show-current`. On `main`, create the branch first:
   `git checkout -b "$(date +%d%m%Y_%H%M%S)_by_claude_anthony"` (Git Bash; PowerShell: `git checkout -b "$(Get-Date -Format 'ddMMyyyy_HHmmss')_by_claude_anthony"`).
   On any other branch, keep it.
2. **Docs**: if the change alters behaviour that `CLAUDE.md`, `frontend/CLAUDE.md`, `backend/CLAUDE.md` or a file
   under `docs/` describes, update that file now (root `CLAUDE.md` section 7 says which file covers what).
3. **Checks**: `python .claude/hooks/checks.py` (run in the background if both areas changed: it can take minutes).
   It runs the section 6 checks for each changed area (`frontend/`: lint, test, build with typecheck; `backend/`:
   ruff, format check, mypy, pytest, which needs the dev database container) and remembers the pass, so the commit
   hook does not repeat them. Fix every failure and re-run.
4. **Review**: run the `code-review` skill on the diff; fix every finding and re-review until clean.
   If a fix touched code, run step 3 again.
5. **Commit**: stage the intended files only (never `.env`, never generated junk), Conventional Commit message
   (`feat:`, `fix:`, `docs:`, ...), ending with the attribution trailer from the system reminder.
   The `git_guard.py` hook refuses a commit on `main`, one that adds a secret, or one whose checks fail; read its
   message and fix the cause, never work around it.
6. **Push**: `git push -u origin HEAD`.
7. **Report** in Traditional Chinese (Cantonese): what changed, the checks that ran, the commit and branch, and that
   `/do_pr` opens and merges the pull request when the owner is ready.
