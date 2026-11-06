"""Java source code parser extracting structural classes, interfaces, methods, and imports."""

from __future__ import annotations

import re
from pathlib import Path

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)


class JavaParser:
    """Parse Java (.java) source files and extract classes, methods, and imports."""

    def parse_file(self, file_path: str) -> ParsedFile:
        """Parse *file_path* and return extracted structural metadata."""
        try:
            source = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ParsedFile(file_path=file_path, language="Java")

        return ParsedFile(
            file_path=file_path,
            language="Java",
            imports=self._extract_imports(source),
            classes=self._extract_classes(source),
            functions=self._extract_standalone_functions(source),
            module_docstring=self._extract_package_doc(source) or "",
        )

    @staticmethod
    def _extract_package_doc(source: str) -> str | None:
        """Extract top-level package Javadoc comment."""
        match = re.search(r"/\*\*(.*?)\*/\s*package\s+", source, re.DOTALL)
        if match:
            doc = match.group(1).strip()
            return "\n".join(line.strip().lstrip("*").strip() for line in doc.splitlines() if line.strip())
        return None

    @staticmethod
    def _extract_imports(source: str) -> list[ImportInfo]:
        imports: list[ImportInfo] = []
        # Match: import [static] a.b.c.ClassName; or import a.b.c.*;
        pattern = re.compile(r"^\s*import\s+(?:static\s+)?([a-zA-Z0-9_.*]+)\s*;", re.MULTILINE)
        for m in pattern.finditer(source):
            full_import = m.group(1).strip()
            line_no = source[: m.start()].count("\n") + 1
            if "." in full_import:
                module, name = full_import.rsplit(".", 1)
                names = [name]
            else:
                module = full_import
                names = []
            imports.append(
                ImportInfo(
                    module=module,
                    names=names,
                    line_number=line_no,
                    is_type_checking=False,
                )
            )
        return imports

    def _extract_classes(self, source: str) -> list[ClassInfo]:
        classes: list[ClassInfo] = []
        lines = source.splitlines()

        # Match class, interface, enum, record headers
        class_pattern = re.compile(
            r"^[ \t]*(?:(?:public|protected|private|abstract|final|static)\s+)*"
            r"(?P<kind>class|interface|enum|record)\s+(?P<name>[a-zA-Z0-9_]+)"
            r"(?:<[^>]+>)?"
            r"(?:\s+extends\s+(?P<extends>[a-zA-Z0-9_., <>]+?))?"
            r"(?:\s+implements\s+(?P<implements>[a-zA-Z0-9_., <>]+?))?"
            r"\s*\{",
            re.MULTILINE,
        )

        for m in class_pattern.finditer(source):
            name = m.group("name")
            extends = m.group("extends") or ""
            implements = m.group("implements") or ""

            bases: list[str] = []
            if extends:
                bases.extend([b.strip().split("<")[0].strip() for b in extends.split(",") if b.strip()])
            if implements:
                bases.extend([b.strip().split("<")[0].strip() for b in implements.split(",") if b.strip()])

            start_idx = m.start()
            start_line = source[:start_idx].count("\n") + 1

            # Find matching class body braces
            body_start = source.find("{", start_idx)
            if body_start == -1:
                continue

            end_idx = self._find_matching_brace(source, body_start)
            end_line = source[:end_idx].count("\n") + 1 if end_idx != -1 else len(lines)
            class_body = source[body_start : end_idx + 1] if end_idx != -1 else source[body_start:]

            # Extract Javadoc comment before class
            docstring = self._extract_preceding_doc(source, start_idx)

            # Extract methods inside class body
            methods = self._extract_methods(class_body, base_line=start_line + source[start_idx:body_start].count("\n"))

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
            r"^(?P<indent>[ \t]*)(?:(?:public|protected|private|abstract|final|static|synchronized|default)\s+)*"
            r"(?:<[^>]+>\s+)?"  # generic type parameters
            r"(?P<ret_type>[a-zA-Z0-9_<>\[\],\s]+?)\s+"
            r"(?P<name>[a-zA-Z0-9_]+)\s*"
            r"\((?P<params>[^)]*)\)"
            r"(?:\s*throws\s+[a-zA-Z0-9_.,\s]+)?\s*"
            r"\{",
            re.MULTILINE,
        )

        for m in method_pattern.finditer(body):
            name = m.group("name")
            if name in ("if", "for", "while", "switch", "catch"):
                continue

            start_idx = m.start()
            m_start_line = base_line + body[:start_idx].count("\n")

            brace_idx = body.find("{", start_idx)
            end_idx = self._find_matching_brace(body, brace_idx) if brace_idx != -1 else -1
            m_end_line = base_line + body[:end_idx].count("\n") if end_idx != -1 else m_start_line + 5

            params_str = m.group("params")
            args = [p.strip().split()[-1] for p in params_str.split(",") if p.strip()]

            docstring = self._extract_preceding_doc(body, start_idx)
            ret_type = m.group("ret_type").strip().split()[-1] if m.group("ret_type") else None

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
        """Java typically wraps everything in classes; return empty list."""
        return []

    @staticmethod
    def _find_matching_brace(text: str, open_idx: int) -> int:
        if open_idx >= len(text) or text[open_idx] != "{":
            return -1
        depth = 0
        in_string = False
        in_char = False
        quote_char = ""
        for i in range(open_idx, len(text)):
            c = text[i]
            prev = text[i - 1] if i > 0 else ""
            if (c == '"' or c == "'") and prev != "\\":
                if not in_string and not in_char:
                    if c == '"':
                        in_string = True
                    else:
                        in_char = True
                    quote_char = c
                elif (c == '"' and in_string) or (c == "'" and in_char):
                    if c == quote_char:
                        in_string = False
                        in_char = False
                continue

            if in_string or in_char:
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
        prefix = source[:start_idx].rstrip()
        if prefix.endswith("*/"):
            doc_start = prefix.rfind("/**")
            if doc_start != -1:
                raw = prefix[doc_start + 3 : -2].strip()
                cleaned = "\n".join(line.strip().lstrip("*").strip() for line in raw.splitlines() if line.strip())
                return cleaned
        return ""
