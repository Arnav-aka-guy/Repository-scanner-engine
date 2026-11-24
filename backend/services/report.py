"""Shareable repository report: one self-contained HTML file.

Built only from data the app already computes (scan stats, health score and
graph analysis), so it costs nothing to generate and always matches the UI.
Paths are made relative to the repository root so no server folders leak.
"""

from __future__ import annotations

import html
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
SEVERITY_COLOR = {
    "critical": "#FF5C7A",
    "high": "#FF9F43",
    "medium": "#FFB020",
    "low": "#9D8CFF",
    "info": "#9A9AA3",
}
STATUS_COLOR = {"Healthy": "#3DDC97", "Fair": "#FFB020", "At Risk": "#FF5C7A"}


def _rel(path: str, root: Path) -> str:
    """Return *path* relative to the repo root, keeping any ::symbol suffix."""
    if not path:
        return ""
    file_part, sep, symbol = path.partition("::")
    try:
        rel = Path(file_part).resolve().relative_to(root).as_posix()
    except (ValueError, OSError):
        rel = Path(file_part).name
    return f"{rel}{sep}{symbol}"


def _e(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _wrap_path(path: str) -> str:
    """Escape a path and let it wrap after slashes instead of mid-word."""
    return _e(path).replace("/", "/<wbr>").replace("::", "::<wbr>")


def _grade_color(score: float) -> str:
    if score >= 85:
        return "#3DDC97"
    if score >= 70:
        return "#FFB020"
    return "#FF5C7A"


def build_report_html(
    *,
    repo_name: str,
    repo_root: Path,
    source: str,
    total_files: int,
    total_lines: int,
    languages: dict[str, int],
    health: dict[str, Any],
    analysis: dict[str, Any] | None,
    generated_at: datetime | None = None,
) -> str:
    """Render the report. All inputs are plain data; nothing here touches the disk."""
    root = repo_root.resolve()
    when = (generated_at or datetime.now(UTC)).strftime("%d %b %Y, %H:%M UTC")
    score = float(health.get("total_score", 0))
    grade = health.get("grade", "?")

    # Languages
    lang_items = sorted(languages.items(), key=lambda kv: kv[1], reverse=True)
    lang_total = sum(c for _, c in lang_items) or 1
    palette = ["#35D7FF", "#9D8CFF", "#3DDC97", "#FFB020", "#FF5C7A", "#FF9F43", "#9A9AA3"]
    bar = "".join(
        f'<span style="width:{c / lang_total * 100:.2f}%;background:{palette[i % len(palette)]}" '
        f'title="{_e(lang)}: {c} files"></span>'
        for i, (lang, c) in enumerate(lang_items[:7])
    )
    legend = "".join(
        f'<li><i style="background:{palette[i % len(palette)]}"></i>{_e(lang)} <b>{c}</b></li>'
        for i, (lang, c) in enumerate(lang_items[:7])
    )

    # Health dimensions
    dims = "".join(
        f"""<div class="dim">
  <div class="dim-name">{_e(d.get("name"))}</div>
  <div class="dim-num">{d.get("score", 0):g}<span> / {d.get("max_score", 0):g}</span></div>
  <div class="meter"><span style="width:{(d.get("score", 0) / (d.get("max_score") or 1)) * 100:.1f}%;background:{STATUS_COLOR.get(d.get("status", ""), "#9A9AA3")}"></span></div>
  <div class="dim-status" style="color:{STATUS_COLOR.get(d.get("status", ""), "#9A9AA3")}">{_e(d.get("status", ""))}</div>
</div>"""
        for d in health.get("dimensions", [])
    )

    # Findings: most severe first, one per file+rule, top 12
    seen: set[tuple[str, str]] = set()
    findings: list[dict[str, Any]] = []
    for f in sorted(
        (f for f in health.get("findings", []) if not f.get("dismissed")),
        key=lambda f: (
            SEVERITY_ORDER.get(str(f.get("severity", "info")).lower(), 9),
            -float(f.get("score_effect") or 0),
        ),
    ):
        key = (str(f.get("file_path")), str(f.get("rule_id")))
        if key in seen:
            continue
        seen.add(key)
        findings.append(f)
        if len(findings) == 12:
            break
    finding_rows = "".join(
        f"""<tr>
  <td><span class="sev" style="color:{SEVERITY_COLOR.get(str(f.get("severity", "")).lower(), "#9A9AA3")}">{_e(str(f.get("severity", "")).capitalize())}</span></td>
  <td><div class="f-title">{_e(f.get("title", ""))}</div><div class="f-why">{_e(f.get("why_it_matters", ""))}</div></td>
  <td class="mono">{_wrap_path(_rel(str(f.get("file_path", "")), root))}{(":" + str(f["line_number"])) if f.get("line_number") else ""}</td>
</tr>"""
        for f in findings
    )
    findings_block = (
        f'<table class="findings"><thead><tr><th>Severity</th><th>Issue</th><th>Where</th></tr></thead><tbody>{finding_rows}</tbody></table>'
        if findings
        else '<p class="muted">No open findings. Nice.</p>'
    )

    # Circular dependencies
    cycles = (analysis or {}).get("circular_dependencies", []) or []
    cycle_items = "".join(
        '<li class="mono">' + " &rarr; ".join(_wrap_path(_rel(n, root)) for n in cycle) + " &rarr; &#8617;</li>"
        for cycle in cycles[:6]
    )
    cycles_block = (
        f'<p>{len(cycles)} import loop{"s" if len(cycles) != 1 else ""} found. Loops make code harder to change and test.</p><ul class="cycles">{cycle_items}</ul>'
        if cycles
        else '<p class="muted">No circular imports found.</p>'
    )
    metrics = (analysis or {}).get("complexity_metrics", {}) or {}
    graph_line = ""
    if metrics:
        graph_line = (
            f'<p class="muted">Dependency graph: {int(metrics.get("node_count", 0)):,} symbols, '
            f"{int(metrics.get('edge_count', 0)):,} links, {int(metrics.get('connected_components', 0))} separate groups.</p>"
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(repo_name)} · Repository report</title>
<style>
:root {{ --bg:#000; --surface:#0D0D10; --line:#222228; --fg:#F4F4F5; --fg2:#B4B4BC; --fg3:#9A9AA3; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 "Hanken Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif; }}
.wrap {{ max-width:960px; margin:0 auto; padding:48px 24px 64px; }}
.beam {{ height:3px; background:linear-gradient(90deg,#35D7FF,#9D8CFF 45%,#FF5C7A 75%,#FFB020); }}
header .kicker {{ color:var(--fg3); font-size:13px; }}
h1 {{ font-size:40px; line-height:1.1; letter-spacing:-0.02em; margin:6px 0 4px; }}
h2 {{ font-size:20px; letter-spacing:-0.01em; margin:0 0 14px; }}
.src {{ color:var(--fg3); font-size:13px; word-break:break-all; }}
.mono {{ font-family:"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; font-size:12.5px; }}
.muted {{ color:var(--fg3); }}
section {{ margin-top:36px; }}
.top {{ display:grid; grid-template-columns:220px 1fr; gap:20px; margin-top:28px; }}
.card {{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:22px; }}
.score {{ font-size:64px; font-weight:700; line-height:1; letter-spacing:-0.03em; }}
.score small {{ font-size:18px; color:var(--fg3); font-weight:500; }}
.grade {{ display:inline-block; margin-top:10px; padding:2px 10px; border-radius:999px; border:1px solid currentColor; font-weight:600; font-size:13px; }}
.stats {{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }}
.stat b {{ display:block; font-size:26px; letter-spacing:-0.02em; }}
.stat span {{ color:var(--fg3); font-size:13px; }}
.langbar {{ display:flex; height:8px; border-radius:99px; overflow:hidden; background:#1B1B20; margin:18px 0 10px; }}
.langbar span {{ display:block; height:100%; }}
.legend {{ list-style:none; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:6px 16px; font-size:13px; color:var(--fg2); }}
.legend i {{ display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }}
.legend b {{ color:var(--fg3); font-weight:500; }}
.dims {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }}
.dim {{ background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px; }}
.dim-name {{ font-weight:600; font-size:14px; }}
.dim-num {{ font-size:24px; font-weight:700; letter-spacing:-0.02em; margin-top:4px; font-variant-numeric:tabular-nums; }}
.dim-num span {{ font-size:13px; color:var(--fg3); font-weight:500; }}
.meter {{ height:5px; background:#1B1B20; border-radius:99px; margin:10px 0 8px; overflow:hidden; }}
.meter span {{ display:block; height:100%; border-radius:99px; }}
.dim-status {{ font-size:12.5px; }}
table.findings {{ width:100%; border-collapse:collapse; font-size:14px; }}
.findings th {{ text-align:left; color:var(--fg3); font-weight:500; font-size:12.5px; padding:0 10px 8px 0; border-bottom:1px solid var(--line); }}
.findings td {{ vertical-align:top; padding:12px 10px 12px 0; border-bottom:1px solid #18181C; }}
.findings td:last-child {{ color:var(--fg2); width:34%; }}
.sev {{ font-weight:600; font-size:13px; }}
.f-title {{ font-weight:600; }}
.f-why {{ color:var(--fg3); font-size:13px; margin-top:2px; }}
ul.cycles {{ padding-left:18px; color:var(--fg2); }}
ul.cycles li {{ margin:6px 0; }}
footer {{ margin-top:48px; padding-top:18px; border-top:1px solid var(--line); color:var(--fg3); font-size:13px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }}
footer a {{ color:var(--fg2); }}
@media (max-width:640px) {{ .top {{ grid-template-columns:1fr; }} .stats {{ grid-template-columns:1fr 1fr; }} h1 {{ font-size:30px; }} }}
@media print {{
  :root {{ --bg:#fff; --surface:#fff; --line:#ddd; --fg:#111; --fg2:#333; --fg3:#666; }}
  .beam {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  .wrap {{ padding:0; }} section {{ break-inside:avoid; }}
}}
</style>
</head>
<body>
<div class="beam"></div>
<div class="wrap">
<header>
  <div class="kicker">Repository report</div>
  <h1>{_e(repo_name)}</h1>
  <div class="src mono">{_e(source)}</div>
</header>

<div class="top">
  <div class="card">
    <div class="muted" style="font-size:13px">Health score</div>
    <div class="score" style="color:{_grade_color(score)}">{score:g}<small> / 100</small></div>
    <span class="grade" style="color:{_grade_color(score)}">Grade {_e(grade)}</span>
  </div>
  <div class="card">
    <div class="stats">
      <div class="stat"><b>{total_files:,}</b><span>files</span></div>
      <div class="stat"><b>{total_lines:,}</b><span>lines</span></div>
      <div class="stat"><b>{len(languages)}</b><span>languages</span></div>
    </div>
    <div class="langbar">{bar}</div>
    <ul class="legend">{legend}</ul>
  </div>
</div>

<section>
  <h2>Score breakdown</h2>
  <p class="muted" style="margin-top:-6px">{_e(health.get("summary", ""))}</p>
  <div class="dims">{dims}</div>
</section>

<section>
  <h2>What to fix first</h2>
  {findings_block}
</section>

<section>
  <h2>Circular imports</h2>
  {cycles_block}
  {graph_line}
</section>

<footer>
  <span>Generated {when}</span>
  <span>Made with <a href="https://github.com/Arnav-aka-guy/Repository-scanner-engine">Repository Scanner</a>, free and open source</span>
</footer>
</div>
</body>
</html>
"""
