#!/usr/bin/env python3
"""
verify-plan.py — Conductor workflow step 8.

Extracts runnable verification commands from a plan file's `## Verification`
section, runs each one, and moves the plan to `.opencode/plans/completed/`
on full success.

Usage:
    python scripts/verify-plan.py <plan-file>

Behavior:
  - Parses `## Verification` section in the plan markdown.
  - Each verification line MUST be a runnable command inside backticks:
      - [ ] task: `python -c "1+1"`
  - Runs each command sequentially. Stops on first failure.
  - On all-pass: prints "VERIFIED" and moves plan to .opencode/plans/completed/.
  - On any failure: prints the failing command + stderr and exits non-zero.
  - Does NOT trust subagent reports. Re-runs every command.

Exit codes:
  0  - all verifications passed, plan archived (or already archived)
  1  - plan file not found or unreadable
  2  - no `## Verification` section found
  3  - no runnable commands found in `## Verification`
  4  - one or more commands failed (output printed)
  5  - file already in completed/ (informational, exit 0 would be better)
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path


BACKTICK_RE = re.compile(r"`([^`]+)`")
SECTION_RE = re.compile(
    r"^##\s+Verification\s*$\n(.*?)(?=^##\s+|\Z)",
    re.MULTILINE | re.DOTALL | re.IGNORECASE,
)


def find_verification_section(plan_text: str) -> str | None:
    """Return the body of the `## Verification` section, or None if missing."""
    match = SECTION_RE.search(plan_text)
    return match.group(1).strip() if match else None


def extract_commands(section_body: str) -> list[str]:
    """
    Extract runnable commands from verification lines.

    A verification line looks like:
        - [ ] task description: `command here`
    or
        - [x] task description: `command here`

    We capture any backtick-delimited string on a verification line. The
    last backtick group on a line is treated as the command (this lets
    checklists mention prior commands for context).
    """
    commands: list[str] = []
    for line in section_body.splitlines():
        # Only consider checkbox lines (task items)
        stripped = line.lstrip()
        if not (stripped.startswith("- [") and "]" in stripped[:5]):
            continue
        # Find ALL backtick groups on the line; take the LAST one as the command
        groups = BACKTICK_RE.findall(line)
        if groups:
            cmd = groups[-1].strip()
            if cmd:
                commands.append(cmd)
    return commands


def run_command(cmd: str, cwd: Path) -> tuple[int, str, str]:
    """Run a single verification command. Returns (exit_code, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute cap per command
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"TIMEOUT after 600s: {cmd}"
    except Exception as exc:  # noqa: BLE001
        return 1, "", f"FAILED to launch: {exc!r}"


def move_to_completed(plan_path: Path, completed_dir: Path) -> Path:
    """Move a verified plan to the completed directory. Returns new path."""
    completed_dir.mkdir(parents=True, exist_ok=True)
    target = completed_dir / plan_path.name
    # Avoid overwriting: if target exists, append a numeric suffix
    if target.exists():
        stem = plan_path.stem
        suffix = plan_path.suffix
        i = 2
        while True:
            candidate = completed_dir / f"{stem}-{i}{suffix}"
            if not candidate.exists():
                target = candidate
                break
            i += 1
    shutil.move(str(plan_path), str(target))
    return target


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/verify-plan.py <plan-file>", file=sys.stderr)
        return 1

    plan_arg = Path(sys.argv[1])
    if not plan_arg.is_absolute():
        # Resolve relative to repo root (script lives in <repo>/scripts/)
        repo_root = Path(__file__).resolve().parent.parent
        plan_path = (repo_root / plan_arg).resolve()
    else:
        plan_path = plan_arg

    if not plan_path.exists():
        print(f"ERROR: plan file not found: {plan_path}", file=sys.stderr)
        return 1

    repo_root = plan_path.parent
    while repo_root != repo_root.parent:
        if (repo_root / ".git").exists() or (repo_root / ".opencode").exists():
            break
        repo_root = repo_root.parent

    completed_dir = repo_root / ".opencode" / "plans" / "completed"

    # Idempotent: if already in completed/, report and exit 0
    try:
        if plan_path.resolve() == (completed_dir / plan_path.name).resolve() or completed_dir in plan_path.resolve().parents:
            print(f"ALREADY ARCHIVED: {plan_path}")
            return 0
    except (OSError, ValueError):
        pass

    plan_text = plan_path.read_text(encoding="utf-8")
    section = find_verification_section(plan_text)
    if section is None:
        print(f"ERROR: no `## Verification` section in {plan_path.name}", file=sys.stderr)
        return 2

    commands = extract_commands(section)
    if not commands:
        print(
            f"ERROR: no runnable commands found in `## Verification` of {plan_path.name}",
            file=sys.stderr,
        )
        print("Each line must be a checkbox with a backtick command, e.g.:", file=sys.stderr)
        print("  - [ ] task: `python -c \"1+1\"`", file=sys.stderr)
        return 3

    print(f"Verifying {plan_path.name}: {len(commands)} command(s)")
    print("=" * 70)

    failures: list[tuple[str, int, str]] = []
    for idx, cmd in enumerate(commands, start=1):
        print(f"\n[{idx}/{len(commands)}] $ {cmd}")
        code, stdout, stderr = run_command(cmd, cwd=repo_root)
        if stdout.strip():
            print(stdout.rstrip())
        if code != 0:
            print(f"FAIL (exit {code})", file=sys.stderr)
            if stderr.strip():
                print(stderr.rstrip(), file=sys.stderr)
            failures.append((cmd, code, stderr))

    print("\n" + "=" * 70)
    if failures:
        print(f"FAILED: {len(failures)} of {len(commands)} command(s) failed", file=sys.stderr)
        for cmd, code, _ in failures:
            print(f"  - exit {code}: {cmd}", file=sys.stderr)
        print(f"\nPlan NOT archived. Fix the failures and re-run.", file=sys.stderr)
        return 4

    # All passed — archive the plan
    target = move_to_completed(plan_path, completed_dir)
    print(f"VERIFIED: {len(commands)} command(s) passed")
    print(f"Archived: {plan_path.name} -> {target.relative_to(repo_root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
