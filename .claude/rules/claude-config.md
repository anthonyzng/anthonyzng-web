---
paths:
  - ".claude/**"
  - "CLAUDE.md"
  - "**/CLAUDE.md"
---

# Claude Code configuration: hooks, skills, checks

Loaded when working on `.claude/` or any `CLAUDE.md`. The must-follow workflow stays in the root `CLAUDE.md` section 4.

## Files

```
anthonyzng-web/
├── .claude/
│   ├── settings.json           # project plugins and hooks (hooks/git_guard.py before git commit/push and GitHub MCP file writes, hooks/format_python.py after edits)
│   ├── hooks/                  # git_guard.py (no commit/push on main, secret scan, checks), checks.py (section 6 checks), format_python.py
│   ├── skills/                 # ship, verify-ui, add-ui-string, schema-change, local-stack
│   └── commands/do_pr.md       # /do_pr command
```

## Hooks

- Hooks (`.claude/settings.json`) enforce the rules, they do not replace them: `git_guard.py` refuses a `git commit` on `main`, a push from or to `main` (except a new repository's initial push, while its remote has no `main` yet), a commit that adds a key-shaped string or a file such as `.env` / `*.pem` (a deliberate example line can carry `secret-scan: allow`), a commit whose changed areas fail the section 6 checks (this repository only; for any repository the guard acts on the one the command targets: `git -C <dir>`, a leading `cd <dir> &&` or the session's folder), and a GitHub MCP write (`push_files`, `create_or_update_file`, `delete_file`) to `main`, without a branch, of such a file or with a secret in it (pull requests and their merge are not affected) (run by `checks.py`, which remembers a pass per area in `.git/claude-checks/`, so checks already run for the same changes are not repeated); `format_python.py` runs the backend's `ruff format` on every edited `backend/**/*.py`. When the harness (`Owwsolution/harness`) is installed, `git_guard.py` reports its blocks and `checks.py` runs its checks through `harness check`, via `.claude/hooks/harness_emit.py`; without it nothing changes. When a hook blocks, fix the cause; never bypass it.

## Skills

- The `ship` skill (`.claude/skills/ship/SKILL.md`) walks these steps from the checks to the push. Other project skills: `verify-ui` (the browser matrix: widths, themes, languages), `add-ui-string` (both locales), `schema-change` (model to docs, end to end), `local-stack` (the containerised stack on a local platform).

## Plugins

- `superpowers`: planning / TDD / debugging workflows
- `ui-ux-pro-max`: UI/UX design system guidance
- `code-review`: pre-commit review
- `example-skills` (Anthropic): includes `webapp-testing` and `mcp-builder`

The figma skills (synced from claude.ai) are `user-invocable-only` here (`skillOverrides` in `.claude/settings.json`): they are not offered to the model; when a task needs one, ask the owner, who runs it as a slash command.
