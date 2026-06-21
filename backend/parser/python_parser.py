"""Python source parser using the ``ast`` module."""

from __future__ import annotations

import ast
import textwrap
from pathlib import Path

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)


class PythonParser:
    """Parse a single Python file and extract structural information."""

    # ── Public API ──────────────────────────────────────────────────────

    def parse_file(self, file_path: str) -> ParsedFile:
        """Read *file_path*, parse it with ``ast``, and return a `ParsedFile`."""
        try:
            source = Path(file_path).read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(source, filename=file_path)
        except (SyntaxError, OSError, ValueError):
            return ParsedFile(file_path=file_path)

        return ParsedFile(
            file_path=file_path,
            language="Python",
            imports=self._extract_imports(tree),
            functions=self._extract_functions(tree, source),
            classes=self._extract_classes(tree, source),
            module_docstring=self._get_docstring(tree),
        )

    # ── Import extraction ───────────────────────────────────────────────

    @staticmethod
    def _extract_imports(tree: ast.Module) -> list[ImportInfo]:
        imports: list[ImportInfo] = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(
                        ImportInfo(
                            module=alias.name,
                            names=[alias.name.split(".")[-1]],
                            is_from_import=False,
                            alias=alias.asname,
                        )
                    )
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                names = [a.name for a in (node.names or [])]
                # Use the first alias if there is exactly one imported name
                alias = (
                    node.names[0].asname
                    if node.names and len(node.names) == 1
                    else None
                )
                imports.append(
                    ImportInfo(
                        module=module,
                        names=names,
                        is_from_import=True,
                        alias=alias,
                    )
                )
        return imports

    # ── Function extraction ─────────────────────────────────────────────

    def _extract_functions(
        self,
        tree: ast.Module,
        source: str,
    ) -> list[FunctionInfo]:
        functions: list[FunctionInfo] = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                functions.append(self._build_function_info(node, source))
        return functions

    def _build_function_info(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        source: str,
    ) -> FunctionInfo:
        args = [
            arg.arg
            for arg in node.args.args
            if arg.arg != "self" and arg.arg != "cls"
        ]

        return_type: str | None = None
        if node.returns:
            try:
                return_type = ast.unparse(node.returns)
            except Exception:
                return_type = None

        decorators = self._extract_decorator_names(node.decorator_list)
        calls = self._extract_calls(node)

        return FunctionInfo(
            name=node.name,
            args=args,
            return_type=return_type,
            decorators=decorators,
            docstring=self._get_docstring(node),
            source_code=self._get_source_segment(source, node),
            start_line=node.lineno,
            end_line=node.end_lineno or node.lineno,
            calls=calls,
        )

    # ── Class extraction ────────────────────────────────────────────────

    def _extract_classes(
        self,
        tree: ast.Module,
        source: str,
    ) -> list[ClassInfo]:
        classes: list[ClassInfo] = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                classes.append(self._build_class_info(node, source))
        return classes

    def _build_class_info(
        self,
        node: ast.ClassDef,
        source: str,
    ) -> ClassInfo:
        bases: list[str] = []
        for base in node.bases:
            try:
                bases.append(ast.unparse(base))
            except Exception:
                pass

        decorators = self._extract_decorator_names(node.decorator_list)

        methods: list[FunctionInfo] = []
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                methods.append(self._build_function_info(item, source))

        attributes = self._extract_class_attributes(node)

        return ClassInfo(
            name=node.name,
            bases=bases,
            decorators=decorators,
            docstring=self._get_docstring(node),
            source_code=self._get_source_segment(source, node),
            methods=methods,
            attributes=attributes,
            start_line=node.lineno,
            end_line=node.end_lineno or node.lineno,
        )

    @staticmethod
    def _extract_class_attributes(node: ast.ClassDef) -> list[str]:
        """Extract attribute names from class-level and ``__init__`` assignments."""
        attrs: set[str] = set()
        for item in node.body:
            # Class-level assignments: ``x = ...`` or ``x: int = ...``
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        attrs.add(target.id)
            elif isinstance(item, ast.AnnAssign) and isinstance(
                item.target, ast.Name
            ):
                attrs.add(item.target.id)

            # __init__ body: ``self.x = ...``
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if item.name == "__init__":
                    for stmt in ast.walk(item):
                        if isinstance(stmt, ast.Assign):
                            for target in stmt.targets:
                                if (
                                    isinstance(target, ast.Attribute)
                                    and isinstance(target.value, ast.Name)
                                    and target.value.id == "self"
                                ):
                                    attrs.add(target.attr)
                        elif isinstance(stmt, ast.AnnAssign):
                            t = stmt.target
                            if (
                                isinstance(t, ast.Attribute)
                                and isinstance(t.value, ast.Name)
                                and t.value.id == "self"
                            ):
                                attrs.add(t.attr)
        return sorted(attrs)

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _extract_decorator_names(
        decorator_list: list[ast.expr],
    ) -> list[str]:
        names: list[str] = []
        for dec in decorator_list:
            try:
                names.append(ast.unparse(dec))
            except Exception:
                pass
        return names

    @staticmethod
    def _extract_calls(node: ast.AST) -> list[str]:
        """Walk *node* and collect the names of all Call targets."""
        calls: list[str] = []
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                func = child.func
                if isinstance(func, ast.Name):
                    calls.append(func.id)
                elif isinstance(func, ast.Attribute):
                    calls.append(func.attr)
        return sorted(set(calls))

    @staticmethod
    def _get_source_segment(source: str, node: ast.AST) -> str:
        """Return the source text corresponding to *node*."""
        try:
            segment = ast.get_source_segment(source, node)
            if segment is not None:
                return segment
        except Exception:
            pass
        # Fallback: slice by line numbers
        try:
            lines = source.splitlines()
            start = (node.lineno or 1) - 1
            end = node.end_lineno or node.lineno or 1
            return "\n".join(lines[start:end])
        except Exception:
            return ""

    @staticmethod
    def _get_docstring(node: ast.AST) -> str:
        """Extract docstring from a module, class, or function node."""
        try:
            doc = ast.get_docstring(node)
            return doc if doc else ""
        except Exception:
            return ""
