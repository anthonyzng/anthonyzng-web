# Context Diet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the root `CLAUDE.md` from 333 lines / 26,182 bytes to under 150 lines / 10 KB by moving part-specific
text into two path-scoped rules, the nested `frontend/CLAUDE.md` and `backend/CLAUDE.md`, the `local-stack` skill and
`README.md`, and add a "Compact instructions" section.

**Architecture:** Documentation only; no code changes. Every line of the old root `CLAUDE.md` gets exactly one home
(the move map below). A throw-away ledger script, run after every task, proves that no line was lost and warns about
lines that now live in two places. Each task moves one destination's text and removes it from the root in the same
commit, so the repository is consistent after every task.

**Tech Stack:** Markdown, Claude Code memory (`CLAUDE.md`, `.claude/rules/*.md` with `paths:` frontmatter, skills),
Python 3 for the ledger script, the owner's harness (`instruction_loads`) for the rule-load check.

**Spec:** `docs/specs/2026-10-18-context-diet-design.md` (approved 2026-10-18; roadmap to `README.md`; this work goes
before the harness context work).

## Global Constraints

- Root `CLAUDE.md` target: **under 150 lines, under 10 KB** (`wc -l -c CLAUDE.md`).
- **Nothing is deleted:** every sentence that leaves the root lands in a rule, a nested `CLAUDE.md`, a skill or the
  README. Move text verbatim (same words, tables stay tables) so the ledger script can find it; a line you must
  reword goes into the PR's ledger table with its new home.
- **Must-follow rules never move out of the root:** section 4 (workflow, GitHub account, security, personal data) stays
  word for word, except the hooks bullet of 4.2, which is shortened (Task 3).
- **Each fact has exactly one home.** The root section 7 index names every rule and nested file with one line on what
  it covers.
- Keep the root section numbers 1 to 8: hooks, skills and docs cite "CLAUDE.md 4.2", "section 6" and "section 7".
- New rules: `.claude/rules/infra.md` and `.claude/rules/claude-config.md` only. Frontend and backend text goes into the
  nested `CLAUDE.md` files, never into new rules.
- Out of scope: vector RAG, embeddings, a new MCP server; any `~/.claude/*` file; the content of `docs/` topic notes
  (Task 6 fixes two cross-references, nothing else).
- Workflow: work on the current feature branch (never `main`), run `python .claude/hooks/checks.py` before each commit
  (a task that touches `frontend/` or `backend/` runs that area's full checks; `backend/` needs the dev database
  container), Conventional Commits with `docs:`, end each message with the model trailer the session gives.

## Review Focus

- **A question that touches no file** ("how do we deploy?") loads no path-scoped rule: the root section 7 must name
  `infra.md` and `claude-config.md` so Claude reads them on demand. Pinned by Task 7 step "index check".
- **Section references in hooks, skills and docs** (`CLAUDE.md 4.2`, `section 6`, `section 7`, `section 5`) must still
  point at the right text. Pinned by Task 7 step "reference check" and Task 6's two docs fixes.
- **Malformed `paths:` frontmatter** makes a rule load always or never. Pinned by Task 2 step "rule-load check".
- **Text copied but not removed from the root** (two homes) drifts. The ledger script's "doubled" warnings must be
  empty at the end, except lines listed in the PR ledger.
- **Section 4 edited by accident** while cutting around it. Pinned by Task 7 step "section 4 check".

## Move map (old root section → new home)

