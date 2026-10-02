"""TypeScript / JavaScript source parser using regex-based extraction.

Since Python's ``ast`` module only handles Python, this parser uses
carefully crafted regular expressions to extract structural information
from TypeScript, JavaScript, JSX, and TSX source files.
"""

from __future__ import annotations

import re
from pathlib import Path

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)


class TypeScriptParser:
    """Parse a single TypeScript or JavaScript file and extract structural information."""

    # ── Public API ──────────────────────────────────────────────────────

    def parse_file(self, file_path: str) -> ParsedFile:
        """Read *file_path*, extract structures via regex, and return a ``ParsedFile``."""
        try:
            source = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ParsedFile(file_path=file_path, language=self._detect_lang(file_path))

        lang = self._detect_lang(file_path)

        return ParsedFile(
            file_path=file_path,
            language=lang,
            imports=self._extract_imports(source),
            functions=self._extract_functions(source),
            classes=self._extract_classes(source),
            module_docstring=self._extract_module_doc(source),
        )

    # ── Import extraction ───────────────────────────────────────────────

    @staticmethod
    def _extract_imports(source: str) -> list[ImportInfo]:
        imports: list[ImportInfo] = []

        # ES module imports: import X from 'Y'  /  import { A, B } from 'Y'
        es_pattern = re.compile(
            r"""import\s+"""
            r"""(?:"""
            r"""(?:(\w+)\s*,?\s*)?"""  # default import name
            r"""(?:\{([^}]*)\}\s*,?\s*)?"""  # named imports { A, B }
            r"""(?:\*\s+as\s+(\w+)\s*)?"""  # namespace import * as X
            r""")"""
            r"""\s*from\s*['"]([\w@/.\\-]+)['"]""",  # module path
            re.MULTILINE,
        )
        for m in es_pattern.finditer(source):
            default_name = m.group(1) or ""
            named_raw = m.group(2) or ""
            namespace = m.group(3) or ""
            module = m.group(4) or ""

            names: list[str] = []
            if default_name:
                names.append(default_name)
            if named_raw:
                for part in named_raw.split(","):
                    name = part.strip().split(" as ")[0].strip()
                    if name:
                        names.append(name)
            if namespace:
                names.append(namespace)

            imports.append(
                ImportInfo(
                    module=module,
                    names=names or [module.split("/")[-1]],
                    is_from_import=True,
                    alias=namespace or None,
                )
            )

        # Side-effect imports: import 'module' / import "module"
        side_pattern = re.compile(r"""import\s+['"]([\w@/.\\-]+)['"]""", re.MULTILINE)
        for m in side_pattern.finditer(source):
            module = m.group(1)
            # Skip if already captured by ES pattern
            if not any(imp.module == module for imp in imports):
                imports.append(ImportInfo(module=module, names=[], is_from_import=False))

        # CommonJS require: const X = require('Y')
        cjs_pattern = re.compile(
            r"""(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([\w@/.\\-]+)['"]\s*\)""",
            re.MULTILINE,
        )
        for m in cjs_pattern.finditer(source):
            name = m.group(1)
            module = m.group(2)
            imports.append(
                ImportInfo(
                    module=module,
                    names=[name],
                    is_from_import=False,
                    alias=name,
                )
            )

        return imports

    # ── Function extraction ─────────────────────────────────────────────

    def _extract_functions(self, source: str) -> list[FunctionInfo]:
        functions: list[FunctionInfo] = []
        lines = source.splitlines()

        # Pattern 1: function declarations
        #   export? async? function name(args): returnType {
        func_pattern = re.compile(
            r"""^(?:export\s+(?:default\s+)?)?"""
            r"""(async\s+)?function\s*\*?\s+"""
            r"""(\w+)\s*"""
            r"""(?:<[^>]*>)?\s*"""  # optional generics <T>
            r"""\(([^)]*)\)"""  # parameters
            r"""(?:\s*:\s*([^\s{]+))?\s*\{""",  # optional return type
            re.MULTILINE,
        )

        for m in func_pattern.finditer(source):
            name = m.group(2)
            args_raw = m.group(3)
            return_type = m.group(4)
            start_line = source[: m.start()].count("\n") + 1

            args = self._parse_args(args_raw)
            end_line = self._find_closing_brace(lines, start_line - 1)
            body = "\n".join(lines[start_line - 1 : end_line])
            calls = self._extract_calls(body)
            docstring = self._extract_jsdoc(lines, start_line - 1)

            decorators: list[str] = []
            if "async" in (m.group(1) or ""):
                decorators.append("async")
            if "export" in source[max(0, m.start() - 20) : m.start() + 5]:
                decorators.append("export")

            functions.append(
                FunctionInfo(
                    name=name,
                    args=args,
                    return_type=return_type,
                    decorators=decorators,
                    docstring=docstring,
                    source_code=body[:2000],  # cap large functions
                    start_line=start_line,
                    end_line=end_line,
                    calls=calls,
                )
            )

        # Pattern 2: Arrow / const function expressions (top-level only)
        #   export? const name = (async)? (args) => { ... }
        #   export? const name: Type = (args) => { ... }
        arrow_pattern = re.compile(
            r"""^(?:export\s+(?:default\s+)?)?"""
            r"""(?:const|let|var)\s+"""
            r"""(\w+)\s*"""
            r"""(?::\s*[^=]+?)?\s*=\s*"""
            r"""(?:async\s+)?"""
            r"""\(([^)]*)\)\s*"""
            r"""(?::\s*(\S+?))?\s*=>\s*""",
            re.MULTILINE,
        )

        for m in arrow_pattern.finditer(source):
            name = m.group(1)
            args_raw = m.group(2)
            return_type = m.group(3)
            start_line = source[: m.start()].count("\n") + 1

            # Skip if already found as a named function
            if any(f.name == name for f in functions):
                continue

            args = self._parse_args(args_raw)
            end_line = self._find_closing_brace(lines, start_line - 1)
            if end_line == start_line:
                # Single-line arrow: find end of statement
                end_line = min(start_line + 1, len(lines))
            body = "\n".join(lines[start_line - 1 : end_line])
            calls = self._extract_calls(body)
            docstring = self._extract_jsdoc(lines, start_line - 1)

            decorators = ["arrow"]
            if "export" in source[max(0, m.start() - 20) : m.start() + 5]:
                decorators.append("export")

            functions.append(
                FunctionInfo(
                    name=name,
                    args=args,
                    return_type=return_type,
                    decorators=decorators,
                    docstring=docstring,
                    source_code=body[:2000],
                    start_line=start_line,
                    end_line=end_line,
                    calls=calls,
                )
            )

        return functions

    # ── Class extraction ────────────────────────────────────────────────

    def _extract_classes(self, source: str) -> list[ClassInfo]:
        classes: list[ClassInfo] = []
        lines = source.splitlines()

        # class Name extends Base implements Interface {
        class_pattern = re.compile(
            r"""^(?:export\s+(?:default\s+)?)?"""
            r"""(?:abstract\s+)?"""
            r"""class\s+(\w+)"""
            r"""(?:\s*<[^>]*>)?"""  # generic params
            r"""(?:\s+extends\s+([\w.]+))?"""  # extends clause
            r"""(?:\s+implements\s+([\w.,\s]+))?"""  # implements clause
            r"""\s*\{""",
            re.MULTILINE,
        )

        for m in class_pattern.finditer(source):
            name = m.group(1)
            extends = m.group(2)
            implements_raw = m.group(3)
            start_line = source[: m.start()].count("\n") + 1
            end_line = self._find_closing_brace(lines, start_line - 1)

            bases: list[str] = []
            if extends:
                bases.append(extends)
            if implements_raw:
                for impl in implements_raw.split(","):
                    impl = impl.strip()
                    if impl:
                        bases.append(impl)

            class_body = "\n".join(lines[start_line - 1 : end_line])
            methods = self._extract_methods(class_body, start_line)
            attributes = self._extract_class_attributes(class_body)
            docstring = self._extract_jsdoc(lines, start_line - 1)

            decorators: list[str] = []
            if "export" in source[max(0, m.start() - 20) : m.start() + 5]:
                decorators.append("export")
            if "abstract" in source[max(0, m.start() - 20) : m.start() + 10]:
                decorators.append("abstract")

            classes.append(
                ClassInfo(
                    name=name,
                    bases=bases,
                    decorators=decorators,
                    docstring=docstring,
                    source_code=class_body[:3000],
                    methods=methods,
                    attributes=attributes,
                    start_line=start_line,
                    end_line=end_line,
                )
            )

        return classes

    # ── Method extraction (within class bodies) ─────────────────────────

    def _extract_methods(self, class_body: str, class_start: int) -> list[FunctionInfo]:
        methods: list[FunctionInfo] = []
        lines = class_body.splitlines()

        # Matches: public? async? methodName(args): ReturnType {
        method_pattern = re.compile(
            r"""^\s+"""
            r"""(?:(?:public|private|protected|static|readonly|abstract|override)\s+)*"""
            r"""(?:async\s+)?"""
            r"""(?:get\s+|set\s+)?"""
            r"""(\w+)\s*"""
            r"""(?:<[^>]*>)?\s*"""
            r"""\(([^)]*)\)"""
            r"""(?:\s*:\s*([^\s{]+))?\s*\{""",
            re.MULTILINE,
        )

        for m in method_pattern.finditer(class_body):
            name = m.group(1)
            args_raw = m.group(2)
            return_type = m.group(3)

            # Skip if it looks like a conditional or loop
            if name in ("if", "for", "while", "switch", "catch", "constructor") and name != "constructor":
                continue

            rel_line = class_body[: m.start()].count("\n")
            start_line = class_start + rel_line
            end_line_rel = self._find_closing_brace(lines, rel_line)
            end_line = class_start + end_line_rel - 1

            body = "\n".join(lines[rel_line:end_line_rel])
            calls = self._extract_calls(body)

            methods.append(
                FunctionInfo(
                    name=name,
                    args=self._parse_args(args_raw),
                    return_type=return_type,
                    decorators=[],
                    docstring="",
                    source_code=body[:1500],
                    start_line=start_line,
                    end_line=end_line,
                    calls=calls,
                )
            )

        return methods

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _detect_lang(file_path: str) -> str:
        ext = Path(file_path).suffix.lower()
        return {
            ".ts": "TypeScript",
            ".tsx": "TypeScript",
            ".js": "JavaScript",
            ".jsx": "JavaScript",
            ".mjs": "JavaScript",
            ".cjs": "JavaScript",
        }.get(ext, "JavaScript")

    @staticmethod
    def _parse_args(raw: str) -> list[str]:
        """Parse a parameter list string into a list of parameter names."""
        if not raw or not raw.strip():
            return []
        args: list[str] = []
        # Split by comma but be careful about nested generics and destructuring
        depth = 0
        current = ""
        for ch in raw:
            if ch in "(<{":
                depth += 1
                current += ch
            elif ch in ")>}":
                depth -= 1
                current += ch
            elif ch == "," and depth == 0:
                args.append(current.strip())
                current = ""
            else:
                current += ch
        if current.strip():
            args.append(current.strip())

        # Extract just the name (before : or = or ?)
        names: list[str] = []
        for arg in args:
            arg = arg.strip()
            if not arg:
                continue
            # Remove destructuring: { a, b }: Type  →  destructured
            if arg.startswith("{"):
                names.append("destructured")
                continue
            if arg.startswith("["):
                names.append("destructured")
                continue
            # Remove rest operator: ...args
            if arg.startswith("..."):
                arg = arg[3:]
            # Take name before : or = or ?
            name = re.split(r"[?:=]", arg)[0].strip()
            # Remove access modifiers
            for mod in ("public", "private", "protected", "readonly"):
                if name.startswith(mod + " "):
                    name = name[len(mod) + 1 :].strip()
            if name and name.isidentifier():
                names.append(name)
        return names

    @staticmethod
    def _find_closing_brace(lines: list[str], start_idx: int) -> int:
        """Find the line number (1-indexed) of the closing brace for a block starting at start_idx."""
        depth = 0
        found_open = False
        for i in range(start_idx, len(lines)):
            line = lines[i]
            # Rough brace counting (ignoring strings/comments for simplicity)
            for ch in line:
                if ch == "{":
                    depth += 1
                    found_open = True
                elif ch == "}":
                    depth -= 1
                    if found_open and depth == 0:
                        return i + 1  # 1-indexed
        # Fallback: return start + reasonable chunk
        return min(start_idx + 20, len(lines))

    @staticmethod
    def _extract_calls(body: str) -> list[str]:
        """Extract function/method call names from a code body."""
        # Match: functionName( or obj.method(
        call_pattern = re.compile(r"""(?<!\w)(\w+)\s*\(""")
        calls: set[str] = set()
        keywords = {
            "if",
            "for",
            "while",
            "switch",
            "catch",
            "return",
            "throw",
            "new",
            "typeof",
            "instanceof",
            "void",
            "delete",
            "await",
            "import",
            "export",
            "from",
            "const",
            "let",
            "var",
            "class",
            "function",
            "async",
            "else",
            "try",
            "finally",
        }
        for m in call_pattern.finditer(body):
            name = m.group(1)
            if name not in keywords and not name[0].isupper():
                # Likely a function call (skip class instantiation which starts uppercase)
                calls.add(name)
            elif name[0].isupper() and name not in keywords:
                # Could be a component or constructor
                calls.add(name)
        return sorted(calls)

    @staticmethod
    def _extract_jsdoc(lines: list[str], line_idx: int) -> str:
        """Look for a JSDoc comment block above the given line index."""
        # Search upward for /** ... */
        doc_lines: list[str] = []
        i = line_idx - 1
        # Skip blank lines
        while i >= 0 and not lines[i].strip():
            i -= 1
        # Check if we're at the end of a JSDoc block
        if i >= 0 and lines[i].strip().endswith("*/"):
            while i >= 0:
                line = lines[i].strip()
                doc_lines.insert(0, line)
                if line.startswith("/**"):
                    break
                i -= 1
        if doc_lines:
            # Clean up the doc
            cleaned: list[str] = []
            for line in doc_lines:
                line = line.strip()
                line = re.sub(r"^/\*\*\s*", "", line)
                line = re.sub(r"\s*\*/$", "", line)
                line = re.sub(r"^\*\s?", "", line)
                line = line.strip()
                if line:
                    cleaned.append(line)
            return " ".join(cleaned)
        return ""

    @staticmethod
    def _extract_class_attributes(class_body: str) -> list[str]:
        """Extract property declarations from a class body."""
        attrs: set[str] = set()
        # Match: public/private/protected/readonly propertyName: Type
        attr_pattern = re.compile(
            r"""^\s+(?:(?:public|private|protected|static|readonly|abstract)\s+)*"""
            r"""(\w+)\s*[?!]?\s*(?::\s*\S+)?\s*(?:=|;)""",
            re.MULTILINE,
        )
        for m in attr_pattern.finditer(class_body):
            name = m.group(1)
            if name not in ("constructor", "get", "set", "async", "static", "readonly"):
                attrs.add(name)

        # Also match: this.propertyName = ...
        this_pattern = re.compile(r"""this\.(\w+)\s*=""")
        for m in this_pattern.finditer(class_body):
            attrs.add(m.group(1))

        return sorted(attrs)

    @staticmethod
    def _extract_module_doc(source: str) -> str:
        """Extract a top-of-file JSDoc or comment block."""
        lines = source.splitlines()
        doc_lines: list[str] = []
        for line in lines[:10]:  # Check first 10 lines
            stripped = line.strip()
            if stripped.startswith("/**") or stripped.startswith("*") or stripped.startswith("//"):
                cleaned = re.sub(r"^/\*\*\s*|\s*\*/$|^\*\s?|^//\s?", "", stripped).strip()
                if cleaned:
                    doc_lines.append(cleaned)
            elif stripped.startswith("'use ") or stripped.startswith('"use '):
                continue
            elif stripped and not stripped.startswith("/*"):
                break
        return " ".join(doc_lines)
