"""Markdown and HTML documentation generation for software repositories."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.core.models import RepositoryInfo
    from backend.graph.models import GraphData
    from backend.llm.service import LLMService
    from backend.parser.models import ClassInfo, FunctionInfo, ParsedFile

logger = logging.getLogger(__name__)


class DocumentationGenerator:
    """Formats parsing results and utilizes LLM reasoning to output comprehensive documentation."""

    def __init__(self, llm_service: LLMService) -> None:
        self.llm_service = llm_service

    async def generate_repository_overview(
        self,
        repo_info: RepositoryInfo,
        parsed_files: dict[str, ParsedFile],
    ) -> str:
        """Generate a premium Markdown README-style overview of the codebase."""
        # Build structure preview
        file_tree_str = ""
        for path in sorted(parsed_files.keys()):
            classes = [c.name for c in parsed_files[path].classes]
            funcs = [f.name for f in parsed_files[path].functions]
            file_tree_str += f"- `{path}`: classes=[{', '.join(classes)}], functions=[{', '.join(funcs)}]\n"

        prompt = (
            f"Repository Name: {repo_info.name}\n"
            f"Total files: {repo_info.total_files}\n"
            f"Total line count: {repo_info.total_lines}\n"
            f"Languages breakdown: {repo_info.languages}\n\n"
            f"Repository Files Structure:\n{file_tree_str}\n\n"
            f"Analyze this structure and generate a beautiful, comprehensive developer onboarding guide "
            f"in Markdown. It should include:\n"
            f"1. A high-level description of what this project does.\n"
            f"2. A breakdown of primary architectural components and their responsibilities.\n"
            f"3. Getting started / directory map overview."
        )

        try:
            overview = await self.llm_service.provider.generate(
                prompt,
                system_prompt="You are a senior developer writing professional onboarding documentation."
            )
            return overview
        except Exception as e:
            logger.warning("LLM overview generation failed, using fallback template: %s", e)
            return self._fallback_repository_overview(repo_info, parsed_files)

    async def generate_module_docs(self, file_path: str, parsed_file: ParsedFile) -> str:
        """Generate formatted Markdown documentation for a single module."""
        doc = f"# Module: `{file_path}`\n\n"
        if parsed_file.module_docstring:
            doc += f"**Overview**: {parsed_file.module_docstring}\n\n"
        else:
            doc += "*No module-level docstring provided.*\n\n"

        # Classes
        if parsed_file.classes:
            doc += "## Classes\n\n"
            for cls in parsed_file.classes:
                doc += self._format_class_doc(cls)
                doc += "\n"

        # Standalone functions
        if parsed_file.functions:
            doc += "## Functions\n\n"
            for func in parsed_file.functions:
                doc += self._format_function_doc(func)
                doc += "\n"

        # Imports list
        if parsed_file.imports:
            doc += "## Dependencies & Imports\n\n"
            doc += "| Module | Imported Entities | Type |\n"
            doc += "| --- | --- | --- |\n"
            for imp in parsed_file.imports:
                names_str = ", ".join(imp.names) if imp.names else "entire module"
                imp_type = "From import" if imp.is_from_import else "Direct import"
                doc += f"| `{imp.module}` | `{names_str}` | {imp_type} |\n"
            doc += "\n"

        return doc

    async def generate_architecture_doc(self, graph_data: GraphData, repo_info: RepositoryInfo) -> str:
        """Generate high-level architecture documentation incorporating a Mermaid diagram."""
        doc = f"# System Architecture Guide: {repo_info.name}\n\n"
        doc += "This document presents the visual architecture and component relationship map of the system.\n\n"

        # Construct Mermaid.js graph code block
        doc += "## Class & Module Dependency Graph\n\n"
        doc += "Below is the structural dependency layout representing code entity relationships:\n\n"
        doc += "```mermaid\ngraph TD\n"
        
        # Add nodes with appropriate styling labels
        node_styles = []
        for node in graph_data.nodes[:40]:  # Limit diagram size to keep it clean and readable
            label = node.label.replace('"', '\\"')
            doc += f"    {node.id}[\"{label} ({node.node_type})\"]\n"
            
            # Group colors by node type
            if node.node_type == "file":
                node_styles.append(f"style {node.id} fill:#24283b,stroke:#419cff,stroke-width:2px,color:#fff")
            elif node.node_type == "class":
                node_styles.append(f"style {node.id} fill:#24283b,stroke:#bb9af7,stroke-width:2px,color:#fff")
            elif node.node_type == "function":
                node_styles.append(f"style {node.id} fill:#24283b,stroke:#9ece6a,stroke-width:2px,color:#fff")
        
        # Add edges
        for edge in graph_data.edges[:50]:  # Limit edge count
            # Edge labels
            label = edge.edge_type
            doc += f"    {edge.source} -->|{label}| {edge.target}\n"
            
        doc += "\n" + "\n".join(node_styles) + "\n```\n\n"

        doc += "## Core Components breakdown\n\n"
        doc += "The graph identifies the primary functional hubs of this project:\n\n"
        
        # Analyze centrality simply from graph_data (nodes with most incoming/outgoing edges)
        connections: dict[str, int] = {}
        for edge in graph_data.edges:
            connections[edge.source] = connections.get(edge.source, 0) + 1
            connections[edge.target] = connections.get(edge.target, 0) + 1

        sorted_hubs = sorted(connections.items(), key=lambda x: x[1], reverse=True)[:5]
        doc += "### Key Architecture Hubs\n\n"
        doc += "| Entity Name | Degree Connections | Role in Repository |\n"
        doc += "| --- | --- | --- |\n"
        for hub, count in sorted_hubs:
            doc += f"| `{hub}` | {count} connections | Central architectural unit |\n"
        doc += "\n"

        return doc

    # ── Private formatters ──────────────────────────────────────────────

    def _format_class_doc(self, cls: ClassInfo) -> str:
        """Format ClassInfo metadata as Markdown."""
        bases_str = f" inherits from ({', '.join(cls.bases)})" if cls.bases else ""
        doc = f"### Class `class {cls.name}`{bases_str}\n\n"
        doc += f"**Lines**: {cls.start_line} - {cls.end_line}\n\n"
        if cls.docstring:
            doc += f"{cls.docstring}\n\n"
        else:
            doc += "*No class-level documentation provided.*\n\n"

        if cls.methods:
            doc += "#### Methods\n\n"
            for m in cls.methods:
                doc += f"- **`def {m.name}({', '.join(m.args)})`**\n"
                if m.docstring:
                    indented_doc = "\n".join(f"  > {line}" for line in m.docstring.splitlines())
                    doc += f"{indented_doc}\n"
            doc += "\n"

        return doc

    def _format_function_doc(self, func: FunctionInfo) -> str:
        """Format FunctionInfo metadata as Markdown."""
        doc = f"### Function `def {func.name}({', '.join(func.args)})`\n\n"
        doc += f"**Lines**: {func.start_line} - {func.end_line}\n\n"
        if func.docstring:
            doc += f"{func.docstring}\n\n"
        else:
            doc += "*No function-level documentation provided.*\n\n"
        return doc

    def _fallback_repository_overview(self, repo_info: RepositoryInfo, parsed_files: dict[str, ParsedFile]) -> str:
        """Create a structural Markdown description if LLM model is unavailable."""
        doc = f"# Repository Technical Overview: `{repo_info.name}`\n\n"
        doc += f"This overview was automatically compiled by the parser engine.\n\n"
        doc += "## Repository Metrics\n\n"
        doc += f"- **Location**: `{repo_info.path}`\n"
        doc += f"- **Files Indexed**: {repo_info.total_files}\n"
        doc += f"- **Total Line Count**: {repo_info.total_lines}\n"
        doc += f"- **Scan Timestamp**: {repo_info.scanned_at}\n\n"
        
        doc += "## Source Code Inventory\n\n"
        doc += "| File Path | Classes | Functions | Language |\n"
        doc += "| --- | --- | --- | --- |\n"
        for path, parsed in sorted(parsed_files.items()):
            classes = ", ".join(f"`{c.name}`" for c in parsed.classes) or "*none*"
            funcs = ", ".join(f"`{f.name}`" for f in parsed.functions) or "*none*"
            doc += f"| `{path}` | {classes} | {funcs} | {parsed.language} |\n"
            
        return doc

    # ── New v2 doc types ─────────────────────────────────────────────────

    async def generate_api_reference(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> str:
        """Generate a comprehensive API reference document listing all public entities."""
        doc = "# API Reference\n\n"
        doc += "Auto-generated reference of all public classes, functions, and methods.\n\n"
        doc += "---\n\n"

        total_classes = 0
        total_functions = 0
        total_methods = 0

        for path in sorted(parsed_files.keys()):
            pf = parsed_files[path]
            has_entities = bool(pf.classes or pf.functions)
            if not has_entities:
                continue

            doc += f"## `{path}`\n\n"

            if pf.module_docstring:
                doc += f"> {pf.module_docstring}\n\n"

            # Classes
            for cls in pf.classes:
                total_classes += 1
                bases = f"({', '.join(cls.bases)})" if cls.bases else ""
                doc += f"### `class {cls.name}{bases}`\n\n"
                doc += f"**Lines** {cls.start_line}–{cls.end_line}"
                if cls.decorators:
                    doc += f" | **Decorators** `{'`, `'.join(cls.decorators)}`"
                doc += "\n\n"
                if cls.docstring:
                    doc += f"{cls.docstring}\n\n"

                if cls.methods:
                    doc += "| Method | Arguments | Lines | Documented |\n"
                    doc += "| --- | --- | --- | --- |\n"
                    for m in cls.methods:
                        total_methods += 1
                        args = ", ".join(m.args[:5])
                        if len(m.args) > 5:
                            args += ", ..."
                        has_doc = "✓" if m.docstring else "✗"
                        doc += f"| `{m.name}` | `{args}` | {m.start_line}–{m.end_line} | {has_doc} |\n"
                    doc += "\n"

            # Standalone functions
            for func in pf.functions:
                total_functions += 1
                args = ", ".join(func.args[:5])
                if len(func.args) > 5:
                    args += ", ..."
                ret = f" → `{func.return_type}`" if func.return_type else ""
                doc += f"### `def {func.name}({args})`{ret}\n\n"
                doc += f"**Lines** {func.start_line}–{func.end_line}\n\n"
                if func.docstring:
                    doc += f"{func.docstring}\n\n"

            doc += "---\n\n"

        # Summary header
        summary = (
            f"**Total**: {total_classes} classes, {total_functions} functions, "
            f"{total_methods} methods across {len(parsed_files)} files.\n\n---\n\n"
        )
        doc = doc.replace("---\n\n", summary, 1)

        return doc

    async def generate_dependency_map(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> str:
        """Generate a Mermaid import dependency map document."""
        doc = "# Import Dependency Map\n\n"
        doc += "Visual map of all inter-module imports in the repository.\n\n"

        # Gather all imports
        import_pairs: list[tuple[str, str]] = []
        internal_modules: set[str] = set()

        # Normalize file paths to module names
        for path in parsed_files:
            module_name = path.replace("\\", "/").replace("/", ".").rstrip(".py")
            internal_modules.add(module_name)

        for path, pf in parsed_files.items():
            source = path.replace("\\", "/").split("/")[-1].replace(".py", "")
            for imp in pf.imports:
                target = imp.module.split(".")[-1]
                if source != target:
                    import_pairs.append((source, target))

        # Deduplicate
        unique_pairs = list(set(import_pairs))

        if unique_pairs:
            doc += "```mermaid\ngraph LR\n"
            for src, tgt in unique_pairs[:60]:  # Cap for readability
                doc += f"    {src} --> {tgt}\n"
            doc += "```\n\n"
        else:
            doc += "*No inter-module imports detected.*\n\n"

        # Import statistics table
        import_counts: dict[str, int] = {}
        for _, tgt in unique_pairs:
            import_counts[tgt] = import_counts.get(tgt, 0) + 1

        if import_counts:
            doc += "## Most Imported Modules\n\n"
            doc += "| Module | Import Count |\n"
            doc += "| --- | --- |\n"
            for mod, count in sorted(import_counts.items(), key=lambda x: x[1], reverse=True)[:15]:
                doc += f"| `{mod}` | {count} |\n"
            doc += "\n"

        return doc

