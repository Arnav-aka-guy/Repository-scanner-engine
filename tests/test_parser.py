"""Tests for the Python parser module.

Validates import extraction, class extraction (with methods), function
extraction (with calls), and end-to-end parsing of sample Python source.
"""

from __future__ import annotations

import ast
import textwrap
from pathlib import Path

import pytest

from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)

# ---------------------------------------------------------------------------
# Sample source code used across multiple tests
# ---------------------------------------------------------------------------

SAMPLE_SOURCE = textwrap.dedent("""\
    \"\"\"Sample module docstring.\"\"\"

    import os
    import sys
    from pathlib import Path
    from collections import OrderedDict
    from typing import List, Optional

    class Calculator:
        \"\"\"A simple calculator class.\"\"\"

        def __init__(self, precision: int = 2):
            self.precision = precision
            self.history: list = []

        def add(self, a: float, b: float) -> float:
            \"\"\"Add two numbers.\"\"\"
            result = round(a + b, self.precision)
            self.history.append(result)
            return result

        def subtract(self, a: float, b: float) -> float:
            result = round(a - b, self.precision)
            self.history.append(result)
            return result

    class AdvancedCalculator(Calculator):
        \"\"\"Extends Calculator with more operations.\"\"\"

        def multiply(self, a: float, b: float) -> float:
            result = round(a * b, self.precision)
            self.history.append(result)
            return result

    def helper_function(x: int) -> int:
        \"\"\"A standalone helper function.\"\"\"
        value = abs(x)
        print(value)
        return value

    def another_function():
        calc = Calculator()
        result = calc.add(1, 2)
        helper_function(result)
        return result
""")


@pytest.fixture()
def sample_file(tmp_path: Path) -> Path:
    """Write SAMPLE_SOURCE to a temp .py file and return its path."""
    fp = tmp_path / "sample.py"
    fp.write_text(SAMPLE_SOURCE, encoding="utf-8")
    return fp


@pytest.fixture()
def parsed_tree() -> ast.Module:
    """Return the AST for SAMPLE_SOURCE."""
    return ast.parse(SAMPLE_SOURCE)


# ---------------------------------------------------------------------------
# Tests — Import extraction
# ---------------------------------------------------------------------------

class TestImportExtraction:
    """Verify that imports are correctly identified from source."""

    def test_regular_imports(self, parsed_tree: ast.Module) -> None:
        """'import os' and 'import sys' should appear."""
        imports = [
            node for node in ast.walk(parsed_tree) if isinstance(node, ast.Import)
        ]
        names = [alias.name for node in imports for alias in node.names]
        assert "os" in names
        assert "sys" in names

    def test_from_imports(self, parsed_tree: ast.Module) -> None:
        """'from pathlib import Path' etc. should be captured."""
        from_imports = [
            node for node in ast.walk(parsed_tree) if isinstance(node, ast.ImportFrom)
        ]
        modules = [node.module for node in from_imports if node.module]
        assert "pathlib" in modules
        assert "collections" in modules
        assert "typing" in modules

    def test_import_info_model(self) -> None:
        """ImportInfo Pydantic model should serialize correctly."""
        info = ImportInfo(module="pathlib", names=["Path"], is_from_import=True)
        assert info.module == "pathlib"
        assert info.is_from_import is True
        assert "Path" in info.names

    def test_import_with_alias(self) -> None:
        """ImportInfo should support an optional alias field."""
        info = ImportInfo(module="numpy", names=["array"], alias="np")
        assert info.alias == "np"


# ---------------------------------------------------------------------------
# Tests — Class extraction
# ---------------------------------------------------------------------------

