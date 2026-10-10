"""Unit and benchmark tests for the rebuilt Code Health Engine (v2).

Validates all criteria from .agents/skills/health-scoring/SKILL.md:
- SonarSource Cognitive Complexity measurements
- Scale invariance (1x vs 20x codebase size yields band within ±3 points)
- Rule 13: Function length never penalizes alone
- Resolved local coupling excluding stdlib & self-imports
- Secrets masking and comment/docstring exclusion
- Grade band compliance (strictly A-E, never F)
"""

from __future__ import annotations

import copy
from backend.health.cognitive_complexity import (
    calculate_cognitive_complexity,
    calculate_python_cognitive_complexity,
)
from backend.health.coupling import compute_local_coupling
from backend.health.models import HealthReport
from backend.health.scoring import calculate_grade
from backend.health.secrets import mask_secret, scan_for_secrets
from backend.health.service import compute_health_report
from backend.parser.models import FunctionInfo, ImportInfo, ParsedFile


def test_sonar_cognitive_complexity_flat_vs_nested() -> None:
    # Flat function: 10 sequential if statements with no nesting -> 10 complexity
    flat_code = """
def flat_fn(x):
    if x == 1: return 1
    if x == 2: return 2
    if x == 3: return 3
    if x == 4: return 4
    if x == 5: return 5
    return 0
"""
    flat_score = calculate_python_cognitive_complexity(flat_code)
    assert flat_score == 5

    # Nested function: 3 nested if statements -> 1 + (1+1) + (1+2) = 6 complexity
    nested_code = """
def nested_fn(a, b, c):
    if a:
        if b:
            if c:
                return 42
    return 0
"""
    nested_score = calculate_python_cognitive_complexity(nested_code)
    # 1 for outer if, 2 for second if, 3 for third if = 6
    assert nested_score == 6


def test_rule_13_flat_long_function_incurs_zero_deduction() -> None:
    """A long function (100 lines) with flat structure (complexity <= 15) receives NO penalty."""
    flat_long_lines = ["def big_mapping():", "    return {"]
    for i in range(95):
        flat_long_lines.append(f"        '{i}': {i},")
    flat_long_lines.append("    }")
    source = "\n".join(flat_long_lines)

    fn = FunctionInfo(
        name="big_mapping",
        args=[],
        return_type=None,
        decorators=[],
        start_line=1,
        end_line=100,
        docstring="Docstring present",
        source_code=source,
        calls=[],
    )
    pf = ParsedFile(file_path="src/router.py", language="Python", functions=[fn])

    report = compute_health_report({"src/router.py": pf})
    comp_dim = next(d for d in report.dimensions if d.key == "complexity")
    # Complexity penalties must be 0 because cognitive complexity is 0
    assert len(comp_dim.penalties) == 0
    assert comp_dim.score == 20.0


