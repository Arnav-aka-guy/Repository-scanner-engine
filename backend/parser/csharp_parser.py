"""C# source code parser extracting classes, interfaces, records, methods, and usings."""

from __future__ import annotations

import re
from pathlib import Path

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)


class CSharpParser:
    """Parse C# (.cs) source files and extract classes, methods, and namespaces."""

    def parse_file(self, file_path: str) -> ParsedFile:
        """Parse *file_path* and return extracted structural metadata."""
        try:
            source = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ParsedFile(file_path=file_path, language="C#")

        return ParsedFile(
            file_path=file_path,
            language="C#",
            imports=self._extract_usings(source),
            classes=self._extract_classes(source),
            functions=self._extract_standalone_functions(source),
            module_docstring=self._extract_namespace_doc(source) or "",
        )

    @staticmethod
    def _extract_namespace_doc(source: str) -> str | None:
        """Extract top-level XML summary or comment block."""
        match = re.search(r"<summary>(.*?)</summary>", source, re.DOTALL)
        if match:
            doc = match.group(1).strip()
            return "\n".join(ln.strip().removeprefix("///").strip() for ln in doc.splitlines() if ln.strip())
        return None

    @staticmethod
    def _extract_usings(source: str) -> list[ImportInfo]:
        imports: list[ImportInfo] = []
        pattern = re.compile(
            r"^[ \t]*using\s+(?:static\s+)?(?:(?P<alias>[a-zA-Z0-9_]+)\s*=\s*)?(?P<ns>[a-zA-Z0-9_.]+)\s*;",
            re.MULTILINE,
        )
        for m in pattern.finditer(source):
            ns = m.group("ns")
            alias = m.group("alias")
            line_no = source[: m.start()].count("\n") + 1
            names = [alias] if alias else []
            imports.append(ImportInfo(module=ns, names=names, line_number=line_no, is_type_checking=False))
        return imports

    def _extract_classes(self, source: str) -> list[ClassInfo]:
        classes: list[ClassInfo] = []
        lines = source.splitlines()

        class_pattern = re.compile(
            r"^[ \t]*(?:(?:public|protected|private|internal|abstract|sealed|static|partial)\s+)*"
            r"(?P<kind>class|interface|record|struct)\s+(?P<name>[a-zA-Z0-9_]+)"
            r"(?:<[^>]+>)?"
            r"(?:\s*:\s*(?P<bases>[^{]+))?"
            r"\s*\{",
            re.MULTILINE,
        )

        for m in class_pattern.finditer(source):
            name = m.group("name")
            bases_str = m.group("bases") or ""
            bases = [b.strip().split("<")[0].strip() for b in bases_str.split(",") if b.strip()]

            start_idx = m.start()
            start_line = source[:start_idx].count("\n") + 1

            brace_idx = source.find("{", start_idx)
            end_idx = self._find_matching_brace(source, brace_idx) if brace_idx != -1 else -1
            end_line = source[:end_idx].count("\n") + 1 if end_idx != -1 else start_line + 5
            class_body = source[brace_idx : end_idx + 1] if end_idx != -1 else source[brace_idx:]

            docstring = self._extract_preceding_doc(source, start_idx)
            methods = self._extract_methods(class_body, base_line=start_line + source[start_idx:brace_idx].count("\n"))

            classes.append(
                ClassInfo(
                    name=name,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    bases=bases,
                    methods=methods,
                    source_code="\n".join(lines[start_line - 1 : end_line]),
                )
            )

        return classes

    def _extract_methods(self, body: str, base_line: int) -> list[FunctionInfo]:
        methods: list[FunctionInfo] = []
        body_lines = body.splitlines()

        method_pattern = re.compile(
            r"^[ \t]*(?:(?:public|protected|private|internal|static|virtual|override|abstract|async)\s+)*"
            r"(?P<ret>[a-zA-Z0-9_<>\[\],\s\?]+?)\s+"
            r"(?P<name>[a-zA-Z0-9_]+)\s*"
            r"\((?P<params>[^)]*)\)\s*"
            r"(?:where\s+[^{]+)?\s*\{",
            re.MULTILINE,
        )

        for m in method_pattern.finditer(body):
            name = m.group("name")
            if name in ("if", "for", "while", "switch", "catch", "using", "lock"):
                continue

            start_idx = m.start()
            m_start_line = base_line + body[:start_idx].count("\n")

            brace_idx = body.find("{", start_idx)
            end_idx = self._find_matching_brace(body, brace_idx) if brace_idx != -1 else -1
            m_end_line = base_line + body[:end_idx].count("\n") if end_idx != -1 else m_start_line + 5

            params_str = m.group("params")
            args = [p.strip().split()[-1] for p in params_str.split(",") if p.strip()]

            docstring = self._extract_preceding_doc(body, start_idx)
            ret_type = m.group("ret").strip()

            methods.append(
                FunctionInfo(
                    name=name,
                    start_line=m_start_line,
                    end_line=m_end_line,
                    docstring=docstring,
                    args=args,
                    return_type=ret_type,
                    source_code="\n".join(body_lines[body[:start_idx].count("\n") : body[:end_idx].count("\n") + 1])
                    if end_idx != -1
                    else "",
                )
            )

        return methods

    @staticmethod
    def _extract_standalone_functions(source: str) -> list[FunctionInfo]:
        return []

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