| Old root text | New home | Task |
|---------------|----------|------|
| 1 intro, three roles, GitHub repo line | stays in root | – |
| 1 Features (full list with details) | `README.md` "Features"; root keeps a one-line compact list | 6, 7 |
| 1 Home page requirements (3 bullets) | stays in root, unchanged | – |
| 1 Design direction (all bullets) | `frontend/CLAUDE.md` "Design direction"; root keeps two lines | 4 |
| 2 Architecture: diagram, hosting, domains/DNS, backups bullets | `.claude/rules/infra.md`; root keeps a 5-line summary | 2 |
| 2 Tech stack rows Frontend, Styling, Animation, i18n, Routing | `frontend/CLAUDE.md` "Stack" (table) | 4 |
| 2 Tech stack rows Backend, Database, Admin auth, Contact | `backend/CLAUDE.md` "Stack" (table) | 5 |
| 2 Tech stack rows Proxy/TLS, CI/CD, Analytics | `.claude/rules/infra.md` "Stack" (table) | 2 |
| 3 Layout: `frontend/` subtree | `frontend/CLAUDE.md` "Files" (code block) | 4 |
| 3 Layout: `backend/` subtree | `backend/CLAUDE.md` "Files" (code block) | 5 |
| 3 Layout: `.claude/` subtree, `.mcp.json` | `.claude/rules/claude-config.md` "Files" | 3 |
| 3 Layout: `db/`, `deploy/`, `.github/workflows/` subtrees, compose files, `.env.example` | `.claude/rules/infra.md` "Files" | 2 |
| 3 Layout: `docs/` subtree (5 lines) | stays in root under the `docs/` entry: the map to the topic notes | 7 |
| 3 Layout: top level | stays in root, one line per top-level entry | 7 |
| 4 (all) | stays in root, word for word | – |
| 4.2 hooks bullet (the long paragraph) | `.claude/rules/claude-config.md` "Hooks"; root keeps one line per hook | 3 |
| 5 General | stays in root | – |
| 5 Frontend bullets | `frontend/CLAUDE.md` "Conventions" | 4 |
| 5 Backend bullets (incl. the localised storage model) | `backend/CLAUDE.md` "Conventions" | 5 |
| 6 Frontend commands | `frontend/CLAUDE.md` "Commands" | 4 |
| 6 Dev database + Backend commands | `backend/CLAUDE.md` "Commands" | 5 |
| 6 Full stack on a local platform (all lines) | `.claude/skills/local-stack/SKILL.md` "Commands" | 6 |
| 6 Production line | `.claude/rules/infra.md` "Operations" | 2 |
| 6 `checks.py` line and the two "Before every commit" lines | stay in root | – |
| 7 index | stays in root, extended with the rules, the skill and the README | 7 |
| 8 plugin list details, figma `skillOverrides` paragraph | `.claude/rules/claude-config.md` "Plugins"; root keeps 2 lines | 3 |
| 9 Roadmap | `README.md` "Roadmap" | 6 |
| 10 Open Questions: the Phase 4 decision note | `README.md` "Roadmap", under the table; "None at the moment" is dropped (it states nothing) | 6 |
| (new) Compact instructions | root, after section 8 | 7 |

Decisions this plan makes (the spec leaves them open): the full feature list goes to `README.md` (it is
human-facing and the root keeps what Claude needs); the localised storage model goes to `backend/CLAUDE.md` with the
other backend conventions, and `docs/frontend/content.md`'s pointer to "CLAUDE.md section 5" is updated to it; root
section numbers are kept so no hook or skill text changes.

---

### Task 1: Ledger script and baseline

**Files:**
- Create (not committed): `$SCRATCH/ledger_check.py`, where `$SCRATCH` is the session scratchpad or any folder outside
  the repo.

**Interfaces:**
- Produces: `python $SCRATCH/ledger_check.py` run from the repo root; exit 0 when every unit of `main:CLAUDE.md` is
  found in some destination, else exit 1 with the missing units; always prints "doubled" warnings.

- [ ] **Step 1: Write the script**

```python
"""Context-diet ledger: every line of main's root CLAUDE.md must still exist in one of its new homes."""
import re
import subprocess
import sys
from pathlib import Path

DEST = ["CLAUDE.md", "frontend/CLAUDE.md", "backend/CLAUDE.md", "README.md",
        ".claude/skills/local-stack/SKILL.md", *sorted(map(str, Path(".claude/rules").glob("*.md")))]
PREFIX = re.compile(r"^[\s│├└─]*(?:[-*]|\d+\.|#+|>|\|)?\s*")


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def units(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        unit = norm(PREFIX.sub("", line).rstrip("| "))
        if len(unit) >= 12 and not set(unit) <= set("-|: "):
            out.append(unit)
    return list(dict.fromkeys(out))


old = subprocess.run(["git", "show", "main:CLAUDE.md"], capture_output=True, check=True).stdout.decode("utf-8")
homes = {p: norm(Path(p).read_text(encoding="utf-8")) for p in DEST if Path(p).exists()}
missing = []
for unit in units(old):
    found = [p for p, body in homes.items() if unit in body]
    if not found:
        missing.append(unit)
    elif len(found) > 1 and len(unit) >= 40:
        print(f"doubled ({', '.join(found)}): {unit[:100]}")
for unit in missing:
    print(f"MISSING: {unit[:140]}")
print(f"{len(missing)} missing; root CLAUDE.md {len(Path('CLAUDE.md').read_bytes())} bytes")
sys.exit(1 if missing else 0)
```

