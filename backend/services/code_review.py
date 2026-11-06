"""Automated Code Review Engine.

Analyzes Git diffs, pull request patches, or file changes by combining
deterministic static analysis with grounded LLM evaluation.
Detects security concerns, bug candidates, performance bottlenecks,
code quality anti-patterns, and missing test coverage.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.llm.service import LLMService

logger = logging.getLogger(__name__)


@dataclass
class ReviewFinding:
    """A single actionable code review finding."""

    file_path: str
    line_start: int
    line_end: int
    severity: str  # "critical", "high", "medium", "low"
    category: str  # "security", "bug", "performance", "code_quality", "missing_test", "suggestion"
    title: str
    explanation: str
    evidence: str
    suggested_fix: str
    confidence: float = 0.95
    source: str = "static_analyzer"  # "static_analyzer" | "llm_reviewer"


@dataclass
class DiffHunk:
    """Parsed section of a Git unified diff."""

    file_path: str
    old_start: int
    old_length: int
    new_start: int
    new_length: int
    added_lines: list[tuple[int, str]] = field(default_factory=list)  # (line_number, content)
    deleted_lines: list[str] = field(default_factory=list)
    raw_hunk: str = ""


@dataclass
class CodeReviewReport:
    """Complete results from an automated code review."""

    files_reviewed: list[str]
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    findings: list[ReviewFinding]
    summary: str
    deterministic_mode: bool = False


# Deterministic Static Security & Quality Patterns
_STATIC_CHECKS: list[dict[str, Any]] = [
    {
        "category": "security",
        "severity": "critical",
        "title": "Potential SQL Injection",
        "pattern": re.compile(
            r"""(?:(?:execute|raw|select)\s*\(\s*f["'].*?\{[a-zA-Z0-9_]+\}|f["']\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b.*?\{[a-zA-Z0-9_]+\})""",
            re.IGNORECASE,
        ),
        "explanation": "Direct f-string variable interpolation inside SQL execution can allow SQL injection attacks.",
        "suggested_fix": "Use parameterized queries or bound parameters instead of f-strings.",
    },
    {
        "category": "security",
        "severity": "critical",
        "title": "Dangerous Shell Subprocess Execution",
        "pattern": re.compile(
            r"""(?:subprocess\.(?:Popen|call|run)|os\.system)\s*\([^)]*shell\s*=\s*True""", re.IGNORECASE
        ),
        "explanation": "Invoking subprocess with shell=True and dynamic arguments can lead to command injection.",
        "suggested_fix": "Set shell=False and pass arguments as a validated list of tokens.",
    },
    {
        "category": "security",
        "severity": "high",
        "title": "Use of Weak Hash Function (MD5/SHA1)",
        "pattern": re.compile(r"""hashlib\.(?:md5|sha1)\s*\(""", re.IGNORECASE),
        "explanation": "MD5 and SHA-1 are cryptographically broken and vulnerable to collision attacks.",
        "suggested_fix": "Upgrade to SHA-256 (hashlib.sha256()) or Argon2 for passwords.",
    },
    {
        "category": "security",
        "severity": "high",
        "title": "Hardcoded Secret or API Key Pattern",
        "pattern": re.compile(
            r"""(?:api[_-]?key|secret|password|token)\s*=\s*["'][a-zA-Z0-9_\-\.]{16,}["']""", re.IGNORECASE
        ),
        "explanation": "Hardcoded credentials in source code can be leaked through version control.",
        "suggested_fix": "Extract credentials into environment variables or secret management.",
    },
    {
        "category": "performance",
        "severity": "high",
        "title": "Blocking Sleep in Asynchronous Code",
        "pattern": re.compile(r"""time\.sleep\s*\(""", re.IGNORECASE),
        "explanation": "Calling synchronous time.sleep() blocks the entire asyncio event loop thread.",
        "suggested_fix": "Use await asyncio.sleep(...) in async functions.",
    },
    {
        "category": "code_quality",
        "severity": "medium",
        "title": "Bare Except Clause",
        "pattern": re.compile(r"""^[ \t]*except\s*:""", re.MULTILINE),
        "explanation": "A bare except: clause catches SystemExit and KeyboardInterrupt, preventing graceful termination.",
        "suggested_fix": "Catch specific exception types, e.g. except Exception:.",
    },
    {
        "category": "code_quality",
        "severity": "low",
        "title": "Leftover Debug Console / Print Statement",
        "pattern": re.compile(r"""^[ \t]*(?:console\.log|print)\s*\(["'][^"']+["']\s*\)""", re.MULTILINE),
        "explanation": "Direct console logging or print statements should be replaced with structured logger calls.",
        "suggested_fix": "Use logger.debug() or logger.info() instead of raw print/console statements.",
    },
]