def test_scale_invariance_1x_vs_20x_replicated_repository() -> None:
    """A repository duplicated 20 times must give the same score band within ±3 points."""
    # 1x Repo with 5 functions: 4 good, 1 complex
    f_good_1 = FunctionInfo(name="g1", args=[], return_type=None, decorators=[], start_line=1, end_line=15, docstring="ok", source_code="def g1(): return 1", calls=[])
    f_good_2 = FunctionInfo(name="g2", args=[], return_type=None, decorators=[], start_line=1, end_line=15, docstring="ok", source_code="def g2(): return 2", calls=[])
    f_good_3 = FunctionInfo(name="g3", args=[], return_type=None, decorators=[], start_line=1, end_line=15, docstring="ok", source_code="def g3(): return 3", calls=[])
    f_good_4 = FunctionInfo(name="g4", args=[], return_type=None, decorators=[], start_line=1, end_line=15, docstring="ok", source_code="def g4(): return 4", calls=[])

    # 1 deeply complex function
    complex_src = """
def complex_fn(a, b, c, d):
    if a:
        if b:
            if c:
                if d:
                    for i in range(10):
                        while True:
                            break
    return 0
"""
    f_bad = FunctionInfo(name="bad", args=[], return_type=None, decorators=[], start_line=1, end_line=25, docstring="ok", source_code=complex_src, calls=[])

    repo_1x = {
        "src/mod_a.py": ParsedFile(file_path="src/mod_a.py", language="Python", functions=[f_good_1, f_good_2]),
        "src/mod_b.py": ParsedFile(file_path="src/mod_b.py", language="Python", functions=[f_good_3, f_good_4, f_bad]),
    }
    report_1x = compute_health_report(repo_1x)

    # 20x replicated repo
    repo_20x: dict[str, ParsedFile] = {}
    for i in range(20):
        repo_20x[f"src/mod_a_{i}.py"] = ParsedFile(file_path=f"src/mod_a_{i}.py", language="Python", functions=[copy.deepcopy(f_good_1), copy.deepcopy(f_good_2)])
        repo_20x[f"src/mod_b_{i}.py"] = ParsedFile(file_path=f"src/mod_b_{i}.py", language="Python", functions=[copy.deepcopy(f_good_3), copy.deepcopy(f_good_4), copy.deepcopy(f_bad)])

    report_20x = compute_health_report(repo_20x)

    score_diff = abs(report_1x.total_score - report_20x.total_score)
    assert score_diff <= 3.0, f"Score difference was {score_diff}, exceeding ±3 scale invariance limit"
    assert report_1x.grade == report_20x.grade


def test_coupling_excludes_stdlib_and_self_imports() -> None:
    """Coupling ignores standard library modules and files importing themselves."""
    imports = [
        ImportInfo(module="sys"),
        ImportInfo(module="os.path"),
        ImportInfo(module="logging"),
        ImportInfo(module="src.service"),  # local import to itself!
        ImportInfo(module="src.helper"),   # genuine other local import
    ]
    files = {
        "src/service.py": ParsedFile(file_path="src/service.py", language="Python", imports=imports),
        "src/helper.py": ParsedFile(file_path="src/helper.py", language="Python", imports=[]),
    }

    coupling = compute_local_coupling(files)
    service_fan_out = coupling["src/service.py"]["fan_out"]
    # Only src/helper.py should be counted: sys, os, logging (stdlib) and src/service.py (self) excluded!
    assert service_fan_out == 1
    assert coupling["src/service.py"]["outward_dependencies"] == ["src/helper.py"]


def test_secrets_masking_and_comment_exclusion() -> None:
    # Comments should be ignored
    comment_func = FunctionInfo(
        name="demo",
        args=[],
        return_type=None,
        decorators=[],
        start_line=1,
        end_line=5,
        docstring="",
        source_code="# token = 'sk-1234567890abcdef12345678'\npass",
        calls=[],
    )
    pf_clean = ParsedFile(file_path="src/config.py", language="Python", functions=[comment_func])
    secrets = scan_for_secrets({"src/config.py": pf_clean})
    assert len(secrets) == 0

    # Real secret is masked
    real_secret_func = FunctionInfo(
        name="auth",
        args=[],
        return_type=None,
        decorators=[],
        start_line=1,
        end_line=5,
        docstring="",
        source_code="api_key = 'sk-1234567890abcdef12345678'",
        calls=[],
    )
    pf_leaked = ParsedFile(file_path="src/auth.py", language="Python", functions=[real_secret_func])
    leaked_secrets = scan_for_secrets({"src/auth.py": pf_leaked})
    assert len(leaked_secrets) == 1
    assert leaked_secrets[0]["masked_value"].endswith("****")
    assert "sk-" in leaked_secrets[0]["masked_value"]


def test_grade_band_never_returns_grade_f() -> None:
    """Rule 27: Bands are strictly A to E. Never show Grade F."""
    for score in [0.0, 15.5, 45.0, 59.9]:
        grade = calculate_grade(score)
        assert grade == "E"
        assert grade != "F"
