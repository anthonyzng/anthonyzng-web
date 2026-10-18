"""PreToolUse hook: guards `git commit` and `git push` (Bash, PowerShell) and the GitHub MCP tools that
write commits straight to a remote branch (push_files, create_or_update_file, delete_file).

- No commit on `main`, and no push from or to `main` (CLAUDE.md section 4.2), except a new repository's
  initial push: `main` may be pushed while the remote has no `main` yet (checked with `git ls-remote`; a failed
  check blocks). The repository a commit or push acts on is `git -C <dir>`, a leading `cd <dir> &&`, or
  the session's cwd; the main-branch and secret rules apply to it, the section 6 checks only to this one.
- No commit that adds a secret: key-shaped strings in the added lines and untracked files, or a file
  such as `.env` or `*.pem`. A line that is a deliberate example can carry `secret-scan: allow`.
- No commit until the checks of every changed area pass (checks.py; skipped when they already
  passed for exactly these changes, e.g. through the ship skill).
- No GitHub MCP write to `main` (or with no branch named), to such a file, or with a secret in its content.
  Pull requests and their merge (/do_pr) are not affected.

Exit 2 blocks the tool call and shows stderr to Claude; any other problem lets the call through.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import checks  # noqa: E402
import harness_emit  # noqa: E402

GIT_CMD = re.compile(r"\bgit\b(?:\s+-[cC]\s+\S+)*\s+(commit|push)\b([^;&|\n]*)")
SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})"),
    "Anthropic API key": re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "Resend API key": re.compile(r"\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}"),
    "Turnstile key (real, not a test key)": re.compile(r"\b0x4AAAAAAA[A-Za-z0-9_-]{10,}"),
}
FORBIDDEN_FILE = re.compile(r"(^|/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)[^/]*)$")
ALLOWED_FILE = re.compile(r"(^|/)\.env\.example$")
ALLOW_MARK = "secret-scan: allow"
# Keep in step with the hook's matcher in .claude/settings.json.
GITHUB_WRITE_TOOLS = {"mcp__github__push_files", "mcp__github__create_or_update_file", "mcp__github__delete_file"}
MAX_FILE_BYTES = 2_000_000


CONTEXT: dict[str, str | None] = {"session_id": None, "tool_name": None}


def block(message: str, reason: str) -> None:
    harness_emit.emit("harness.guard.blocked", {"guard.reason": reason, "tool.name": CONTEXT["tool_name"] or "?"},
                      session_id=CONTEXT["session_id"])
    print(message, file=sys.stderr)
    sys.exit(2)


def target_dir(command: str, verb: str, cwd: str) -> Path:
    """The directory a `git <verb>` acts in: `git -C <dir> <verb>`, else a leading `cd <dir> &&`, else cwd."""
    match = re.search(rf"\bgit\s+-C\s+(\"[^\"]+\"|'[^']+'|\S+)\s+(?:-\S+\s+)*{verb}\b", command)
    if not match:
        match = re.search(rf"\bcd\s+(\"[^\"]+\"|'[^']+'|[^\s;&|]+)\s*&&[^;|]*\bgit\b[^;|]*\b{verb}\b", command)
    raw = match.group(1).strip("\"'") if match else ""
    # Git Bash paths (/c/Users/...) as Windows paths.
    raw = re.sub(r"^/([a-zA-Z])/", r"\1:/", raw)
    base = Path(cwd) if cwd else checks.ROOT
    return (base / raw).resolve() if raw else base


def git_in(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=True).stdout


def repo_root(directory: Path) -> Path:
    return Path(git_in(directory, "rev-parse", "--show-toplevel").decode().strip()).resolve()


def scan_line(where: str, line: str, findings: list[str]) -> None:
    if ALLOW_MARK in line:
        return
    for name, pattern in SECRET_PATTERNS.items():
        if pattern.search(line):
            findings.append(f"{where}: looks like a {name}")


def scan_for_secrets(root: Path) -> list[str]:
    findings: list[str] = []
    paths = git_in(root, "diff", "HEAD", "--name-only", "-z").decode("utf-8").split("\0")
    untracked = git_in(root, "ls-files", "--others", "--exclude-standard", "-z").decode("utf-8").split("\0")
    new_files = sorted(p for p in untracked if p)
    for path in [p for p in paths if p] + new_files:
        if FORBIDDEN_FILE.search(path) and not ALLOWED_FILE.search(path) and (root / path).exists():
            findings.append(f"{path}: this kind of file must never be committed")
    current = "?"
    for raw in git_in(root, "diff", "HEAD", "-U0", "--no-color").decode("utf-8", "replace").splitlines():
        if raw.startswith("+++ "):
            current = raw[6:] if raw.startswith("+++ b/") else raw[4:]
        elif raw.startswith("+"):
            scan_line(current, raw[1:], findings)
    for path in new_files:
        file = root / path
        try:
            if file.stat().st_size > MAX_FILE_BYTES:
                continue
            data = file.read_bytes()
        except OSError:
            continue
        if b"\0" in data:
            continue
        for number, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
            scan_line(f"{path}:{number}", line, findings)
    return findings


def guard_commit(command: str, cwd: str) -> None:
    # A repository without commits fails rev-parse (CalledProcessError): its initial commit is allowed.
    root = repo_root(target_dir(command, "commit", cwd))
    if git_in(root, "rev-parse", "--abbrev-ref", "HEAD").decode().strip() == "main":
        block("Blocked: never commit directly to main (CLAUDE.md 4.2). Create a branch first:\n"
              '  git checkout -b "$(date +%d%m%Y_%H%M%S)_by_claude_anthony"', "main_commit")
    findings = scan_for_secrets(root)
    if findings:
        block("Blocked: the commit may contain secrets. Remove them (or mark a deliberate example line "
              f"with `{ALLOW_MARK}`):\n  " + "\n  ".join(findings[:20]), "secret")
    # The section 6 checks are this repository's; another repository runs its own.
    if root == checks.ROOT.resolve():
        areas = checks.changed_areas()
        if areas and not checks.run(areas):
            block("Blocked: the pre-commit checks failed (CLAUDE.md section 6). Fix them, then commit again.",
                  "checks_failed")


def push_remote(args: str) -> str:
    """The remote named in `git push [options] <remote> ...`, or origin."""
    for token in args.split():
        if not token.startswith("-") and not token[0].isdigit():
            return token
    return "origin"


def remote_has_main(target: Path, remote: str) -> bool:
    """True when the remote has a main branch; a failed lookup counts as True (fail closed)."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(target), "ls-remote", "--exit-code", "--heads", remote, "main"],
            capture_output=True, timeout=20, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return True
    return proc.returncode != 2  # 2: the remote answered and has no main


