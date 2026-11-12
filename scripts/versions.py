#!/usr/bin/env python3
"""Write VERSIONS.md: every OS image, runtime, tool and direct dependency this repository pins.

    python scripts/versions.py               rewrite VERSIONS.md from the repository's own files
    python scripts/versions.py --refresh-os  also read each image's OS release with docker
    python scripts/versions.py --check       exit 1 when VERSIONS.md is stale (CI)

The table answers "does this advisory affect us, and where does the component run?" at a glance.
Only tracked files are read (git ls-files), so the output is the same on every machine. An image's
OS is not in any file: --refresh-os reads /etc/os-release (and the Alpine / Debian point release)
from the image and keeps it in the file's os-cache comment, keyed by the exact image reference.
A block between <!-- manual:start --> and <!-- manual:end --> (for example the host VM) is kept
as written. Standard library only (Python 3.11+). The same script is copied into every
Owwsolution / anthonyzng repository: change it in one, copy it to all.
"""

from __future__ import annotations

import io
import json
import re
import subprocess
import sys
import tarfile
import tomllib
from collections.abc import Iterable
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "VERSIONS.md"
SKIP_PARTS = ("node_modules/", "/fixtures/", "fixtures/", "testdata/", "vendor/")
UNKNOWN_OS = "unknown: run `python scripts/versions.py --refresh-os`"
DIGEST_REF = re.compile(r"\b([a-z0-9][a-z0-9./_-]*(?::[\w.-]+)?@sha256:[0-9a-f]{64})")
MANUAL = re.compile(r"<!-- manual:start -->.*?<!-- manual:end -->", re.DOTALL)
OS_CACHE = re.compile(r"<!-- os-cache: (\{.*?\}) -->")
RUNTIME_ENV = {
    "NODE_VERSION": "Node",
    "PYTHON_VERSION": "Python",
    "NGINX_VERSION": "nginx",
    "PG_VERSION": "PostgreSQL",
    "CADDY_VERSION": "Caddy",
    "GOLANG_VERSION": "Go",
    "RUST_VERSION": "Rust",
}


def tracked() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout.decode()
    return sorted(p for p in out.split("\0") if p and not any(s in p for s in SKIP_PARTS))


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8", errors="replace")


