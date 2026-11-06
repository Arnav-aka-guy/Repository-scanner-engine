"""Go source code parser extracting functions, methods, structs, interfaces, and imports."""

from __future__ import annotations

import re
from pathlib import Path

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)


class GoParser:
    """Parse Go (.go) source files and extract symbols, types, and dependencies."""

    def parse_file(self, file_path: str) -> ParsedFile:
        """Parse *file_path* and return extracted structural metadata."""
        try:
            source = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ParsedFile(file_path=file_path, language="Go")

        return ParsedFile(
            file_path=file_path,
            language="Go",
            imports=self._extract_imports(source),
            classes=self._extract_structs_and_interfaces(source),
            functions=self._extract_functions(source),
            module_docstring=self._extract_package_doc(source) or "",
        )

    @staticmethod
    def _extract_package_doc(source: str) -> str | None:
        """Extract comment block preceding the package declaration."""
        match = re.search(r"((?:^[ \t]*//[^\n]*\n)+)\s*package\s+", source, re.MULTILINE)
        if match:
            raw = match.group(1)
            return "\n".join(ln.strip().removeprefix("//").strip() for ln in raw.splitlines() if ln.strip())
        return None

    @staticmethod
    def _extract_imports(source: str) -> list[ImportInfo]:
        imports: list[ImportInfo] = []

        # 1. Single-line imports: import "fmt" or import log "github.com/sirupsen/logrus"
        single_pattern = re.compile(
            r"^[ \t]*import\s+(?:(?P<alias>[a-zA-Z0-9_.]+)\s+)?\"(?P<pkg>[^\"]+)\"",
            re.MULTILINE,
        )
        for m in single_pattern.finditer(source):
            pkg = m.group("pkg")
            alias = m.group("alias")
            line_no = source[: m.start()].count("\n") + 1
            names = [alias] if alias else []
            imports.append(ImportInfo(module=pkg, names=names, line_number=line_no, is_type_checking=False))

        # 2. Multi-line import block: import ( ... )
        multi_pattern = re.compile(r"^[ \t]*import\s*\(\s*(?P<body>[^\)]+)\)", re.MULTILINE)
        for block in multi_pattern.finditer(source):
            body = block.group("body")
            base_line = source[: block.start()].count("\n") + 1
            entry_pattern = re.compile(r"(?:(?P<alias>[a-zA-Z0-9_.]+)\s+)?\"(?P<pkg>[^\"]+)\"")
            for m in entry_pattern.finditer(body):
                pkg = m.group("pkg")
                alias = m.group("alias")
                line_no = base_line + body[: m.start()].count("\n")
                names = [alias] if alias else []
                imports.append(ImportInfo(module=pkg, names=names, line_number=line_no, is_type_checking=False))

        return imports

    def _extract_structs_and_interfaces(self, source: str) -> list[ClassInfo]:
        """In Go, structs and interfaces represent class-like structures."""
        classes: list[ClassInfo] = []
        lines = source.splitlines()

        type_pattern = re.compile(
            r"^[ \t]*type\s+(?P<name>[a-zA-Z0-9_]+)\s+(?P<kind>struct|interface)\s*\{",
            re.MULTILINE,
        )

        for m in type_pattern.finditer(source):
            name = m.group("name")
            start_idx = m.start()
            start_line = source[:start_idx].count("\n") + 1

            brace_idx = source.find("{", start_idx)
            end_idx = self._find_matching_brace(source, brace_idx) if brace_idx != -1 else -1
            end_line = source[:end_idx].count("\n") + 1 if end_idx != -1 else start_line + 5

            docstring = self._extract_preceding_comment(source, start_idx)

            classes.append(
                ClassInfo(
                    name=name,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    bases=[],
                    methods=[],  # Go methods are attached via receivers, handled in functions
                    source_code="\n".join(lines[start_line - 1 : end_line]),
                )
            )

        return classes

    def _extract_functions(self, source: str) -> list[FunctionInfo]:
        """Extract both standalone functions and method receiver declarations."""
        functions: list[FunctionInfo] = []
        lines = source.splitlines()

        func_pattern = re.compile(
            r"^[ \t]*func\s+"
            r"(?:\((?P<receiver>[^)]+)\)\s+)?"  # optional receiver (s *Server)
            r"(?P<name>[a-zA-Z0-9_]+)\s*"
            r"\((?P<params>[^)]*)\)"
            r"(?:\s*(?P<ret>[^{]+))?\s*"
            r"\{",
            re.MULTILINE,
        )

        for m in func_pattern.finditer(source):
            name = m.group("name")
            receiver = m.group("receiver")
            full_name = f"({receiver.strip()}).{name}" if receiver else name

            start_idx = m.start()
            start_line = source[:start_idx].count("\n") + 1

            brace_idx = source.find("{", start_idx)
            end_idx = self._find_matching_brace(source, brace_idx) if brace_idx != -1 else -1
            end_line = source[:end_idx].count("\n") + 1 if end_idx != -1 else start_line + 5

            params_str = m.group("params")
            args = [p.strip().split()[0] for p in params_str.split(",") if p.strip()]

            ret_str = m.group("ret")
            return_type = ret_str.strip() if ret_str else None
            docstring = self._extract_preceding_comment(source, start_idx)

            functions.append(
                FunctionInfo(
                    name=full_name,
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
        in_raw_string = False
        for i in range(open_idx, len(text)):
            c = text[i]
            prev = text[i - 1] if i > 0 else ""
            if c == "`":
                in_raw_string = not in_raw_string
                continue
            if in_raw_string:
                continue

            if c == '"' and prev != "\\":
                in_string = not in_string
                continue
            if in_string:
                continue

            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return i
        return -1

    @staticmethod
    def _extract_preceding_comment(source: str, start_idx: int) -> str:
        lines_before = source[:start_idx].rstrip().splitlines()
        comment_lines: list[str] = []
        for line in reversed(lines_before):
            stripped = line.strip()
            if stripped.startswith("//"):
                comment_lines.append(stripped.lstrip("/").strip())
            else:
                break
        comment_lines.reverse()
        return "\n".join(comment_lines)
