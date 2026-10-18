# Context diet: a smaller CLAUDE.md and path-scoped rules

Status: approved by the owner (2026-10-18), with both decisions in section 7 answered as proposed. Plan:
`docs/plans/2026-10-18-context-diet.md`. Nothing in this spec is implemented yet.

## 1. Goal

Load less into every turn. The root `CLAUDE.md` is sent with every turn of every session (about 6.5k tokens; over a
500-turn session that is about 3.2 million cache-read tokens, all counted against the weekly limit), and long files
reduce adherence. Instructions that only matter for part of the repository should load only when Claude works on that
part.

Plan focus, handoff instead of compaction and the reminders are not in this spec: they serve every project, so they
live in the harness (`Owwsolution/harness`, `docs/specs/2026-10-18-context-management-design.md`).

The owner's harness (`Owwsolution/harness`) measures the result (section 5). It needs no new code for that.

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
- **Compaction loses early detail and file paths.** Anthropic's docs and Factory's compression eval agree on this.
  A "Compact instructions" section in CLAUDE.md steers what the summary keeps, and the project-root CLAUDE.md is
  re-read from disk after `/compact` (https://code.claude.com/docs/en/memory).
- **Evidence for the savings is mostly vendor-reported.** Anthropic's own numbers: tool search cut tool definitions
  by 85%, and context editing plus the memory tool improved an internal eval by 29–39%. No independent study measures
  this. So we measure on our own data (section 5).

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

## 4. A smaller root CLAUDE.md and path-scoped rules

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
  its phases are done, and section 10 holds nothing open); the roadmap moves to `README.md` (decision 1).

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

### 4.4 Compact instructions (root CLAUDE.md)

A short section that Claude Code's compaction follows:

```markdown
## Compact instructions
When compacting, keep: the current task and its acceptance checks; the path of the plan, ledger or harness focus file in use;
every file modified in this session; the test and check commands run and their last result; open questions for the
owner; decisions the owner made in this session, quoted. Drop: file contents already written to disk, tool output
already acted on, superseded attempts.
```

## 5. Measuring it with the harness

Nothing new needs to be built. After the change ships:

| Metric | Source | Expectation |
|--------|--------|-------------|
| Bytes loaded at session start | `instruction_loads` (`session_start` rows) | root CLAUDE.md from 26,182 to under 10,000 bytes |
| On-demand loads | `instruction_loads` (`nested_traversal`; rule loads, if Claude Code reports them through `InstructionsLoaded`, which the implementation verifies first) | rules appear only in sessions that touch their paths |
| Median peak context, compactions per session | `session_summaries` | lower or equal |
| Quality guard: check pass rate, interventions, rework | dashboard cards and before/after | not worse |

CLAUDE.md and rule edits change only the session fingerprint, which the dashboard does not show as a notice, so the
owner picks the change date in the before/after table, which compares the 7 days on each side. With fewer than 5
sessions on a side it says so, so the owner reads it after about a week of normal use. The harness context spec adds
tokens per turn, which shows the per-turn saving directly. An eval round (`harness eval`) is optional, needs the owner's
`yes`, and is not part of this work.

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| A path-scoped rule does not load for a question that touches no file (for example "how do we deploy?") | The root index names each rule, so Claude reads it on demand. The harness shows whether rule loads happen. |
| Moved text drifts from its source | Each fact has exactly one home; the root index (section 7 of CLAUDE.md) is the map. |

## 7. Decisions for the owner (answered 2026-10-18)

1. **Roadmap:** moves to `README.md` (as proposed).
2. **Order:** this work goes first, before the harness context work (as proposed: it is small and independent).