def guard_push(args: str, command: str, cwd: str) -> None:
    target = target_dir(command, "push", cwd)
    branch = subprocess.run(
        ["git", "-C", str(target), "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, check=False
    ).stdout.strip()
    if branch != "main" and not re.search(r"(^|[\s:+])(refs/heads/)?main(\s|$)", args):
        return
    # The one exception (CLAUDE.md 4.2): a new repository's initial push, while its remote has no main yet.
    if not remote_has_main(target, push_remote(args)):
        return
    block("Blocked: never push to main; merges into main go through a pull request (/do_pr).", "main_push")


def guard_github_write(tool: str, tool_input: dict) -> None:
    branch = str(tool_input.get("branch") or "").removeprefix("refs/heads/")
    if branch in ("", "main"):
        block(f"Blocked: {tool} would commit to {branch or 'the default branch'} of "
              f"{tool_input.get('owner')}/{tool_input.get('repo')}. Never write to main; "
              "work on a branch and merge through a pull request (/do_pr).", "mcp_main_write")
    if "files" in tool_input:
        files = [(str(f.get("path", "?")), str(f.get("content", ""))) for f in tool_input.get("files") or []]
    else:
        files = [(str(tool_input.get("path", "?")), str(tool_input.get("content", "")))]
    findings: list[str] = []
    for path, content in files:
        if tool.endswith("delete_file"):
            continue
        if FORBIDDEN_FILE.search(path) and not ALLOWED_FILE.search(path):
            findings.append(f"{path}: this kind of file must never be committed")
        for number, line in enumerate(content.splitlines(), 1):
            scan_line(f"{path}:{number}", line, findings)
    if findings:
        block(f"Blocked: {tool} may commit secrets. Remove them (or mark a deliberate example line "
              f"with `{ALLOW_MARK}`):\n  " + "\n  ".join(findings[:20]), "mcp_secret")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    session = payload.get("session_id")
    CONTEXT["session_id"] = session if isinstance(session, str) else None
    CONTEXT["tool_name"] = str(payload.get("tool_name") or "") or None
    tool = str(payload.get("tool_name") or "")
    if tool.startswith("mcp__github__"):
        if tool in GITHUB_WRITE_TOOLS:
            guard_github_write(tool, payload.get("tool_input") or {})
        return
    command = (payload.get("tool_input") or {}).get("command") or ""
    matches = GIT_CMD.findall(command)
    if not matches:
        return
    try:
        for verb, args in matches:
            if verb == "commit":
                guard_commit(command, str(payload.get("cwd") or ""))
            else:
                guard_push(args, command, str(payload.get("cwd") or ""))
    except subprocess.CalledProcessError:
        return  # not inside the repo or git failed: let git report it


if __name__ == "__main__":
    main()