- [ ] **Step 2: Run it on the untouched tree**

Run: `python $SCRATCH/ledger_check.py`
Expected: `0 missing; root CLAUDE.md 26182 bytes`, exit 0. Any "doubled" lines printed now are pre-existing and are
noted for the PR ledger. If `main:CLAUDE.md` has changed since the spec, use the new byte count as the baseline.

No commit (the script stays outside the repo).

---

### Task 2: `infra` rule (and the rule-load check)

**Files:**
- Create: `.claude/rules/infra.md`
- Modify: `CLAUDE.md` section 2 (Architecture), section 3 (the infra lines of the tree), section 6 (the production line)

**Interfaces:**
- Produces: `.claude/rules/infra.md`, named by Task 7's index.

- [ ] **Step 1: Create `.claude/rules/infra.md` with this frontmatter and headings**

```markdown
---
paths:
  - "deploy/**"
  - "docker-compose*.yml"
  - ".github/workflows/**"
  - "**/Dockerfile"
  - "db/**"
  - "docs/containers.md"
  - "docs/deployment.md"
---

# Infrastructure: platform, hosting, CI/CD

Loaded when working on deployment, containers or CI. Details: `docs/containers.md`, `docs/deployment.md`.

## Architecture
## Stack
## Files
## Operations
```

Move verbatim: under "Architecture" the paragraph "Each tier runs in its own Docker container…", the diagram block and
the Hosting, Domains and Backups bullets; under "Stack" a table with the header row and the Proxy/TLS, CI/CD and
Analytics rows; under "Files" a code block with the tree lines for `docker-compose.yml`, `docker-compose.local.yml`,
`docker-compose.dev.yml`, `.env.example`, `db/` (and `init/`), `deploy/` (and its three entries), `.github/workflows/`
(and its two entries); under "Operations" the line
`# Production: CI deploys (docs/deployment.md); on the VM: cd /opt/apps/anthonyzng-web && docker compose ps`.

- [ ] **Step 2: Replace root section 2 with the summary and remove the moved lines from sections 3 and 6**

Root section 2 becomes (the tech stack table keeps only the rows Tasks 4 and 5 have not moved yet; Task 5 removes the
table header):

```markdown
## 2. Architecture

- Three tiers, each in its own Docker container: React SPA (static, nginx), FastAPI backend, one-off `migrate` job.
- They run on the **Owwsolution platform** (private repo `Owwsolution/platform`): its Caddy and PostgreSQL 17 are shared; this repo brings its own database `anthonyzng_web` and Caddy snippet `deploy/anthonyzng-web.caddy`.
- Domains: `owwsolution.com` (+ `www`) → frontend, `api.owwsolution.com` → backend.
- Hosting: GCP Compute Engine VM `anthonyzng-web`, Docker only on the host; CI/CD by GitHub Actions to GHCR and the VM.
- DNS and edge: Cloudflare (proxied, Full strict, Web Analytics). Details: the `infra` rule (`.claude/rules/infra.md`).
```

- [ ] **Step 3: Run the ledger**

Run: `python $SCRATCH/ledger_check.py`
Expected: `0 missing`, exit 0; no "doubled" line names both `CLAUDE.md` and `.claude/rules/infra.md`.

- [ ] **Step 4: Rule-load check (spec section 5: verify that rule loads are reported)**

Start a fresh Claude Code session in this repo (the desktop app, or the npm `claude` 2.1.252 or later: the standalone
2.1.81 rejects the harness hooks) and ask: "Read deploy/anthonyzng-web.caddy and reply OK". Then, in the harness repo:

```bash
harness ingest
docker compose exec db psql -U postgres -d harness -c "SELECT occurred_at, load_reason, path, bytes FROM instruction_loads WHERE path LIKE '%infra.md' ORDER BY occurred_at DESC LIMIT 5;"
```

