"""Orchestration service for generating and exporting repository documentation."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from backend.core.config import settings
from backend.documentation.generator import DocumentationGenerator

if TYPE_CHECKING:
    from backend.graph.service import GraphService
    from backend.parser.service import ParserService

logger = logging.getLogger(__name__)


class DocumentationService:
    """High-level service interface for managing, compiling, and exporting technical documents."""

    def __init__(
        self,
        llm_service: Any,
        parser_service: ParserService,
        graph_service: GraphService,
    ) -> None:
        self.parser_service = parser_service
        self.graph_service = graph_service
        self.generator = DocumentationGenerator(llm_service)

    async def generate_full_docs(self, repo_path: str) -> dict[str, Any]:
        """Compile a full documentation suite for a repository.

        Returns:
            Dictionary containing "overview" string, "architecture" string,
            and a "modules" dict mapping relative file paths to their module docs.
        """
        logger.info("Starting documentation suite compilation for: %s", repo_path)
        
        # 1. Fetch scanned repo info and parsed modules
        repo_info = await self.parser_service.scan_repository(repo_path)
        parsed_files = await self.parser_service.parse_repository(repo_path)

        # 2. Compile Overview (onboarding guide)
        overview_doc = await self.generator.generate_repository_overview(repo_info, parsed_files)

        # 3. Compile System Architecture
        graph_data = await self.graph_service.get_cytoscape_data(parsed_files, graph_type="full")
        # Map Cytoscape output to the generator's expected GraphData structure
        # Cytoscape format: {"elements": [{"data": {...}, "group": "nodes"|"edges"}, ...]}
        from backend.graph.models import GraphData, GraphEdge, GraphNode
        elements = graph_data.get("elements", [])
        formatted_nodes = [
            GraphNode(
                id=el["data"]["id"],
                label=el["data"]["label"],
                node_type=el["data"]["node_type"],
                file_path=el["data"].get("file_path", ""),
                metadata=el["data"].get("metadata", {})
            ) for el in elements if el.get("group") == "nodes"
        ]
        formatted_edges = [
            GraphEdge(
                source=el["data"]["source"],
                target=el["data"]["target"],
                edge_type=el["data"]["edge_type"],
                metadata=el["data"].get("metadata", {})
            ) for el in elements if el.get("group") == "edges"
        ]
        graph_obj = GraphData(nodes=formatted_nodes, edges=formatted_edges)
        architecture_doc = await self.generator.generate_architecture_doc(graph_obj, repo_info)

        # 4. Compile Module references
        modules_docs = {}
        for path, parsed in parsed_files.items():
            modules_docs[path] = await self.generator.generate_module_docs(path, parsed)

        # 5. Compile API Reference
        api_reference = await self.generator.generate_api_reference(parsed_files)

        # 6. Compile Dependency Map
        dependency_map = await self.generator.generate_dependency_map(parsed_files)

        logger.info("Documentation suite successfully compiled.")
        
        return {
            "overview": overview_doc,
            "architecture": architecture_doc,
            "modules": modules_docs,
            "api_reference": api_reference,
            "dependency_map": dependency_map,
        }

    async def export_markdown(self, docs: dict[str, Any], repo_name: str) -> Path:
        """Write compiled documentation to the cache directory as Markdown files.

        Returns:
            The Path to the exported directory.
        """
        export_dir = Path(settings.docs_dir) / repo_name
        export_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Exporting Markdown documents to: %s", export_dir)

        # Overview README
        with open(export_dir / "README.md", "w", encoding="utf-8") as f:
            f.write(docs["overview"])

        # System Architecture
        with open(export_dir / "ARCHITECTURE.md", "w", encoding="utf-8") as f:
            f.write(docs["architecture"])

        # Module references
        modules_dir = export_dir / "modules"
        modules_dir.mkdir(exist_ok=True)
        for filepath, content in docs["modules"].items():
            safe_filename = filepath.replace("/", "_").replace("\\", "_").replace(":", "_")
            if not safe_filename.endswith(".md"):
                safe_filename += ".md"
            with open(modules_dir / safe_filename, "w", encoding="utf-8") as f:
                f.write(content)

        return export_dir

    async def export_html(self, docs: dict[str, Any], repo_name: str) -> Path:
        """Write compiled documentation to the cache directory as simple HTML pages."""
        # Simple HTML export - wraps markdown contents inside simple styled containers
        export_dir = Path(settings.docs_dir) / repo_name / "html"
        export_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Exporting HTML documentation to: %s", export_dir)

        # Pre-wrap function helper
        def wrap_html(title: str, markdown_content: str) -> str:
            # Let's keep it extremely clean and readable with Tailwind CDN
            return (
                f"<!DOCTYPE html>\n<html>\n<head>\n"
                f"<meta charset=\"utf-8\">\n"
                f"<title>{title}</title>\n"
                f"<script src=\"https://cdn.tailwindcss.com\"></script>\n"
                f"</head>\n"
                f"<body class=\"bg-slate-900 text-slate-100 p-8\">\n"
                f"<div class=\"max-w-4xl mx-auto bg-slate-800 p-8 rounded-xl shadow-xl border border-slate-700\">\n"
                f"<pre class=\"whitespace-pre-wrap font-sans leading-relaxed text-sm\">"
                f"{markdown_content}"
                f"</pre>\n"
                f"</div>\n"
                f"</body>\n</html>"
            )

        with open(export_dir / "index.html", "w", encoding="utf-8") as f:
            f.write(wrap_html("Overview README", docs["overview"]))

        with open(export_dir / "architecture.html", "w", encoding="utf-8") as f:
            f.write(wrap_html("Architecture Guide", docs["architecture"]))

        return export_dir
