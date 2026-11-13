"""C and C++ source code parser extracting functions, methods, classes, structs, and includes."""

from __future__ import annotations

import re
from pathlib import Path

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)


class CppParser:
    """Parse C and C++ (.c, .h, .cpp, .hpp, .cc) source files and extract symbols and includes."""

    def __init__(self, language: str = "C++") -> None:
        self.language = language

    def parse_file(self, file_path: str) -> ParsedFile:
        """Parse *file_path* and return extracted structural metadata."""
        ext = Path(file_path).suffix.lower()
        lang = "C" if ext in (".c", ".h") else "C++"

        try:
            source = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ParsedFile(file_path=file_path, language=lang)

        return ParsedFile(
            file_path=file_path,
            language=lang,
            imports=self._extract_includes(source),
            classes=self._extract_classes_and_structs(source),
            functions=self._extract_functions(source),
            module_docstring=self._extract_header_doc(source) or "",
        )

    @staticmethod
    def _extract_header_doc(source: str) -> str | None:
        """Extract top-level comment block."""
        match = re.search(r"/\*\*(.*?)\*/", source, re.DOTALL)
        if match:
            doc = match.group(1).strip()
            return "\n".join(ln.strip().lstrip("*").strip() for ln in doc.splitlines() if ln.strip())
        return None

    @staticmethod
    def _extract_includes(source: str) -> list[ImportInfo]:
        imports: list[ImportInfo] = []
        pattern = re.compile(r'^[ \t]*#[ \t]*include\s+[<"](?P<header>[^>"]+)[>"]', re.MULTILINE)
        for m in pattern.finditer(source):
            header = m.group("header")
            line_no = source[: m.start()].count("\n") + 1
            imports.append(ImportInfo(module=header, names=[header], line_number=line_no, is_type_checking=False))
        return imports

    def _extract_classes_and_structs(self, source: str) -> list[ClassInfo]:
        classes: list[ClassInfo] = []
        lines = source.splitlines()

        class_pattern = re.compile(
            r"^[ \t]*(?:template\s*<[^>]+>\s*)?"
            r"(?P<kind>class|struct)\s+(?P<name>[a-zA-Z0-9_]+)"
            r"(?:\s*:\s*(?P<bases>[^{;]+))?"
            r"\s*\{",
            re.MULTILINE,
        )

        for m in class_pattern.finditer(source):
            name = m.group("name")
            bases_str = m.group("bases") or ""
            bases = [
                b.replace("public", "").replace("protected", "").replace("private", "").strip()
                for b in bases_str.split(",")
                if b.strip()
            ]

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
                    bases=bases,
                    methods=[],
                    source_code="\n".join(lines[start_line - 1 : end_line]),
                )
            )

        return classes

    def _extract_functions(self, source: str) -> list[FunctionInfo]:
        functions: list[FunctionInfo] = []
        lines = source.splitlines()

        func_pattern = re.compile(
            r"^[ \t]*(?:(?:inline|static|virtual|explicit|constexpr|extern\s+\"[^\"]+\")\s+)*"
            r"(?P<ret>[a-zA-Z0-9_<>:*&]+(?:\s+[a-zA-Z0-9_<>:*&]+)*)\s+"
            r"(?P<name>(?:[a-zA-Z0-9_]+::)?[a-zA-Z0-9_~]+)\s*"
            r"\((?P<params>[^)]*)\)"
            r"(?:\s*const)?(?:\s*noexcept)?(?:\s*override)?(?:\s*final)?\s*"
            r"\{",
            re.MULTILINE,
        )

        for m in func_pattern.finditer(source):
            name = m.group("name")
            if name in ("if", "for", "while", "switch", "catch"):
                continue

            start_idx = m.start()
            start_line = source[:start_idx].count("\n") + 1

            brace_idx = source.find("{", start_idx)
            end_idx = self._find_matching_brace(source, brace_idx) if brace_idx != -1 else -1
            end_line = source[:end_idx].count("\n") + 1 if end_idx != -1 else start_line + 5

            params_str = m.group("params")
            args = [p.strip().split()[-1].lstrip("*&") for p in params_str.split(",") if p.strip()]

            ret_type = m.group("ret").strip()
            docstring = self._extract_preceding_comment(source, start_idx)

            functions.append(
                FunctionInfo(
                    name=name,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    args=args,
                    return_type=ret_type,
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

            if c == "'" and prev != "\\":
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
    def _extract_preceding_comment(source: str, start_idx: int) -> str:
        prefix = source[:start_idx].rstrip()
        if prefix.endswith("*/"):
            doc_start = prefix.rfind("/*")
            if doc_start != -1:
                raw = prefix[doc_start + 2 : -2].strip()
                return "\n".join(ln.strip().lstrip("*").strip() for ln in raw.splitlines() if ln.strip())
        lines_before = prefix.splitlines()
        comment_lines: list[str] = []
        for line in reversed(lines_before):
            stripped = line.strip()
            if stripped.startswith("//"):
                comment_lines.append(stripped.lstrip("/").strip())
            else:
                break
        comment_lines.reverse()
        return "\n".join(comment_lines)