def cell(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def table(header: list[str], rows: Iterable[list[object]]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines += ["| " + " | ".join(cell(c) for c in row) + " |" for row in rows]
    return lines + [""]


def split_ref(ref: str) -> tuple[str, str]:
    """`name:tag@sha256:…` -> (`name:tag`, short digest)."""
    if "@sha256:" in ref:
        name, digest = ref.split("@sha256:", 1)
        return name, digest[:12]
    return ref, ""


# --- images ---------------------------------------------------------------------------------


def is_dev_path(path: str) -> bool:
    return any(k in path.lower() for k in ("dev", "local", "e2e", "test"))


def dockerfile_images(path: str) -> list[dict[str, str]]:
    stages: list[dict[str, str]] = []
    names: set[str] = set()
    for line in read(path).splitlines():
        m = re.match(
            r"\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?", line, re.IGNORECASE
        )
        if not m:
            continue
        ref, stage = m.group(1), (m.group(2) or "").lower()
        stages.append({"ref": ref, "stage": stage, "internal": str(ref.lower() in names)})
        if stage:
            names.add(stage)
    rows = []
    for i, s in enumerate(stages):
        if s["internal"] == "True":
            continue
        role = "runtime (shipped image)" if i == len(stages) - 1 else "build only"
        if is_dev_path(path):
            role = "dev / test"
        rows.append(
            {"file": path, "where": s["stage"] or f"stage {i + 1}", "role": role, "ref": s["ref"]}
        )
    return rows


def compose_images(path: str) -> list[dict[str, str]]:
    images: dict[str, str] = {}
    built: set[str] = set()
    service = ""
    for line in read(path).splitlines():
        m = re.match(r"^  ([A-Za-z0-9_.-]+):\s*$", line)
        if m:
            service = m.group(1)
        if re.match(r"^    build:", line):
            built.add(service)
        m = re.match(r"^\s+image:\s*['\"]?([^'\"\s#]+)", line)
        if m:
            images[service] = m.group(1)
    role = "dev / test" if is_dev_path(path) else "production"
    # Images this repository builds itself (one a service of this file builds, an interpolated
    # tag, or :local) are covered by their Dockerfile.
    own = {images[s] for s in built if s in images}
    return [
        {"file": path, "where": s, "role": role, "ref": ref}
        for s, ref in images.items()
        if ref not in own and "${" not in ref and not ref.endswith(":local")
    ]


def script_images(path: str) -> list[dict[str, str]]:
    refs = sorted(set(DIGEST_REF.findall(read(path))))
    return [{"file": path, "where": "script", "role": "tooling / tests", "ref": r} for r in refs]


def image_os(ref: str) -> str:
    """The OS release inside an image, read without running it (works for distroless too)."""
    if ref == "scratch":
        return "none (scratch)"
    # The container is never started: the entrypoint only satisfies images without a command
    # (distroless, scratch-based).
    cid = subprocess.run(
        ["docker", "create", "--entrypoint", "/versions-py-never-run", ref],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    try:
        found: dict[str, str] = {}
        for f in (
            "/etc/os-release",
            "/usr/lib/os-release",
            "/etc/alpine-release",
            "/etc/debian_version",
        ):
            res = subprocess.run(
                ["docker", "cp", f"{cid}:{f}", "-"], check=False, capture_output=True
            )
            if res.returncode != 0:
                continue
            with tarfile.open(fileobj=io.BytesIO(res.stdout)) as tar:
                member = tar.next()
                # /etc/os-release is often a symlink to /usr/lib/os-release, which is read next.
                fh = tar.extractfile(member) if member is not None and member.isreg() else None
                if fh is not None:
                    found[f] = fh.read().decode(errors="replace")
        rel = found.get("/etc/os-release") or found.get("/usr/lib/os-release", "")
        info = dict(re.findall(r'^(\w+)="?([^"\n]*)"?$', rel, re.MULTILINE))
        name = info.get("PRETTY_NAME") or info.get("NAME") or "no os-release (static / scratch)"
        point = (found.get("/etc/alpine-release") or found.get("/etc/debian_version") or "").strip()
        if point and point not in name:
            name += f" ({point})"
        # The official images name their runtime's exact version in the environment.
        env = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{json .Config.Env}}", ref],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        runtimes = [
            f"{RUNTIME_ENV[k]} {v}"
            for k, v in (e.split("=", 1) for e in json.loads(env) or [] if "=" in e)
            if k in RUNTIME_ENV
        ]
        return "; ".join([name, *runtimes])
    finally:
        subprocess.run(["docker", "rm", cid], check=False, capture_output=True)


# --- CI and toolchains -----------------------------------------------------------------------


def workflow_facts(path: str) -> tuple[list[list[str]], list[tuple[str, str]]]:
    runtimes, actions = [], []
    for line in read(path).splitlines():
        m = re.match(
            r"\s*(node-version|go-version|go-version-file|python-version|toolchain|runs-on):\s*(.+?)\s*$",
            line,
        )
        if m:
            runtimes.append([path, m.group(1), m.group(2).strip("'\"")])
        m = re.match(r"\s*(?:-\s*)?uses:\s*([^@\s]+)@(\S+)(?:\s*#\s*(\S+))?", line)
        if m and not m.group(1).startswith("./"):
            ref = m.group(2)
            version = m.group(3) or (ref if len(ref) < 40 else ref[:12])
            actions.append((m.group(1), version))
    return runtimes, actions


def toolchains(files: list[str]) -> list[list[str]]:
    rows = []
    for path in files:
        name = path.rsplit("/", 1)[-1]
        if name == "go.mod":
            for key in ("go", "toolchain"):
                m = re.search(rf"^{key}\s+(\S+)", read(path), re.MULTILINE)
                if m:
                    rows.append([path, f"Go `{key}` directive", m.group(1)])
        elif name == "package.json":
            engines = json.loads(read(path)).get("engines", {})
            rows += [[path, f"engines.{k}", v] for k, v in sorted(engines.items())]
        elif name == "pyproject.toml":
            req = tomllib.loads(read(path)).get("project", {}).get("requires-python")
            if req:
                rows.append([path, "requires-python", req])
        elif name == "Cargo.toml":
            pkg = tomllib.loads(read(path)).get("package", {})
            rows += [[path, k, pkg[k]] for k in ("rust-version", "edition") if k in pkg]
        elif name == "rust-toolchain.toml":
            tc = tomllib.loads(read(path)).get("toolchain", {})
            if "channel" in tc:
                rows.append([path, "Rust toolchain channel", tc["channel"]])
        elif name in (".nvmrc", ".node-version", ".python-version"):
            rows.append([path, name, read(path).strip()])
    return rows


# --- direct dependencies ---------------------------------------------------------------------


def npm_deps(path: str, files: set[str]) -> list[list[str]]:
    pkg = json.loads(read(path))
    lock_path = path.replace("package.json", "package-lock.json")
    lock = json.loads(read(lock_path)).get("packages", {}) if lock_path in files else {}
    rows = []
    for key, scope in (("dependencies", "prod"), ("devDependencies", "dev")):
        for name, spec in sorted(pkg.get(key, {}).items()):
            rows.append([name, lock.get(f"node_modules/{name}", {}).get("version", spec), scope])
    return rows


def norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def python_deps(path: str, files: set[str]) -> list[list[str]]:
    data = tomllib.loads(read(path))
    lock_path = path.replace("pyproject.toml", "uv.lock")
    locked = {}
    if lock_path in files:
        locked = {
            norm(p["name"]): p["version"] for p in tomllib.loads(read(lock_path)).get("package", [])
        }
    groups = [("prod", data.get("project", {}).get("dependencies", []))]
    groups += [
        (f"extra: {k}", v)
        for k, v in data.get("project", {}).get("optional-dependencies", {}).items()
    ]
    groups += [(f"group: {k}", v) for k, v in data.get("dependency-groups", {}).items()]
    rows = []
    for scope, reqs in groups:
        for req in reqs:
            if not isinstance(req, str):
                continue
            m = re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*", req)
            if m:
                rows.append(
                    [m.group(0), locked.get(norm(m.group(0)), req[m.end() :].strip()), scope]
                )
    return sorted(rows, key=lambda r: (r[2] != "prod", r[2], r[0].lower()))


def go_deps(path: str) -> list[list[str]]:
    scope = "dev tool" if "tools/" in path else "prod"
    rows, block = [], False
    for line in read(path).splitlines():
        s = line.strip()
        if s.startswith("require ("):
            block = True
            continue
        if block and s == ")":
            block = False
            continue
        m = (
            re.match(r"(?:require\s+)?(\S+)\s+(v\S+)(.*)$", s)
            if block or s.startswith("require ")
            else None
        )
        if m and "// indirect" not in m.group(3):
            rows.append([m.group(1), m.group(2), scope])
    return sorted(rows)


def cargo_deps(path: str, files: set[str]) -> list[list[str]]:
    data = tomllib.loads(read(path))
    lock_path = path.replace("Cargo.toml", "Cargo.lock")
    locked: dict[str, list[str]] = {}
    if lock_path in files:
        for p in tomllib.loads(read(lock_path)).get("package", []):
            locked.setdefault(p["name"], []).append(p["version"])
    rows = []
    for key, scope in (
        ("dependencies", "prod"),
        ("build-dependencies", "build"),
        ("dev-dependencies", "dev"),
    ):
        for name, spec in sorted(data.get(key, {}).items()):
            crate = spec.get("package", name) if isinstance(spec, dict) else name
            want = spec if isinstance(spec, str) else spec.get("version", "path / git")
            rows.append([name, ", ".join(locked.get(crate, [])) or want, scope])
    return rows


# --- document --------------------------------------------------------------------------------


def render(previous: str, refresh_os: bool) -> str:
    files = tracked()
    fileset = set(files)
    base = lambda p: p.rsplit("/", 1)[-1]

    images: list[dict[str, str]] = []
    for p in files:
        b = base(p).lower()
        if b.startswith("dockerfile") or b.endswith(".dockerfile"):
            images += dockerfile_images(p)
        elif re.search(r"(^|[-.])compose[^/]*\.ya?ml$", b):
            images += compose_images(p)
        elif b.endswith(".sh") or "/scripts/" in f"/{p}" and "." not in b:
            images += script_images(p)

    m = OS_CACHE.search(previous)
    cache: dict[str, str] = json.loads(m.group(1)) if m else {}
    refs = sorted({i["ref"] for i in images if "$" not in i["ref"]})
    if refresh_os:
        for ref in refs:
            print(f"reading the OS of {ref}", file=sys.stderr)
            cache[ref] = image_os(ref)
    cache = {r: cache.get(r, UNKNOWN_OS) for r in refs}

    out = [
        "# Versions",
        "",
        "Generated by `scripts/versions.py` from this repository's tracked files: do not edit by hand",
        "(only the manual block). After any version change (a base image, a runtime, a dependency, a",
        "workflow action) run `python scripts/versions.py`, and add `--refresh-os` when an image",
        "reference changed (needs docker). CI runs `--check` and fails while this file is stale.",
        "",
        "Use it for security triage: find the component, then read where it runs. A *runtime* image",
        "and *prod* dependencies reach production; *build only* images and *dev* dependencies never",
        "leave the build or the developer's machine (a prod npm dependency of a static site runs in the",
        "visitor's browser, not on the server).",
        "",
    ]
    manual = MANUAL.search(previous)
    if manual:
        out += [manual.group(0), ""]

    if images:
        out += ["## Container images", ""]
        rows = []
        for i in sorted(images, key=lambda i: (i["file"], i["where"])):
            name, digest = split_ref(i["ref"])
            os_name = (
                cache.get(i["ref"], "build argument") if "$" not in i["ref"] else "build argument"
            )
            rows.append([i["file"], i["where"], i["role"], f"`{name}`", digest, os_name])
        out += table(
            ["File", "Stage / service", "Role", "Image", "Digest", "OS; runtime in image"], rows
        )

    runtimes, actions = [], set()
    for p in files:
        if p.startswith(".github/workflows/") and p.endswith((".yml", ".yaml")):
            r, a = workflow_facts(p)
            runtimes += r
            actions |= set(a)
    if runtimes:
        out += ["## CI runtimes", ""]
        uniq = sorted({tuple(r) for r in runtimes})
        out += table(["Workflow", "Setting", "Value"], [list(r) for r in uniq])
    if actions:
        out += ["## CI actions and reusable workflows", ""]
        out += table(["Action", "Version"], [[a, v] for a, v in sorted(actions)])

    tc = toolchains(files)
    if tc:
        out += ["## Toolchains", ""] + table(["File", "Setting", "Value"], tc)

    deps: list[tuple[str, str, list[list[str]]]] = []
    for p in files:
        b = base(p)
        if b == "package.json":
            deps.append((p, "npm", npm_deps(p, fileset)))
        elif b == "pyproject.toml":
            deps.append((p, "Python", python_deps(p, fileset)))
        elif b == "go.mod":
            deps.append((p, "Go", go_deps(p)))
        elif b == "Cargo.toml":
            deps.append((p, "Rust", cargo_deps(p, fileset)))
    deps = [d for d in deps if d[2]]
    if deps:
        out += [
            "## Direct dependencies",
            "",
            "Versions are the locked ones where a lockfile exists.",
            "",
        ]
        for p, eco, rows in deps:
            out += [f"### `{p}` ({eco})", ""] + table(["Package", "Version", "Scope"], rows)

    out += [f"<!-- os-cache: {json.dumps(cache, sort_keys=True, ensure_ascii=False)} -->", ""]
    return "\n".join(out)


def main() -> int:
    args = set(sys.argv[1:])
    previous = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    text = render(previous, refresh_os="--refresh-os" in args)
    if "--check" in args:
        if text != previous:
            print(
                "VERSIONS.md is stale: run `python scripts/versions.py` and commit it.",
                file=sys.stderr,
            )
            return 1
        if UNKNOWN_OS in text:
            print(
                "VERSIONS.md has an image without its OS: run `python scripts/versions.py --refresh-os`.",
                file=sys.stderr,
            )
            return 1
        return 0
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
