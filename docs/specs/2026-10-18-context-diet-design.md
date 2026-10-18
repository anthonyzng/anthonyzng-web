# Context diet: a smaller CLAUDE.md, path-scoped rules, and plan focus that survives compaction

Status: draft for the owner's review (2026-10-18). Nothing in this spec is implemented yet.

## 1. Goal

Load less into every session, and stop losing the plan when the context is compacted:

1. **Smaller always-loaded instructions.** Today the root `CLAUDE.md` loads into every session. Instructions that
   only matter for part of the repository should load only when Claude works on that part.
2. **Plan focus.** For multi-step tasks, the current plan's key points (goal, decisions, files touched, checks, next
   step) live in a short file outside the conversation. A hook re-injects that file after compaction, so long tasks
   do not lose their thread.

The owner's harness (`Owwsolution/harness`) measures the result (section 6). It needs no new code for that.

Out of scope: vector RAG, embeddings or a new MCP knowledge server; changes to user-level files (`~/.claude/*`);
changes to the content of `docs/` topic notes.

## 2. Why this approach (research summary)

Two research passes (2026-10-18; sources on code.claude.com, the Anthropic engineering blog, and vendor and
independent posts) found:

- **Built-in layered loading beats a new RAG layer as the first step.** Claude Code's docs say to target under 200
  lines per CLAUDE.md: longer files cost context *and* reduce adherence. Instructions that matter for one part of the
  codebase belong in path-scoped rules or skills (https://code.claude.com/docs/en/memory).
- **Path-scoped rules are the built-in "retrieve only what is relevant".** A file in `.claude/rules/` with `paths:`
  frontmatter loads only when Claude reads, writes or edits a matching file. Rules without `paths:` load at launch
  like CLAUDE.md, and `@imports` are expanded at launch too, so imports organise but do not save context (same page).
- **Code retrieval is already covered.** CodeGraph (local graph index with keyword search) is installed. Popular
  code knowledge bases are structural graphs with keyword search rather than vector RAG. Claude Code's own team
  prefers agentic grep/glob search to embeddings, because indexes go stale and raise privacy problems. Vector RAG
  stays a later, measured option.
- **Plans belong in a short file outside the chat.** Spec Kit, Kiro, Codex ExecPlans, Cline's Memory Bank and the
  superpowers ledger all keep plan state in files. Anthropic's long-running-agent guidance uses a progress file plus
  notes. The compact form that recurs across them is decisions, file paths, interfaces, acceptance checks and next
  steps, with no narrative and no code bodies.
- **Compaction loses early detail and file paths.** Anthropic's docs and Factory's compression eval agree on this.
  The mitigations are a "Compact instructions" section in CLAUDE.md, and a `SessionStart` hook with the `compact`
  matcher that re-injects the plan. Its plain stdout becomes context, capped at 10,000 characters
  (https://code.claude.com/docs/en/hooks).
- **Evidence for the savings is mostly vendor-reported.** Anthropic's own numbers: tool search cut tool definitions
  by 85%, and context editing plus the memory tool improved an internal eval by 29–39%. No independent study measures
  plan files. So we measure on our own data (section 6).

## 3. Current state (measured 2026-10-18)

| Item | Size | When it loads |
|------|------|---------------|
| Root `CLAUDE.md` | 333 lines, 26,182 bytes (≈ 6.5k tokens) | every session (78 of 78 anthonyzng-web sessions in the harness) |
| `CLAUDE.local.md` | 1,768 bytes | every session |
| `~/.claude/CLAUDE.md` + `RTK.md` | 1,805 bytes | every session |
| `frontend/CLAUDE.md` | 21 lines, 6,728 bytes | on demand (10 sessions) |
| `backend/CLAUDE.md` | 17 lines, 8,321 bytes | on demand (8 sessions) |
| Auto-memory `MEMORY.md` | 14 entries | every session (index only) |

Root `CLAUDE.md` by section:

| Section | Lines | Bytes |
|---------|-------|-------|
| 1 Project Overview | 37 | 2,094 |
| 2 Architecture | 46 | 4,552 |
| 3 Repository Layout | 68 | 5,546 |
| 4 Development Workflow | 44 | 4,332 |
| 5 Coding Conventions | 24 | 2,264 |
| 6 Commands | 51 | 4,280 |
| 7 Where the details live | 25 | 1,616 |
| 8 Plugins | 11 | 497 |
| 9 Roadmap | 16 | 664 |
| 10 Open Questions | 3 | 169 |

Harness baseline for anthonyzng-web: 77 sessions with a context reading, median peak context 571k tokens, 1.21
compactions per session (93 in total).

## 4. Part A: a smaller root CLAUDE.md and path-scoped rules

### 4.1 What stays in the root CLAUDE.md (target: under 150 lines, under 10 KB)

What every task needs, whatever files it touches:

- **1 Overview**, shortened: what the site is, the three roles, the feature list as one compact list, the home page
  non-negotiables, and the design direction in two lines.
- **2 Architecture**, as a 5-line summary: the tiers and containers, the platform, the domains, hosting and DNS in
  one line each. The diagram and the details move to a rule (4.2).
- **3 Repository layout**, top level only: about 15 lines, one line per top-level folder. Per-folder detail moves
  into `frontend/CLAUDE.md` and `backend/CLAUDE.md`, and CodeGraph answers "where is X".
- **4 Workflow**, kept in full: the branch, checks, review, commit and push flow, the GitHub account and the security
  rules. These are the must-follow rules and they apply everywhere. The long hooks paragraph is shortened to one line
  per hook, with the detail in the `claude-config` rule.
- **5 Conventions**: the general rules only (English, i18n keys, Conventional Commits). The frontend and backend
  bullets move to the nested CLAUDE.md files, which already load on demand.
- **6 Commands**: only `python .claude/hooks/checks.py` and the "before every commit" lines. The per-area commands
  move to the nested CLAUDE.md files, and the local-stack commands to the existing `local-stack` skill.
- **7 Where the details live**: the index, extended with the new rules, so Claude knows where to look even before a
  rule has loaded.
- **Compact instructions** (new, about 6 lines; see 5.4).
- **8 Plugins**: 2 lines. **9 Roadmap** and **10 Open questions**: removed from the root (the roadmap is history once
  its phases are done, and section 10 holds nothing open); the roadmap moves to `README.md` (decision 4).

### 4.2 New path-scoped rules in `.claude/rules/`

| File | `paths:` | Content moved in |
|------|----------|------------------|
| `infra.md` | `deploy/**`, `docker-compose*.yml`, `.github/workflows/**`, `**/Dockerfile`, `db/**`, `docs/containers.md`, `docs/deployment.md` | the architecture diagram, hosting, platform, domains, Cloudflare, backups, CI/CD rows of the tech stack |
| `claude-config.md` | `.claude/**`, `CLAUDE.md`, `**/CLAUDE.md` | how the hooks, skills and checks work (the long 4.2 paragraph), the harness integration, `skillOverrides` |

The frontend and backend material goes into the existing nested `frontend/CLAUDE.md` and `backend/CLAUDE.md`
instead of new rules. They already load on demand the same way, and two places for the same rules would drift.

### 4.3 Rules for the move

- Nothing is deleted: every sentence that leaves the root lands in a rule, a nested CLAUDE.md, a skill or the
  README. The implementation PR lists where each section went.
- The root index (section 7) names every rule and nested file, with one line on what it covers.
- Must-follow rules (workflow, security, account, personal data) never move out of the root.

## 5. Part B: plan focus

### 5.1 The focus file

- **Path:** `.claude/focus.md`, git-ignored, one per checkout (each worktree has its own).
- **Written by Claude**, as instructed by a root CLAUDE.md rule: for a task with more than about three steps, create
  it at the start, update it when a step finishes or a decision is made, and clear it when the task is pushed (the
  `ship` skill's last step).
- **Shape:** at most 60 lines and 4,000 characters, well under the hook cap of 10,000:

```markdown
# Focus: <task in one line>  (updated <YYYY-MM-DD HH:MM>)
Goal: <what done looks like>
Branch: <branch>
Decisions:
- <decision and why, one line each>
Files touched:
- <path>: <what changed, a few words>
Checks: <commands that must pass>
Done:
- <step>
Next:
- <next step>
Open questions:
- <question for the owner>
```

- **No content that should not leave the conversation:** no secrets and no personal data, the same rule as
  everywhere else in the repository.

### 5.2 The re-injection hook

`.claude/hooks/plan_focus.py`, registered in `.claude/settings.json`:

| Event | Matcher | What it does |
|-------|---------|--------------|
| `SessionStart` | `compact` | prints `.claude/focus.md` (truncated to 9,000 characters) with a one-line header, so it becomes context right after compaction |
| `SessionStart` | `resume` | the same, for `--resume` / `--continue` |
| `SessionStart` | `startup` | prints only one line when a focus file exists: its task line and age (for example "Focus file from 2 days ago: <task>; read .claude/focus.md if you are continuing it"). The body is not injected, because a new session is often a new task. |

The hook never fails: on any error it prints nothing and exits 0. It reads only the focus file and takes no input
from the payload beyond `cwd`. It stays within the repository's hook style: Python, standard library only, run as
`python "$CLAUDE_PROJECT_DIR/.claude/hooks/plan_focus.py"`.

### 5.3 Relation to existing plans and ledgers

- The superpowers ledger (`.superpowers/sdd/<plan>/progress.md`) and specs and plans in `docs/` stay as they are.
  For those tasks, the focus file is short and points to them ("Plan: docs/plans/x.md; ledger: …"), and does not
  copy them.
- Auto-memory stays for durable facts. The focus file is only for the task in hand, and is cleared when the task ends.

### 5.4 Compact instructions (root CLAUDE.md)

A short section that Claude Code's compaction follows:

```markdown
## Compact instructions
When compacting, keep: the current task and its acceptance checks; the path of the focus file, plan or ledger in use;
every file modified in this session; the test and check commands run and their last result; open questions for the
owner; decisions the owner made in this session, quoted. Drop: file contents already written to disk, tool output
already acted on, superseded attempts.
```

## 6. Measuring it with the harness

Nothing new needs to be built. After the change ships:

| Metric | Source | Expectation |
|--------|--------|-------------|
| Bytes loaded at session start | `instruction_loads` (`session_start` rows) | root CLAUDE.md from 26,182 to under 10,000 bytes |
| On-demand loads | `instruction_loads` (`nested_traversal`; rule loads, if Claude Code reports them through `InstructionsLoaded`, which the implementation verifies first) | rules appear only in sessions that touch their paths |
| Median peak context, compactions per session | `session_summaries` | lower or equal |
| Quality guard: check pass rate, interventions, rework | dashboard cards and before/after | not worse |

The dashboard marks the change automatically, because the new hook appears in the harness inventory. CLAUDE.md
edits alone change only the session fingerprint, so they are not shown as a notice. The before/after table then compares the 7 days on each side. With fewer than 5 sessions on a side it says so, so
the owner reads it after about a week of normal use. An eval round (`harness eval`) is optional, needs the owner's
`yes`, and is not part of this work.

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| A path-scoped rule does not load for a question that touches no file (for example "how do we deploy?") | The root index names each rule, so Claude reads it on demand. The harness shows whether rule loads happen. |
| The focus file goes stale and misleads a later session | Only `compact` and `resume` inject the body; `startup` shows one line with the file's age; the `ship` skill clears it. |
| Claude forgets to update the focus file | A root CLAUDE.md rule plus the `ship` skill step. The harness cannot see the file's content, so the owner spot-checks. |
| Moved text drifts from its source | Each fact has exactly one home; section 7's index is the map. |
| The cap truncates a long focus file | A hard 60-line, 4,000-character shape; the hook truncates at 9,000 characters with a marker. |

## 8. Decisions for the owner

1. **Scope:** anthonyzng-web only for now (proposed). Or also add the focus hook at user level for every project, or
   offer it from `harness setup`?
2. **Focus file name and location:** `.claude/focus.md`, git-ignored (proposed). Or a committed file, so the plan
   travels with the branch? It is public, so it must never hold private details.
3. **`startup` behaviour:** a one-line notice (proposed), nothing, or the full body?
4. **Roadmap:** move it to `README.md` (proposed) or drop it?
5. **Who clears the focus file:** the `ship` skill at push (proposed), or `/do_pr` at merge?
