"""PostToolUse hook (Edit, Write): format an edited backend Python file with the backend's ruff.

Never blocks: without backend/.venv (python -m uv sync --all-groups) it does nothing.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    raw = (payload.get("tool_input") or {}).get("file_path") or ""
    if not raw.endswith(".py"):
        return
    path = Path(raw).resolve()
    if BACKEND not in path.parents or not path.is_file():
        return
    ruff = next((p for p in (BACKEND / ".venv/Scripts/ruff.exe", BACKEND / ".venv/bin/ruff") if p.is_file()), None)
    if ruff is None:
        return
    subprocess.run([str(ruff), "format", "--quiet", str(path)], cwd=BACKEND, capture_output=True, timeout=30)


if __name__ == "__main__":
    main()