class CodeReviewService:
    """Performs deterministic and LLM-assisted code reviews on diffs or changes."""

    @staticmethod
    def parse_git_diff(diff_text: str) -> list[DiffHunk]:
        """Parse unified git diff text into structured hunks with line numbers."""
        hunks: list[DiffHunk] = []
        current_file = ""
        lines = diff_text.splitlines()
        i = 0

        while i < len(lines):
            line = lines[i]
            if line.startswith("diff --git"):
                parts = line.split()
                if len(parts) >= 4:
                    current_file = parts[3].lstrip("b/").lstrip("a/")
                i += 1
                continue

            if line.startswith("+++ b/"):
                current_file = line[6:].strip()
                i += 1
                continue

            if line.startswith("@@"):
                # Header: @@ -old_start,old_len +new_start,new_len @@
                match = re.search(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
                if match and current_file:
                    old_start = int(match.group(1))
                    old_len = int(match.group(2) or 1)
                    new_start = int(match.group(3))
                    new_len = int(match.group(4) or 1)

                    hunk = DiffHunk(
                        file_path=current_file,
                        old_start=old_start,
                        old_length=old_len,
                        new_start=new_start,
                        new_length=new_len,
                        raw_hunk=line,
                    )

                    curr_new_line = new_start
                    i += 1
                    while i < len(lines) and not lines[i].startswith("@@") and not lines[i].startswith("diff --git"):
                        hunk_line = lines[i]
                        if hunk_line.startswith("+") and not hunk_line.startswith("+++"):
                            hunk.added_lines.append((curr_new_line, hunk_line[1:]))
                            curr_new_line += 1
                        elif hunk_line.startswith("-") and not hunk_line.startswith("---"):
                            hunk.deleted_lines.append(hunk_line[1:])
                        else:
                            curr_new_line += 1
                        i += 1
                    hunks.append(hunk)
                    continue
            i += 1
        return hunks

    async def run_review(
        self,
        diff_text: str,
        repo_path: str | None = None,
        use_llm: bool = False,
        llm_service: LLMService | None = None,
    ) -> CodeReviewReport:
        """Run automated code review on git diff."""
        hunks = self.parse_git_diff(diff_text)
        files_reviewed = sorted({h.file_path for h in hunks})

        findings: list[ReviewFinding] = []

        # 1. Deterministic Static Analysis on added lines
        for hunk in hunks:
            for line_no, content in hunk.added_lines:
                for check in _STATIC_CHECKS:
                    if check["pattern"].search(content):
                        findings.append(
                            ReviewFinding(
                                file_path=hunk.file_path,
                                line_start=line_no,
                                line_end=line_no,
                                severity=check["severity"],
                                category=check["category"],
                                title=check["title"],
                                explanation=check["explanation"],
                                evidence=content.strip(),
                                suggested_fix=check["suggested_fix"],
                                confidence=0.98,
                                source="static_analyzer",
                            )
                        )

        # 2. Test Coverage Gap Check: if source files are modified but no test files were touched
        has_tests = any("test" in f.lower() or "spec" in f.lower() for f in files_reviewed)
        source_files = [f for f in files_reviewed if not ("test" in f.lower() or "spec" in f.lower())]
        if source_files and not has_tests:
            for sf in source_files[:3]:
                findings.append(
                    ReviewFinding(
                        file_path=sf,
                        line_start=1,
                        line_end=1,
                        severity="medium",
                        category="missing_test",
                        title="Modified Source File Without Accompanying Tests",
                        explanation=f"Changes were made to `{sf}` without corresponding modifications or additions to test suites.",
                        evidence=f"Diff modifies {sf} but touches 0 test files.",
                        suggested_fix=f"Add unit tests for `{sf}` covering new functionality or bug fixes.",
                        confidence=0.90,
                        source="static_analyzer",
                    )
                )

        # 3. LLM Review (if enabled and provider available)
        if use_llm and llm_service is not None and hunks:
            try:
                llm_findings = await self._run_llm_review(diff_text, files_reviewed, llm_service)
                findings.extend(llm_findings)
            except Exception as exc:
                logger.warning("LLM code review evaluation skipped due to provider error: %s", exc)

        # Sort findings by severity
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        findings.sort(key=lambda f: severity_order.get(f.severity.lower(), 4))

        crit = sum(1 for f in findings if f.severity.lower() == "critical")
        high = sum(1 for f in findings if f.severity.lower() == "high")
        med = sum(1 for f in findings if f.severity.lower() == "medium")
        low = sum(1 for f in findings if f.severity.lower() == "low")

        summary = (
            f"Reviewed {len(files_reviewed)} changed files. Found {len(findings)} issues: "
            f"{crit} critical, {high} high, {med} medium, {low} low."
        )

        return CodeReviewReport(
            files_reviewed=files_reviewed,
            total_findings=len(findings),
            critical_count=crit,
            high_count=high,
            medium_count=med,
            low_count=low,
            findings=findings,
            summary=summary,
            deterministic_mode=not use_llm,
        )

    async def _run_llm_review(
        self,
        diff_text: str,
        files_reviewed: list[str],
        llm_service: LLMService,
    ) -> list[ReviewFinding]:
        """Query LLM to evaluate complex logic, race conditions, edge cases, and API compatibility."""
        import json

        # Truncate diff to fit LLM context budget safely
        truncated_diff = diff_text[:12000] if len(diff_text) > 12000 else diff_text

        prompt = (
            "You are a strict code review engine. Analyze the following Git diff and identify potential "
            "logic bugs, edge cases, concurrency hazards, and API regressions.\n"
            "Only report genuine, high-confidence issues. Do NOT report minor stylistic preferences.\n"
            "Respond ONLY with a valid JSON array of findings with this exact schema:\n"
            "[\n"
            "  {\n"
            '    "file_path": "path/to/file.py",\n'
            '    "line_start": 42,\n'
            '    "line_end": 45,\n'
            '    "severity": "high",\n'
            '    "category": "bug",\n'
            '    "title": "Short title",\n'
            '    "explanation": "Clear explanation of the hazard",\n'
            '    "evidence": "Exact code snippet",\n'
            '    "suggested_fix": "Concrete fix code or recommendation",\n'
            '    "confidence": 0.85\n'
            "  }\n"
            "]\n\n"
            f"Git Diff:\n```diff\n{truncated_diff}\n```"
        )

        try:
            raw_resp = await llm_service.manager.generate(prompt)
            # Extract JSON block
            json_match = re.search(r"\[\s*\{.*?\}\s*\]", raw_resp, re.DOTALL)
            if not json_match:
                return []

            data = json.loads(json_match.group(0))
            results: list[ReviewFinding] = []
            for item in data:
                fpath = item.get("file_path", "")
                if any(f.endswith(fpath) or fpath.endswith(f) for f in files_reviewed):
                    results.append(
                        ReviewFinding(
                            file_path=fpath,
                            line_start=int(item.get("line_start", 1)),
                            line_end=int(item.get("line_end", 1)),
                            severity=item.get("severity", "medium").lower(),
                            category=item.get("category", "bug").lower(),
                            title=item.get("title", "Review Finding"),
                            explanation=item.get("explanation", ""),
                            evidence=item.get("evidence", ""),
                            suggested_fix=item.get("suggested_fix", ""),
                            confidence=float(item.get("confidence", 0.8)),
                            source="llm_reviewer",
                        )
                    )
            return results
        except Exception as exc:
            logger.debug("Failed parsing LLM code review JSON: %s", exc)
            return []


# Singleton
_code_review_service: CodeReviewService | None = None


def get_code_review_service() -> CodeReviewService:
    """Return singleton CodeReviewService instance."""
    global _code_review_service  # noqa: PLW0603
    if _code_review_service is None:
        _code_review_service = CodeReviewService()
    return _code_review_service
