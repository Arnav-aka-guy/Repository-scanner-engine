"""Change Impact Analysis Service.

Determines the ripple effect of modifying files, functions, or classes across a repository.
Uses the unified codebase dependency graph to trace direct and indirect dependents,
callers, callees, shared classes, API consumers, and related automated tests,
producing an explainable, measurable risk score.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import networkx as nx

from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


@dataclass
class ChangedSymbol:
    """A changed function, method, or class."""

    name: str
    kind: str  # "function", "class", "method"
    file_path: str
    start_line: int = 1
    end_line: int = 1


@dataclass
class AffectedModule:
    """A module or file impacted by the proposed changes."""

    file_path: str
    impact_type: str  # "direct", "indirect", "api_consumer", "shared_class"
    distance: int  # Hops from the changed source
    symbols_affected: list[str] = field(default_factory=list)
    reason: str = ""


@dataclass
class RegressionRisk:
    """A potential risk or failure mode identified by static graph analysis."""

    risk_level: str  # "Critical", "High", "Medium", "Low"
    category: str  # "untested_dependency", "api_breakage", "cascading_coupling", "circular_dependency"
    description: str
    target_module: str


@dataclass
class ChangeImpactReport:
    """Complete structured report of change impact analysis."""

    target_files: list[str]
    target_symbols: list[str]
    risk_score: int  # 0 to 100
    risk_level: str  # "Critical", "High", "Medium", "Low"
    risk_explanation: str
    score_breakdown: dict[str, Any]
    directly_affected_modules: list[AffectedModule]
    indirectly_affected_modules: list[AffectedModule]
    api_consumers: list[str]
    shared_classes: list[str]
    callers: list[str]
    callees: list[str]
    related_test_files: list[str]
    recommended_tests: list[str]
    regression_risks: list[RegressionRisk]
    graph_nodes: list[dict[str, Any]]
    graph_edges: list[dict[str, Any]]


class ChangeImpactService:
    """Computes explainable change impact analysis using codebase dependency graphs."""

    @staticmethod
    def _is_test_file(path_str: str) -> bool:
        norm = path_str.replace("\\", "/").lower()
        base = Path(norm).name
        return "test" in base or "spec" in base or "/tests/" in norm or "/test/" in norm or "/__tests__/" in norm

    @staticmethod
    def _is_api_consumer(path_str: str) -> bool:
        norm = path_str.replace("\\", "/").lower()
        return (
            norm.startswith("api/")
            or "/api/" in norm
            or norm.startswith("routes/")
            or "/routes/" in norm
            or norm.startswith("endpoints/")
            or "/endpoints/" in norm
            or norm.startswith("controllers/")
            or "/controllers/" in norm
            or "router" in norm
            or "route." in norm
        )

    def analyze_impact(
        self,
        graph: nx.DiGraph,
        parsed_files: dict[str, ParsedFile],
        target_files: list[str],
        target_symbols: list[str] | None = None,
    ) -> ChangeImpactReport:
        """Perform comprehensive change impact analysis."""
        norm_targets = [f.replace("\\", "/").rstrip("/").lower() for f in target_files]
        target_symbols = target_symbols or []

        # Find matching graph nodes for targets
        matched_target_nodes: set[str] = set()
        for node in graph.nodes:
            norm_node = node.replace("\\", "/").lower()
            for t in norm_targets:
                if (
                    norm_node == t
                    or norm_node.endswith("/" + t)
                    or norm_node.endswith(t)
                    or Path(norm_node).name == Path(t).name
                ):
                    matched_target_nodes.add(node)

        # Direct and indirect dependents via reverse graph
        reversed_g = graph.reverse()

        direct_dependents: set[str] = set()
        for t_node in matched_target_nodes:
            direct_dependents.update(graph.predecessors(t_node))
        direct_dependents.difference_update(matched_target_nodes)

        indirect_dependents: set[str] = set()
        for t_node in matched_target_nodes:
            try:
                desc = nx.descendants(reversed_g, t_node)
                indirect_dependents.update(desc)
            except Exception:
                pass
        indirect_dependents.difference_update(matched_target_nodes)
        indirect_dependents.difference_update(direct_dependents)

        # Distinguish callers and callees
        callers: list[str] = sorted(direct_dependents)
        callees: set[str] = set()
        for t_node in matched_target_nodes:
            callees.update(graph.successors(t_node))
        callees.difference_update(matched_target_nodes)

        # Trace shared classes / inheritance
        shared_classes: set[str] = set()
        for pf in parsed_files.values():
            for cls in pf.classes:
                for base in cls.bases:
                    if any(t in base.lower() for t in norm_targets) or any(
                        s.lower() == base.lower() for s in target_symbols
                    ):
                        shared_classes.add(f"{cls.name} (extends {base} in {pf.file_path})")

        # Classify affected modules
        directly_affected: list[AffectedModule] = []
        for d in sorted(direct_dependents):
            is_api = self._is_api_consumer(d)
            directly_affected.append(
                AffectedModule(
                    file_path=d,
                    impact_type="api_consumer" if is_api else "direct",
                    distance=1,
                    reason="Imports or directly invokes symbols from changed target",
                )
            )

        indirectly_affected: list[AffectedModule] = []
        for ind in sorted(indirect_dependents):
            # Calculate shortest path distance
            min_dist = 2
            for t_node in matched_target_nodes:
                try:
                    if nx.has_path(reversed_g, t_node, ind):
                        p = nx.shortest_path(reversed_g, t_node, ind)
                        min_dist = max(2, len(p) - 1)
                        break
                except Exception:
                    pass
            indirectly_affected.append(
                AffectedModule(
                    file_path=ind,
                    impact_type="indirect",
                    distance=min_dist,
                    reason=f"Transitive dependency ({min_dist} hops away)",
                )
            )

        # Identify API consumers and Test files
        all_affected = list(direct_dependents | indirect_dependents)
        api_consumers: list[str] = [m for m in all_affected if self._is_api_consumer(m)]
        related_test_files: list[str] = [m for m in all_affected if self._is_test_file(m)]

        # Also search parsed files for tests that import the target even if not in graph
        for fpath, pf in parsed_files.items():
            if self._is_test_file(fpath) and fpath not in related_test_files:
                for imp in pf.imports:
                    if any(t in imp.module.lower() for t in norm_targets):
                        related_test_files.append(fpath)
                        break

        recommended_tests = sorted(set(related_test_files))

        # Formulate regression risks
        regression_risks: list[RegressionRisk] = []
        if api_consumers:
            regression_risks.append(
                RegressionRisk(
                    risk_level="High" if len(api_consumers) > 3 else "Medium",
                    category="api_breakage",
                    description=f"{len(api_consumers)} API route/controller modules depend on these changes. Signature alterations will break external clients.",
                    target_module=", ".join(api_consumers[:3]),
                )
            )

        untested_direct = [d for d in direct_dependents if not self._is_test_file(d)]
        if untested_direct and not related_test_files:
            regression_risks.append(
                RegressionRisk(
                    risk_level="High",
                    category="untested_dependency",
                    description="No automated test files were identified for the affected dependency tree. Manual regression testing is required.",
                    target_module=", ".join(untested_direct[:3]),
                )
            )

        if len(direct_dependents) >= 8:
            regression_risks.append(
                RegressionRisk(
                    risk_level="Critical",
                    category="cascading_coupling",
                    description=f"High fan-out coupling ({len(direct_dependents)} direct dependents). A breaking change will cause wide ripple effects.",
                    target_module=target_files[0] if target_files else "target",
                )
            )

        # ── Calculate Explainable Risk Score (0 - 100) ───────────────────
        # Components:
        # 1. Direct fan-out: up to 35 points (3.5 pts per direct dependent)
        # 2. Indirect ripple: up to 20 points (1.5 pts per indirect dependent)
        # 3. API surface exposure: up to 25 points (5 pts per API consumer)
        # 4. Test protection: 0-20 points (20 pts if 0 tests, 10 if test ratio < 0.5)
        pts_direct = min(35, round(len(direct_dependents) * 3.5))
        pts_indirect = min(20, round(len(indirect_dependents) * 1.5))
        pts_api = min(25, len(api_consumers) * 5)

        total_affected_count = len(direct_dependents) + len(indirect_dependents)
        pts_test = 0
        if total_affected_count > 0:
            if len(related_test_files) == 0:
                pts_test = 20
            elif len(related_test_files) / total_affected_count < 0.5:
                pts_test = 10

        raw_score = pts_direct + pts_indirect + pts_api + pts_test
        risk_score = min(100, max(0, raw_score))

        if risk_score >= 70:
            risk_level = "Critical"
        elif risk_score >= 45:
            risk_level = "High"
        elif risk_score >= 20:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        risk_explanation = (
            f"Risk Score {risk_score}/100 ({risk_level}): "
            f"{len(direct_dependents)} direct dependents (+{pts_direct} pts), "
            f"{len(indirect_dependents)} indirect dependents (+{pts_indirect} pts), "
            f"{len(api_consumers)} exposed API consumers (+{pts_api} pts), "
            f"test coverage risk (+{pts_test} pts)."
        )

        score_breakdown = {
            "direct_dependents_score": pts_direct,
            "indirect_dependents_score": pts_indirect,
            "api_exposure_score": pts_api,
            "test_deficit_score": pts_test,
            "total_score": risk_score,
            "formula": "min(100, (direct * 3.5) + (indirect * 1.5) + (api * 5) + test_deficit)",
        }

        # Build subgraph visualization nodes & edges
        viz_nodes: list[dict[str, Any]] = []
        viz_edges: list[dict[str, Any]] = []

        all_viz_node_ids = set(matched_target_nodes) | direct_dependents | indirect_dependents
        # Keep subgraph manageable (cap at 40 nodes)
        if len(all_viz_node_ids) > 40:
            all_viz_node_ids = (
                set(matched_target_nodes) | set(list(direct_dependents)[:25]) | set(list(indirect_dependents)[:10])
            )

        for nid in all_viz_node_ids:
            is_target = nid in matched_target_nodes
            is_api = self._is_api_consumer(nid)
            is_test = self._is_test_file(nid)
            is_direct = nid in direct_dependents
            node_role = (
                "target"
                if is_target
                else "api_consumer"
                if is_api
                else "test"
                if is_test
                else "direct"
                if is_direct
                else "indirect"
            )
            viz_nodes.append(
                {
                    "id": nid,
                    "label": Path(nid).name or nid,
                    "file_path": nid,
                    "role": node_role,
                }
            )

        subgraph = graph.subgraph(all_viz_node_ids)
        for u, v in subgraph.edges:
            viz_edges.append({"source": u, "target": v})

        return ChangeImpactReport(
            target_files=target_files,
            target_symbols=target_symbols,
            risk_score=risk_score,
            risk_level=risk_level,
            risk_explanation=risk_explanation,
            score_breakdown=score_breakdown,
            directly_affected_modules=directly_affected,
            indirectly_affected_modules=indirectly_affected,
            api_consumers=api_consumers,
            shared_classes=sorted(shared_classes),
            callers=callers,
            callees=sorted(callees),
            related_test_files=related_test_files,
            recommended_tests=recommended_tests,
            regression_risks=regression_risks,
            graph_nodes=viz_nodes,
            graph_edges=viz_edges,
        )

    @staticmethod
    def generate_markdown_report(report: ChangeImpactReport) -> str:
        """Format the impact report as a GitHub-ready markdown document."""
        lines = [
            f"# Change Impact Analysis Report: {', '.join(report.target_files)}",
            "",
            f"**Overall Risk:** **{report.risk_level.upper()}** ({report.risk_score}/100)",
            f"> {report.risk_explanation}",
            "",
            "## 1. Summary of Scope",
            f"- **Target Files:** {', '.join(report.target_files)}",
            f"- **Direct Dependents:** {len(report.directly_affected_modules)}",
            f"- **Indirect Dependents:** {len(report.indirectly_affected_modules)}",
            f"- **API Consumers:** {len(report.api_consumers)}",
            f"- **Related Test Suites:** {len(report.recommended_tests)}",
            "",
            "## 2. Regression Risks",
        ]

        if not report.regression_risks:
            lines.append("No critical regression risks detected.")
        else:
            for r in report.regression_risks:
                lines.append(f"- **[{r.risk_level}] {r.category}**: {r.description} (`{r.target_module}`)")

        lines.extend(
            [
                "",
                "## 3. Recommended Tests to Execute",
            ]
        )
        if report.recommended_tests:
            for t in report.recommended_tests:
                lines.append(f"- [ ] `{t}`")
        else:
            lines.append(
                "*No automated test files found directly covering these components. Manual verification required.*"
            )

        lines.extend(
            [
                "",
                "## 4. Directly Affected Modules",
            ]
        )
        for mod in report.directly_affected_modules[:15]:
            lines.append(f"- `{mod.file_path}` ({mod.impact_type}) — {mod.reason}")

        if len(report.directly_affected_modules) > 15:
            lines.append(f"*...and {len(report.directly_affected_modules) - 15} more modules.*")

        return "\n".join(lines)


# Singleton
_impact_service: ChangeImpactService | None = None


def get_change_impact_service() -> ChangeImpactService:
    """Return singleton ChangeImpactService."""
    global _impact_service  # noqa: PLW0603
    if _impact_service is None:
        _impact_service = ChangeImpactService()
    return _impact_service
