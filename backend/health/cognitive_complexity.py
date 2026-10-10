"""SonarSource Cognitive Complexity calculator.

Implements the official SonarSource Cognitive Complexity metric:
- Increments for breaks in linear flow (if, loops, exceptions, match/case, ternary).
- Increments for nesting level (nested structures penalize more heavily).
- Increments for binary logical operator sequences (and/or sequences).
- Zero increments for declarative statements, flat dicts/mappings, and method wrappers.
"""

from __future__ import annotations

import ast
import re
from typing import Any


class _PythonCognitiveVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.complexity: int = 0
        self.nesting_level: int = 0

    def _add_increment(self) -> None:
        """Add structural break (1) + nesting penalty (nesting_level)."""
        self.complexity += 1 + self.nesting_level

    def visit_If(self, node: ast.If) -> None:
        self._add_increment()
        self._count_bool_ops(node.test)
        self.nesting_level += 1
        for stmt in node.body:
            self.visit(stmt)
        self.nesting_level -= 1

        # Check else/elif: in AST, elif is an If node in orelse
        if node.orelse:
            if len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If):
                # Elif: structural increment only, no nesting increment
                self.complexity += 1
                self._count_bool_ops(node.orelse[0].test)
                self.nesting_level += 1
                for stmt in node.orelse[0].body:
                    self.visit(stmt)
                self.nesting_level -= 1
                # Recursively handle further elifs/elses
                if node.orelse[0].orelse:
                    self._handle_orelse(node.orelse[0].orelse)
            else:
                self._handle_orelse(node.orelse)

    def _handle_orelse(self, orelse: list[ast.stmt]) -> None:
        self.nesting_level += 1
        for stmt in orelse:
            self.visit(stmt)
        self.nesting_level -= 1

    def visit_IfExp(self, node: ast.IfExp) -> None:
        """Ternary expression (x if cond else y)."""
        self._add_increment()
        self._count_bool_ops(node.test)
        self.nesting_level += 1
        self.visit(node.body)
        self.visit(node.orelse)
        self.nesting_level -= 1

    def visit_For(self, node: ast.For) -> None:
        self._add_increment()
        self.nesting_level += 1
        for stmt in node.body:
            self.visit(stmt)
        for stmt in node.orelse:
            self.visit(stmt)
        self.nesting_level -= 1

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self._add_increment()
        self.nesting_level += 1
        for stmt in node.body:
            self.visit(stmt)
        for stmt in node.orelse:
            self.visit(stmt)
        self.nesting_level -= 1

    def visit_While(self, node: ast.While) -> None:
        self._add_increment()
        self._count_bool_ops(node.test)
        self.nesting_level += 1
        for stmt in node.body:
            self.visit(stmt)
        for stmt in node.orelse:
            self.visit(stmt)
        self.nesting_level -= 1

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        self._add_increment()
        self.nesting_level += 1
        for stmt in node.body:
            self.visit(stmt)
        self.nesting_level -= 1

    def visit_Match(self, node: Any) -> None:
        """Python 3.10+ match statement."""
        self._add_increment()
        self.nesting_level += 1
        for case in getattr(node, "cases", []):
            self.visit(case)
        self.nesting_level -= 1

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        # Nested functions increase nesting for their body
        old_nesting = self.nesting_level
        self.nesting_level += 1
        for stmt in node.body:
            self.visit(stmt)
        self.nesting_level = old_nesting

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        old_nesting = self.nesting_level
        self.nesting_level += 1
        for stmt in node.body:
            self.visit(stmt)
        self.nesting_level = old_nesting

    def visit_Lambda(self, node: ast.Lambda) -> None:
        old_nesting = self.nesting_level
        self.nesting_level += 1
        self.visit(node.body)
        self.nesting_level = old_nesting

    def _count_bool_ops(self, node: ast.AST) -> None:
        """Count sequences of boolean operators (and / or)."""
        if isinstance(node, ast.BoolOp):
            # A sequence like a and b and c gets 1 increment
            self.complexity += 1
            for val in node.values:
                self._count_bool_ops(val)


def calculate_python_cognitive_complexity(source_code: str) -> int:
    """Calculate SonarSource Cognitive Complexity for a Python code block or function."""
    if not source_code or not source_code.strip():
        return 0

    try:
        # Handle indented function bodies by dedenting if necessary
        import textwrap

        dedented = textwrap.dedent(source_code)
        tree = ast.parse(dedented)
    except SyntaxError:
        return _fallback_regex_cognitive_complexity(source_code)

    visitor = _PythonCognitiveVisitor()

    # If the root is a function, visit its body directly to avoid treating the function definition itself as nested
    if len(tree.body) == 1 and isinstance(tree.body[0], (ast.FunctionDef, ast.AsyncFunctionDef)):
        for stmt in tree.body[0].body:
            visitor.visit(stmt)
    else:
        for stmt in tree.body:
            visitor.visit(stmt)

    return visitor.complexity


def _fallback_regex_cognitive_complexity(source_code: str) -> int:
    """Estimates cognitive complexity for non-Python or unparseable code using indentation & tokens."""
    if not source_code:
        return 0

    score = 0
    nesting = 0
    lines = source_code.splitlines()

    control_keywords = re.compile(r"\b(if|else if|elif|for|while|catch|switch|case)\b|\?|&&|\|\|")

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith(("//", "#", "/*", "*")):
            continue

        # Approximate nesting via indent / braces
        open_braces = stripped.count("{")
        close_braces = stripped.count("}")

        matches = control_keywords.findall(stripped)
        for m in matches:
            if m in ("&&", "||"):
                score += 1
            else:
                score += 1 + max(0, nesting)

        nesting = max(0, nesting + open_braces - close_braces)

    return score


def calculate_cognitive_complexity(source_code: str, language: str = "Python") -> int:
    """Calculate SonarSource Cognitive Complexity for a function across supported languages."""
    if language.lower() in ("python", "py"):
        return calculate_python_cognitive_complexity(source_code)
    return _fallback_regex_cognitive_complexity(source_code)
