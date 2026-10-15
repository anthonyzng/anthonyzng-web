"""Run the pre-commit checks (CLAUDE.md section 6) for the parts of the repo that changed.

    python .claude/hooks/checks.py            # every changed area
    python .claude/hooks/checks.py frontend   # one area, changed or not

A pass is remembered per area as a fingerprint of its uncommitted changes (in .git/claude-checks/),
so the commit guard (git_guard.py) does not run the same checks again for an unchanged tree.
Exit code 0 when everything passed, 1 otherwise.
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

AREAS: dict[str, list[str]] = {
    "frontend": ["npm run lint", "npm test", "npm run build"],  # build runs the typecheck (tsc -b)
    "backend": [
        "python -m uv run ruff check .",
        "python -m uv run ruff format --check .",
        "python -m uv run mypy .",
        "python -m uv run pytest -q",
    ],
}
TIMEOUT_S = 600
TAIL_LINES = 60


def git(*args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, check=True).stdout


def untracked(area: str) -> list[str]:
    out = git("ls-files", "--others", "--exclude-standard", "-z", "--", area)
    return sorted(p for p in out.decode("utf-8").split("\0") if p)


def changed_areas() -> list[str]:
    tracked = git("diff", "HEAD", "--name-only", "-z").decode("utf-8").split("\0")
    paths = [p for p in tracked if p] + untracked(".")
    return [a for a in AREAS if any(p.startswith(f"{a}/") for p in paths)]


def fingerprint(area: str) -> str:
    h = hashlib.sha256(git("diff", "HEAD", "--binary", "--", area))
    for path in untracked(area):
        h.update(path.encode())
        try:
            h.update((ROOT / path).read_bytes())
        except OSError:
            pass
    return h.hexdigest()


def stamp_path(area: str) -> Path:
    return Path(git("rev-parse", "--git-path", f"claude-checks/{area}").decode().strip()).resolve()


def passed_already(area: str) -> bool:
    try:
        return stamp_path(area).read_text() == fingerprint(area)
    except OSError:
        return False


def run_area(area: str, out=sys.stderr) -> bool:
    for cmd in AREAS[area]:
        print(f"[checks] {area}: {cmd}", file=out, flush=True)
        try:
            proc = subprocess.run(
                cmd, cwd=ROOT / area, shell=True, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            print(f"[checks] {area}: `{cmd}` timed out after {TIMEOUT_S}s", file=out)
            return False
        if proc.returncode != 0:
            tail = (proc.stdout + proc.stderr).strip().splitlines()[-TAIL_LINES:]
            print(f"[checks] {area}: `{cmd}` FAILED (exit {proc.returncode})\n" + "\n".join(tail), file=out)
            return False
    path = stamp_path(area)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(fingerprint(area))
    print(f"[checks] {area}: all passed", file=out)
    return True


def run(areas: list[str], out=sys.stderr, skip_passed: bool = True) -> bool:
    ok = True
    for area in areas:
        if skip_passed and passed_already(area):
            print(f"[checks] {area}: already passed for these changes", file=out)
            continue
        ok = run_area(area, out) and ok
    return ok


def main() -> int:
    requested = sys.argv[1:]
    unknown = [a for a in requested if a not in AREAS]
    if unknown:
        print(f"unknown area(s): {', '.join(unknown)}; choose from {', '.join(AREAS)}", file=sys.stderr)
        return 2
    areas = requested or changed_areas()
    if not areas:
        print("[checks] no frontend/ or backend/ changes; nothing to check", file=sys.stderr)
        return 0
    return 0 if run(areas, skip_passed=not requested) else 1


if __name__ == "__main__":
    sys.exit(main())