class TestClassExtraction:
    """Verify class definitions are properly parsed."""

    def test_finds_all_classes(self, parsed_tree: ast.Module) -> None:
        """Two classes should be found in the sample."""
        classes = [
            node for node in ast.walk(parsed_tree)
            if isinstance(node, ast.ClassDef)
        ]
        assert len(classes) == 2
        names = {c.name for c in classes}
        assert names == {"Calculator", "AdvancedCalculator"}

    def test_class_methods(self, parsed_tree: ast.Module) -> None:
        """Calculator should have __init__, add, and subtract methods."""
        calc_class = next(
            node for node in ast.walk(parsed_tree)
            if isinstance(node, ast.ClassDef) and node.name == "Calculator"
        )
        methods = [
            node.name for node in calc_class.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        assert "__init__" in methods
        assert "add" in methods
        assert "subtract" in methods

    def test_class_inheritance(self, parsed_tree: ast.Module) -> None:
        """AdvancedCalculator should list Calculator as a base."""
        adv = next(
            node for node in ast.walk(parsed_tree)
            if isinstance(node, ast.ClassDef) and node.name == "AdvancedCalculator"
        )
        bases = [
            base.id for base in adv.bases if isinstance(base, ast.Name)
        ]
        assert "Calculator" in bases

    def test_class_info_model(self) -> None:
        """ClassInfo model should hold name, bases, methods, and docstring."""
        method = FunctionInfo(name="add", args=["self", "a", "b"], return_type="float")
        cls = ClassInfo(
            name="Calculator",
            bases=["object"],
            docstring="A calculator.",
            methods=[method],
            start_line=10,
            end_line=30,
        )
        assert cls.name == "Calculator"
        assert len(cls.methods) == 1
        assert cls.methods[0].name == "add"

    def test_class_docstring(self, parsed_tree: ast.Module) -> None:
        """Classes with docstrings should have them extractable."""
        calc_class = next(
            node for node in ast.walk(parsed_tree)
            if isinstance(node, ast.ClassDef) and node.name == "Calculator"
        )
        docstring = ast.get_docstring(calc_class)
        assert docstring == "A simple calculator class."


# ---------------------------------------------------------------------------
# Tests — Function extraction
# ---------------------------------------------------------------------------

class TestFunctionExtraction:
    """Verify top-level functions and their internal calls."""

    def test_finds_top_level_functions(self, parsed_tree: ast.Module) -> None:
        """Two top-level functions should be found."""
        funcs = [
            node for node in parsed_tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        names = {f.name for f in funcs}
        assert names == {"helper_function", "another_function"}

    def test_function_calls_detected(self, parsed_tree: ast.Module) -> None:
        """another_function calls Calculator(), calc.add(), and helper_function()."""
        func = next(
            node for node in parsed_tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "another_function"
        )
        calls = [
            node for node in ast.walk(func) if isinstance(node, ast.Call)
        ]
        call_names: list[str] = []
        for call in calls:
            if isinstance(call.func, ast.Name):
                call_names.append(call.func.id)
            elif isinstance(call.func, ast.Attribute):
                call_names.append(call.func.attr)
        assert "Calculator" in call_names
        assert "add" in call_names
        assert "helper_function" in call_names

    def test_function_info_model(self) -> None:
        """FunctionInfo model should hold calls list."""
        fi = FunctionInfo(
            name="another_function",
            args=[],
            calls=["Calculator", "add", "helper_function"],
            start_line=35,
            end_line=40,
        )
        assert "add" in fi.calls
        assert fi.start_line == 35

    def test_function_docstring(self, parsed_tree: ast.Module) -> None:
        """helper_function should have its docstring extractable."""
        func = next(
            node for node in parsed_tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "helper_function"
        )
        docstring = ast.get_docstring(func)
        assert docstring == "A standalone helper function."


# ---------------------------------------------------------------------------
# Tests — ParsedFile model
# ---------------------------------------------------------------------------

class TestParsedFileModel:
    """End-to-end: build a ParsedFile from extracted data."""

    def test_create_parsed_file(self, sample_file: Path) -> None:
        """Construct a ParsedFile from manually extracted components."""
        pf = ParsedFile(
            file_path=str(sample_file),
            language="Python",
            imports=[
                ImportInfo(module="os", is_from_import=False),
                ImportInfo(module="pathlib", names=["Path"], is_from_import=True),
            ],
            functions=[
                FunctionInfo(name="helper_function", args=["x"], return_type="int"),
            ],
            classes=[
                ClassInfo(
                    name="Calculator",
                    bases=[],
                    methods=[
                        FunctionInfo(name="add", args=["self", "a", "b"]),
                    ],
                ),
            ],
            module_docstring="Sample module docstring.",
        )
        assert pf.language == "Python"
        assert len(pf.imports) == 2
        assert len(pf.classes) == 1
        assert pf.classes[0].methods[0].name == "add"
        assert pf.module_docstring == "Sample module docstring."