Expected: one row from that session (`load_reason` names the path-glob load). If no row appears, ask the session
`/memory` whether the rule is loaded: loaded but not reported means Claude Code does not send `InstructionsLoaded` for
rules (write that in the PR; the harness then measures only `session_start` bytes); not loaded means the frontmatter is
wrong: fix it before going on.

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/infra.md CLAUDE.md
git commit -m "docs: move the infrastructure detail of CLAUDE.md into a path-scoped infra rule"
```

---

### Task 3: `claude-config` rule

**Files:**
- Create: `.claude/rules/claude-config.md`
- Modify: `CLAUDE.md` section 3 (the `.claude/` and `.mcp.json` tree lines), 4.2 (hooks bullet), section 8

**Interfaces:**
- Produces: `.claude/rules/claude-config.md`, named by Task 7's index.

- [ ] **Step 1: Create the rule**

Frontmatter `paths:` `".claude/**"`, `"CLAUDE.md"`, `"**/CLAUDE.md"`. Title "# Claude Code configuration: hooks,
skills, checks". Sections, text moved verbatim: "Files" (code block: the `.mcp.json` line and the `.claude/` subtree);
"Hooks" (the whole 4.2 bullet that starts "Hooks (`.claude/settings.json`) enforce the rules…", including the harness
sentence); "Skills" (the 4.2 bullet "The `ship` skill … Other project skills: …"); "Plugins" (the section 8 list and
the figma `skillOverrides` paragraph).

- [ ] **Step 2: Shorten the root**

In 4.2 replace the hooks bullet and the skills bullet with exactly:

```markdown
- Skills: `ship` walks the steps from the checks to the push; also `verify-ui`, `add-ui-string`, `schema-change`, `local-stack`.
- Hooks enforce these rules, they do not replace them (detail: `.claude/rules/claude-config.md`). When a hook blocks, fix the cause; never bypass it.
  - `git_guard.py`: no commit on `main`, no push from or to `main`, no secrets or key files, no commit whose changed areas fail the section 6 checks, no GitHub MCP file write to `main`.
  - `checks.py`: runs the section 6 checks per changed area and remembers a pass.
  - `format_python.py`: `ruff format` on every edited `backend/**/*.py`.
```

Section 8 becomes two lines: the plugin names (`superpowers`, `ui-ux-pro-max`, `code-review`, `example-skills`) and
"The figma skills are user-invocable only; ask the owner to run one (detail: `.claude/rules/claude-config.md`)."
Every other line of 4.2, 4.1, 4.3 and 4.4 stays word for word.

- [ ] **Step 3: Run the ledger**

Run: `python $SCRATCH/ledger_check.py`
Expected: `0 missing`. The new short lines are not in `main` and so are not checked; the old long lines are found in
the rule.

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/claude-config.md CLAUDE.md
git commit -m "docs: move hook, skill and plugin detail of CLAUDE.md into a claude-config rule"
```

---

### Task 4: Frontend text into `frontend/CLAUDE.md`

**Files:**
- Modify: `frontend/CLAUDE.md` (append), `CLAUDE.md` sections 1 (design direction), 2 (frontend stack rows), 3
  (`frontend/` subtree), 5 (Frontend), 6 (Frontend commands)

- [ ] **Step 1: Append to `frontend/CLAUDE.md`, verbatim**, after the existing bullets: "## Stack" (table header
  and the Frontend, Styling, Animation, i18n, Routing rows), "## Design direction" (all bullets of root 1 "Design
  direction"), "## Conventions" (all bullets of root 5 "Frontend"), "## Files" (the `frontend/` subtree as a code
  block), "## Commands" (the "Frontend (run inside frontend/)" code block lines). Change the intro sentence's "the
  root `CLAUDE.md` holds the project overview, workflow and commands" to "the root `CLAUDE.md` holds the project
  overview, workflow and the pre-commit checks".

- [ ] **Step 2: Remove those lines from the root**; root 1 "Design direction" becomes two lines:

```markdown
### Design direction
Minimal, modern, professional editorial portfolio: generous whitespace, strong grotesk + mono typography, neutral palette with one accent, tasteful scroll motion. Detail: `frontend/CLAUDE.md`.
```

- [ ] **Step 3: Run the ledger and the frontend checks**

Run: `python $SCRATCH/ledger_check.py` → `0 missing`.
Run: `python .claude/hooks/checks.py frontend` → every command passes (lint, test, build).

- [ ] **Step 4: Commit**

