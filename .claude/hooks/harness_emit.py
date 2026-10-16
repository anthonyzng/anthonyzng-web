"""Send one event to the harness (Owwsolution/harness) when it is installed; otherwise do nothing.

Never raises and never waits more than 2 seconds: measurement must not slow or break a hook.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path

PROJECT = "anthonyzng-web"


def harness_path() -> str | None:
    try:
        found = shutil.which("harness")
        if found:
            return found
        candidate = Path.home() / ".local" / "bin" / ("harness.exe" if sys.platform == "win32" else "harness")
        return str(candidate) if candidate.exists() else None
    except Exception:
        return None


def emit(name: str, attributes: Mapping[str, object], *, source: str = "hook", session_id: str | None = None) -> None:
    try:
        exe = harness_path()
        if exe is None:
            return
        payload = {"project": PROJECT, "source": source, "name": name, "attributes": dict(attributes),
                   "session_id": session_id}
        subprocess.run([exe, "emit", "--stdin"], input=json.dumps(payload), text=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2, check=False)
    except Exception:
        return
