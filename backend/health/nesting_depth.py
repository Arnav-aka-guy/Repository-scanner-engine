"""Nesting depth metrics for functions and modules."""

from __future__ import annotations

import ast
import textwrap


class _NestingDepthVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.max_depth: int = 0
        self.current_depth: int = 0

    def _visit_block(self, node: ast.AST) -> None:
        self.current_depth += 1
        if self.current_depth > self.max_depth:
            self.max_depth = self.current_depth
        self.generic_visit(node)
        self.current_depth -= 1

    def visit_If(self, node: ast.If) -> None:
        self._visit_block(node)

    def visit_For(self, node: ast.For) -> None:
        self._visit_block(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self._visit_block(node)

    def visit_While(self, node: ast.While) -> None:
        self._visit_block(node)

    def visit_With(self, node: ast.With) -> None:
        self._visit_block(node)

    def visit_AsyncWith(self, node: ast.AsyncWith) -> None:
        self._visit_block(node)

    def visit_Try(self, node: ast.Try) -> None:
        self._visit_block(node)


def calculate_nesting_depth(source_code: str) -> int:
    """Calculate maximum logical nesting depth in a function or code block."""
    if not source_code or not source_code.strip():
        return 0

    try:
        dedented = textwrap.dedent(source_code)
        tree = ast.parse(dedented)
        visitor = _NestingDepthVisitor()
        visitor.visit(tree)
        return visitor.max_depth
    except SyntaxError:
        # Fallback to indentation counting (4 spaces or tabs)
        lines = source_code.splitlines()
        max_indent = 0
        base_indent = None
        for line in lines:
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip(" "))
            if base_indent is None:
                base_indent = indent
            rel_indent = max(0, indent - base_indent) // 4
            if rel_indent > max_indent:
                max_indent = rel_indent
        return max_indent
