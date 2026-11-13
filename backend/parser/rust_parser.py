"""Rust source code parser extracting functions, structs, enums, traits, and modules."""

from __future__ import annotations

import re
from pathlib import Path

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)


class RustParser:
    """Parse Rust (.rs) source files and extract symbols, traits, and dependencies."""

    def parse_file(self, file_path: str) -> ParsedFile:
        """Parse *file_path* and return extracted structural metadata."""
        try:
            source = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ParsedFile(file_path=file_path, language="Rust")

        return ParsedFile(
            file_path=file_path,
            language="Rust",
            imports=self._extract_imports(source),
            classes=self._extract_types(source),
            functions=self._extract_functions(source),
            module_docstring=self._extract_module_doc(source) or "",
        )

    @staticmethod
    def _extract_module_doc(source: str) -> str | None:
        """Extract inner module doc comments (//! ...)."""
        match = re.search(r"((?:^[ \t]*//![^\n]*\n)+)", source, re.MULTILINE)
        if match:
            raw = match.group(1)
            return "\n".join(ln.strip().removeprefix("//!").strip() for ln in raw.splitlines() if ln.strip())
        return None

    @staticmethod
    def _extract_imports(source: str) -> list[ImportInfo]:
        imports: list[ImportInfo] = []
        # Match: use path::to::{A, B}; or use path::to::item;
        use_pattern = re.compile(
            r"^[ \t]*(?:pub\s+)?use\s+(?P<path>[a-zA-Z0-9_:]+)(?:::(?:\{(?P<items>[^}]+)\}|\*|(?P<leaf>[a-zA-Z0-9_]+)))?\s*;",
            re.MULTILINE,
        )
        for m in use_pattern.finditer(source):
            base_path = m.group("path")
            items_str = m.group("items")
            leaf = m.group("leaf")
            line_no = source[: m.start()].count("\n") + 1

            names: list[str] = []
            if items_str:
                module = base_path
                names = [i.strip() for i in items_str.split(",") if i.strip()]
            elif leaf:
                module = base_path
                names = [leaf]
            else:
                if "::" in base_path:
                    module, name = base_path.rsplit("::", 1)
                    names = [name]
                else:
                    module = base_path
                    names = []

            imports.append(ImportInfo(module=module, names=names, line_number=line_no, is_type_checking=False))
        return imports

    def _extract_types(self, source: str) -> list[ClassInfo]:
        """Extract structs, enums, and traits as class-like definitions."""
        classes: list[ClassInfo] = []
        lines = source.splitlines()

        type_pattern = re.compile(
            r"^[ \t]*(?:pub(?:\([^)]+\))?\s+)?(?P<kind>struct|enum|trait)\s+(?P<name>[a-zA-Z0-9_]+)",
            re.MULTILINE,
        )

        for m in type_pattern.finditer(source):
            name = m.group("name")
            start_idx = m.start()
            start_line = source[:start_idx].count("\n") + 1

            brace_idx = source.find("{", start_idx)
            # Tuple structs end with ; instead of {
            semi_idx = source.find(";", start_idx)

            if brace_idx != -1 and (semi_idx == -1 or brace_idx < semi_idx):
                end_idx = self._find_matching_brace(source, brace_idx)
                end_line = source[:end_idx].count("\n") + 1 if end_idx != -1 else start_line + 5
            elif semi_idx != -1:
                end_idx = semi_idx
                end_line = source[:semi_idx].count("\n") + 1
            else:
                continue

            docstring = self._extract_preceding_doc(source, start_idx)

            classes.append(
                ClassInfo(
                    name=name,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    bases=[],
                    methods=[],
                    source_code="\n".join(lines[start_line - 1 : end_line]),
                )
            )

        return classes

    def _extract_functions(self, source: str) -> list[FunctionInfo]:
        functions: list[FunctionInfo] = []
        lines = source.splitlines()

        fn_pattern = re.compile(
            r"^[ \t]*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+\"[^\"]+\"\s+)?fn\s+(?P<name>[a-zA-Z0-9_]+)\s*"
            r"(?:<[^>]+>)?\s*"
            r"\((?P<params>[^)]*)\)"
            r"(?:\s*->\s*(?P<ret>[^{;]+))?\s*"
            r"(?:where\s+[^{]+)?\s*\{",
            re.MULTILINE,
        )

        for m in fn_pattern.finditer(source):
            name = m.group("name")
            start_idx = m.start()
            start_line = source[:start_idx].count("\n") + 1

            brace_idx = source.find("{", start_idx)
            end_idx = self._find_matching_brace(source, brace_idx) if brace_idx != -1 else -1
            end_line = source[:end_idx].count("\n") + 1 if end_idx != -1 else start_line + 5

            params_str = m.group("params")
            args = [p.strip().split(":")[0].strip() for p in params_str.split(",") if p.strip()]

            ret_str = m.group("ret")
            return_type = ret_str.strip() if ret_str else None
            docstring = self._extract_preceding_doc(source, start_idx)

            functions.append(
                FunctionInfo(
                    name=name,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    args=args,
                    return_type=return_type,
                    source_code="\n".join(lines[start_line - 1 : end_line]),
                )
            )

        return functions

    @staticmethod
    def _find_matching_brace(text: str, open_idx: int) -> int:
        if open_idx >= len(text) or text[open_idx] != "{":
            return -1
        depth = 0
        in_string = False
        in_char = False
        for i in range(open_idx, len(text)):
            c = text[i]
            prev = text[i - 1] if i > 0 else ""
            if c == '"' and prev != "\\":
                in_string = not in_string
                continue
            if in_string:
                continue

            if c == "'" and prev != "\\" and i + 2 < len(text) and text[i + 2] == "'":
                in_char = not in_char
                continue
            if in_char:
                continue

            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return i
        return -1

    @staticmethod
    def _extract_preceding_doc(source: str, start_idx: int) -> str:
        lines_before = source[:start_idx].rstrip().splitlines()
        comment_lines: list[str] = []
        for line in reversed(lines_before):
            stripped = line.strip()
            if stripped.startswith("///"):
                comment_lines.append(stripped.lstrip("/").strip())
            else:
                break
        comment_lines.reverse()
        return "\n".join(comment_lines)