```bash
git add frontend/CLAUDE.md CLAUDE.md
git commit -m "docs: move frontend stack, design, conventions, layout and commands into frontend/CLAUDE.md"
```

---

### Task 5: Backend text into `backend/CLAUDE.md`

**Files:**
- Modify: `backend/CLAUDE.md` (append), `CLAUDE.md` sections 2 (backend stack rows and the now-empty table), 3
  (`backend/` subtree), 5 (Backend), 6 (Dev database and Backend commands)

- [ ] **Step 1: Append to `backend/CLAUDE.md`, verbatim:** "## Stack" (table header and the Backend, Database,
  Admin auth, Contact rows), "## Conventions" (all bullets of root 5 "Backend"), "## Files" (the `backend/` subtree as
  a code block), "## Commands" (the "Dev database" and "Backend" code block lines). Same intro-sentence change as Task 4.

- [ ] **Step 2: Remove those lines from the root**, and the `### Tech stack` heading and table header once no row is
  left. The root keeps section 5 "General" only.

- [ ] **Step 3: Run the ledger and the backend checks**

Start the dev database first (`docker compose -f docker-compose.dev.yml up -d db`).
Run: `python $SCRATCH/ledger_check.py` → `0 missing`.
Run: `python .claude/hooks/checks.py backend` → ruff, format check, mypy and pytest pass.

- [ ] **Step 4: Commit**

```bash
git add backend/CLAUDE.md CLAUDE.md
git commit -m "docs: move backend stack, conventions, layout and commands into backend/CLAUDE.md"
```

---

### Task 6: `local-stack` skill, README and the two docs pointers

**Files:**
- Modify: `.claude/skills/local-stack/SKILL.md`, `README.md`, `docs/frontend/content.md:5`, `docs/containers.md:17`,
  `CLAUDE.md` sections 1 (Features), 6 (Full stack), 9, 10

- [ ] **Step 1: Skill.** Add a "## Commands" section at the end of `SKILL.md` with the whole "Full stack on a local
  platform" block of root section 6, verbatim, as a `bash` code block. Change line 8's "The full command list is root
  `CLAUDE.md` section 6 ("Full stack")" to "The full command list is in "Commands" below".

