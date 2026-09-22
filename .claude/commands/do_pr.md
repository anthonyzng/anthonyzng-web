---
description: Open a PR from the current feature branch into main, merge it, and sync local main
---

Open a Pull Request for the current branch and merge it into `main`. Follow these steps exactly and stop with a clear report if any step fails.

1. **Pre-checks**
   - Run `git branch --show-current`. If it is `main`, stop and tell the owner there is nothing to PR.
   - Run `git status --porcelain`. If there are uncommitted changes, stop and ask the owner whether to review + commit them first (per the CLAUDE.md workflow).
   - Run `git fetch origin` and confirm the branch is pushed and not behind its remote (`git status -sb`). Push it if local commits are missing on the remote.

2. **Create the PR** using the **GitHub MCP** server (repo `anthonyzng/anthonyzng-web`, base `main`, head = current branch).
   - Title: a concise Conventional-Commit style summary of all commits on the branch (`git log main..HEAD --oneline`).
   - Body: `## Summary` (bullet list of changes), `## Commits` (the oneline log), then end with:
     `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

3. **Merge the PR** via the GitHub MCP server using **squash merge**, then delete the remote branch.
   - If the merge is blocked (conflicts, failing checks), do NOT force it. Report the reason and stop.

4. **Sync local**
   - `git checkout main`
   - `git pull origin main`
   - Delete the local feature branch: `git branch -d <branch>`

5. **Report** the PR URL, merge commit SHA, and confirm that the next task will start a new branch named `ddmmyyyy_hhmmss_by_claude_anthony`.

Only ever act as GitHub account `anthonyzng`.