- [ ] **Step 2: README.** Add "## Features" (the root 1 Features list, verbatim) after "Stack", and "## Roadmap" (the
  section 9 table, verbatim, then the sentence "The localised content storage model was decided in Phase 4: one JSONB
  `translations` column per row (see `backend/CLAUDE.md`)."). Change "(see CLAUDE.md section 6)" to "(see the
  `local-stack` skill, `.claude/skills/local-stack/SKILL.md`)" and "See [CLAUDE.md](CLAUDE.md) for architecture,
  workflow, commands and roadmap." to "See [CLAUDE.md](CLAUDE.md) for the workflow and where each topic is documented."

- [ ] **Step 3: Docs pointers (the only `docs/` edits).** `docs/frontend/content.md:5`: "the storage model is in
  `CLAUDE.md` section 5" → "the storage model is in `backend/CLAUDE.md`, Conventions". `docs/containers.md:17`:
  "(`CLAUDE.md` section 6, "Full stack")" → "(the `local-stack` skill, "Commands")".

- [ ] **Step 4: Root.** Remove sections 9 and 10 and the Full stack block of section 6. Replace the Features
  subsection with one line:

```markdown
Features: experience timeline, projects, skills, tools and archive, contact form (Turnstile), CV download, EN + zh-Hant, dark/light worlds, SEO, analytics, admin panel (all content in the database). Detail: `README.md`.
```

- [ ] **Step 5: Run the ledger** → `0 missing`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/local-stack/SKILL.md README.md docs/frontend/content.md docs/containers.md CLAUDE.md
git commit -m "docs: move the local-stack commands into its skill, features and roadmap into the README"
```

---

### Task 7: Finish the root: layout, index, Compact instructions, final checks

**Files:**
- Modify: `CLAUDE.md` sections 3, 6, 7, 8 and a new "Compact instructions" section

- [ ] **Step 1: Section 3** becomes a code block of the top-level entries only, one line each, keeping their original
  comments: `CLAUDE.md`, `README.md`, `docker-compose.yml`, `docker-compose.local.yml`, `docker-compose.dev.yml`,
  `.env.example`, `.mcp.json`, `.claude/`, `db/`, `frontend/`, `backend/`, `docs/` (with its five sub-lines),
  `deploy/`, `.github/workflows/`, then "Per-folder detail: `frontend/CLAUDE.md`, `backend/CLAUDE.md`, the rules; CodeGraph answers "where is X"."

- [ ] **Step 2: Section 6** keeps the `python .claude/hooks/checks.py` paragraph and the two "Before every commit"
  lines, preceded by: "Per-area commands: `frontend/CLAUDE.md`, `backend/CLAUDE.md`; the full local stack: the
  `local-stack` skill; production: `.claude/rules/infra.md`." Reword "runs these for each changed area" to "runs the
  per-area checks for each changed area" (PR ledger line).

- [ ] **Step 3: Section 7.** Add rows to the table: `.claude/rules/infra.md` (loaded with `deploy/`, compose files,
  workflows, Dockerfiles, `db/`, the two infra docs; covers architecture, platform, hosting, CI/CD, DNS, backups),
  `.claude/rules/claude-config.md` (loaded with `.claude/**` and any `CLAUDE.md`; covers hooks, skills, plugins),
  `.claude/skills/local-stack/SKILL.md` (on demand; the full-stack commands), `README.md` (on demand; features,
  roadmap). Add the line "A rule loads only when a matching file is read or edited; for a question that touches no
  file, read the rule this table names." Update the `frontend/CLAUDE.md` and `backend/CLAUDE.md` rows' "Covers" with
  "stack, conventions, files, commands".

- [ ] **Step 4: Compact instructions.** After section 8, add exactly the spec's text:

```markdown
## Compact instructions
When compacting, keep: the current task and its acceptance checks; the path of the plan, ledger or harness focus file in use;
every file modified in this session; the test and check commands run and their last result; open questions for the
owner; decisions the owner made in this session, quoted. Drop: file contents already written to disk, tool output
already acted on, superseded attempts.
```

- [ ] **Step 5: Size check**

Run: `wc -l -c CLAUDE.md`
Expected: under 150 lines and under 10,000 bytes. If over, shorten the root's own summaries (sections 1 to 3), never
section 4.

- [ ] **Step 6: Section 4 check**

Run: `git show main:CLAUDE.md | sed -n '/^## 4\./,/^## 5\./p' > $SCRATCH/s4-old.md; sed -n '/^## 4\./,/^## 5\./p' CLAUDE.md > $SCRATCH/s4-new.md; diff $SCRATCH/s4-old.md $SCRATCH/s4-new.md`
Expected: the only difference is the hooks and skills bullets replaced in Task 3.

- [ ] **Step 7: Index check**

Run: `grep -c "rules/infra.md\|rules/claude-config.md\|frontend/CLAUDE.md\|backend/CLAUDE.md\|local-stack\|README.md" CLAUDE.md`
Expected: each of the six names appears in section 7 (check by eye in the table).

- [ ] **Step 8: Reference check**

Run: `grep -rn "CLAUDE.md.\{0,3\}\(section \)\?[0-9]" .claude docs README.md frontend/CLAUDE.md backend/CLAUDE.md | grep -v "Moved from"`
Expected: every hit cites 4.2, 6 or 7, and the cited section still holds that text (4.2 the per-task flow, 6 the
checks, 7 the index). No hit cites 5 (Task 6 fixed it) or 9/10.

- [ ] **Step 9: Ledger, final**

Run: `python $SCRATCH/ledger_check.py`
Expected: `0 missing`, root under 10,000 bytes; every "doubled" line is either a pre-existing one from Task 1 or is
listed in the PR ledger with a reason.

- [ ] **Step 10: Commit and push**

```bash
git add CLAUDE.md
git commit -m "docs: root CLAUDE.md down to the shared rules, an index of every rule and Compact instructions"
git push
```

The PR (opened by the owner with `/do_pr`) carries the move map above as its ledger, plus every reworded line and the
result of Task 2's rule-load check.

---

## After shipping (owner, about a week later)

Read the harness dashboard's before/after table with the merge date as the change date: session-start bytes of the
root `CLAUDE.md` (26,182 → under 10,000), `instruction_loads` rows for the two rules only in sessions that touched their
paths, median peak context and compactions per session lower or equal, check pass rate and interventions not worse
(spec section 5). Nothing to build.
