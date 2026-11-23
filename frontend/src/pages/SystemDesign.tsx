import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Route as RouteIcon,
  Sparkles,
  X,
} from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  generateSystemDesign,
  getCachedSystemDesign,
  type DesignDetail,
  type SystemDesignDiagram,
} from '../services/systemDesign';
import { SystemDesignCanvas } from '../components/diagram/SystemDesignCanvas';
import type { SystemDesignLayout } from '../components/diagram/systemDesignLayout';
import { buildDiagramSvg, downloadPng, downloadText, safeFileName } from '../components/diagram/exportDiagram';
import { GROUP_THEME, KIND_ACCENT, KIND_LABEL } from '../components/diagram/diagramTheme';
import { parseServerDate } from '../utils/date';
import { colors, font, radius } from '../design-system/tokens';

const panelSection: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: `1px solid ${colors.border.default}`,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0',
  color: colors.text.secondary,
  marginBottom: 8,
};
const chip: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 7px',
  borderRadius: radius.sm,
  background: colors.bg.surfaceSecondary,
  border: `1px solid ${colors.border.default}`,
  fontSize: 11,
  color: colors.text.primary,
  margin: '0 4px 4px 0',
};

function buttonStyle(primary = false, disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    padding: '0 12px',
    borderRadius: radius.md,
    border: `1px solid ${primary ? 'transparent' : colors.border.default}`,
    background: primary ? colors.text.primary : colors.bg.surface,
    color: primary ? '#000' : colors.text.primary,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    whiteSpace: 'nowrap',
  };
}

const LOADING_STEPS = [
  'Reading the repository structure…',
  'Finding components and how they connect…',
  'Detecting databases, APIs and external services…',
  'Asking Groq to name and explain each part…',
  'Laying out the diagram…',
];

interface ViewProps {
  repoId: number | null;
  repoPath: string | null;
  detail: DesignDetail;
  setDetail: (d: DesignDetail) => void;
  useAi: boolean;
  setUseAi: (v: boolean) => void;
}

/**
 * Outer component: keeps the user's choices and remounts the view whenever the
 * repository or detail level changes, so no stale diagram from another repo can show.
 */
const SystemDesign: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository);
  const repoId = useWorkspaceStore((s) => s.activeRepositoryId);
  const [detail, setDetail] = useState<DesignDetail>('overview');
  const [useAi, setUseAi] = useState(true);
  return (
    <SystemDesignView
      key={`${repoId ?? ''}|${repoPath ?? ''}|${detail}`}
      repoId={repoId}
      repoPath={repoPath}
      detail={detail}
      setDetail={setDetail}
      useAi={useAi}
      setUseAi={setUseAi}
    />
  );
};

const SystemDesignView: React.FC<ViewProps> = ({ repoId, repoPath, detail, setDetail, useAi, setUseAi }) => {
  const hasRepo = repoId != null || Boolean(repoPath);
  const [diagram, setDiagram] = useState<SystemDesignDiagram | null>(null);
  const [loadingCache, setLoadingCache] = useState(hasRepo);
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFlow, setActiveFlow] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const layoutRef = useRef<SystemDesignLayout | null>(null);
  const requestRef = useRef(0);

  const repoRef = useMemo(() => ({ repositoryId: repoId, repoPath }), [repoId, repoPath]);

  // Load the saved diagram once (this view is remounted when the repo or detail level changes).
  useEffect(() => {
    if (!hasRepo) return;
    const controller = new AbortController();
    const ticket = ++requestRef.current;
    getCachedSystemDesign(repoRef, detail, controller.signal)
      .then((cached) => {
        if (ticket === requestRef.current) setDiagram(cached);
      })
      .catch((err: unknown) => {
        if (ticket === requestRef.current && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Could not load the saved diagram.');
        }
      })
      .finally(() => {
        if (ticket === requestRef.current) setLoadingCache(false);
      });
    return () => controller.abort();
  }, [repoRef, detail, hasRepo]);

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1800);
    return () => clearInterval(timer);
  }, [generating]);

  const generate = useCallback(
    async (refresh: boolean) => {
      if (!hasRepo || generating) return;
      const ticket = ++requestRef.current;
      setLoadingStep(0);
      setGenerating(true);
      setError(null);
      try {
        const result = await generateSystemDesign(repoRef, { detail, useAi, refresh });
        if (ticket !== requestRef.current) return;
        setDiagram(result);
        setSelectedId(null);
        setActiveFlow(null);
      } catch (err: unknown) {
        if (ticket === requestRef.current) {
          setError(err instanceof Error ? err.message : 'System design generation failed.');
        }
      } finally {
        if (ticket === requestRef.current) setGenerating(false);
      }
    },
    [hasRepo, generating, repoRef, detail, useAi]
  );

  const selectedNode = useMemo(
    () => diagram?.nodes.find((n) => n.id === selectedId) ?? null,
    [diagram, selectedId]
  );
  const nodeLabel = useCallback((id: string) => diagram?.nodes.find((n) => n.id === id)?.label ?? id, [diagram]);
  const connections = useMemo(() => {
    if (!diagram || !selectedId) return { incoming: [], outgoing: [] };
    return {
      incoming: diagram.edges.filter((e) => e.target === selectedId),
      outgoing: diagram.edges.filter((e) => e.source === selectedId),
    };
  }, [diagram, selectedId]);

  const handleLayout = useCallback((layout: SystemDesignLayout) => {
    layoutRef.current = layout;
  }, []);

  const runExport = async (kind: 'png' | 'svg' | 'mmd' | 'json' | 'copy') => {
    if (!diagram) return;
    setExportOpen(false);
    setExportError(null);
    const base = safeFileName(diagram.title);
    try {
      if (kind === 'mmd') return downloadText(diagram.mermaid, `${base}.mmd`);
      if (kind === 'json') return downloadText(JSON.stringify(diagram, null, 2), `${base}.json`, 'application/json');
      if (kind === 'copy') {
        await navigator.clipboard.writeText(diagram.mermaid);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        return;
      }
      if (!layoutRef.current) throw new Error('The diagram is still being laid out. Try again in a moment.');
      const svg = buildDiagramSvg(diagram, layoutRef.current);
      if (kind === 'svg') return downloadText(svg, `${base}.svg`, 'image/svg+xml');
      await downloadPng(svg, `${base}.png`);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  if (!hasRepo) {
    return (
      <div style={{ padding: 32, color: colors.text.secondary, fontFamily: font.sans }}>
        Open a repository first to draw its system design.
      </div>
    );
  }

  const busy = generating || loadingCache;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: colors.bg.primary,
        color: colors.text.primary,
        fontFamily: font.sans,
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: `1px solid ${colors.border.default}`,
          flexWrap: 'wrap',
        }}
      >
        <Boxes size={18} color={colors.accent.blue} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 200, flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>System Design</span>
          <span style={{ fontSize: 12, color: colors.text.secondary }}>
            A layered diagram of how this project is built, drawn from the code and explained with Groq AI.
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Detail level"
          style={{ display: 'flex', border: `1px solid ${colors.border.default}`, borderRadius: radius.md, overflow: 'hidden' }}
        >
          {(['overview', 'detailed'] as DesignDetail[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={detail === d}
              type="button"
              disabled={busy}
              onClick={() => setDetail(d)}
              style={{
                height: 32,
                padding: '0 12px',
                border: 'none',
                background: detail === d ? colors.bg.surfaceSecondary : 'transparent',
                color: detail === d ? colors.text.primary : colors.text.secondary,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {d === 'overview' ? 'Overview' : 'Detailed'}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: colors.text.secondary }}>
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} disabled={busy} />
          <Sparkles size={13} color={colors.accent.purple} /> Enhance with Groq AI
        </label>

        <button type="button" style={buttonStyle(true, busy)} disabled={busy} onClick={() => generate(Boolean(diagram))}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {diagram ? 'Regenerate' : 'Generate'}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={buttonStyle(false, !diagram)}
            disabled={!diagram}
            onClick={() => setExportOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            <Download size={14} /> Export <ChevronDown size={13} />
          </button>
          {exportOpen && diagram && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: 36,
                zIndex: 30,
                width: 210,
                background: colors.bg.surface,
                border: `1px solid ${colors.border.default}`,
                borderRadius: radius.md,
                boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
                padding: 4,
              }}
            >
              {[
                ['png', 'PNG image (for reports)'],
                ['svg', 'SVG image (sharp, scalable)'],
                ['mmd', 'Mermaid file (.mmd)'],
                ['copy', 'Copy Mermaid code'],
                ['json', 'Diagram data (.json)'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  role="menuitem"
                  type="button"
                  onClick={() => runExport(k as 'png' | 'svg' | 'mmd' | 'json' | 'copy')}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                    border: 'none',
                    background: 'transparent',
                    color: colors.text.primary,
                    fontSize: 12.5,
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {copied && (
          <span style={{ fontSize: 12, color: colors.status.success, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={13} /> Copied
          </span>
        )}
      </div>

      {(error || exportError || (diagram?.warnings?.length ?? 0) > 0) && (
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[error, exportError, ...(diagram?.warnings ?? [])].filter(Boolean).map((msg, i) => (
            <div
              key={i}
              role={i === 0 && error ? 'alert' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: radius.md,
                fontSize: 12.5,
                background: i === 0 && error ? colors.status.dangerSubtle : colors.status.warningSubtle,
                border: `1px solid ${i === 0 && error ? colors.status.dangerBorder : colors.status.warningBorder}`,
              }}
            >
              <AlertTriangle size={14} color={i === 0 && error ? colors.status.danger : colors.status.warning} />
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {diagram ? (
            <SystemDesignCanvas
              diagram={diagram}
              selectedId={selectedId}
              onSelect={setSelectedId}
              flowSteps={activeFlow != null ? diagram.flows[activeFlow]?.steps : null}
              onLayout={handleLayout}
            />
          ) : (
            !busy && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                }}
              >
                <div style={{ maxWidth: 460, textAlign: 'center' }}>
                  <Boxes size={36} color={colors.accent.blue} />
                  <h2 style={{ fontSize: 18, margin: '12px 0 6px' }}>Draw the system design of this project</h2>
                  <p style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 1.55, margin: '0 0 16px' }}>
                    The diagram shows the client, the backend layers, the databases and the outside services, and how
                    they connect. It is built from the real code. Groq AI (if enabled) names and explains each part.
                    Export it as PNG, SVG or Mermaid for your report or exam.
                  </p>
                  <button type="button" style={buttonStyle(true)} onClick={() => generate(false)}>
                    <Sparkles size={14} /> Generate diagram
                  </button>
                </div>
              </div>
            )
          )}
          {busy && (
            <div
              aria-live="polite"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: 'rgba(15,17,21,0.72)',
                zIndex: 10,
              }}
            >
              <Loader2 size={28} className="animate-spin" color={colors.accent.blue} />
              <span style={{ fontSize: 13, color: colors.text.secondary }}>
                {generating ? LOADING_STEPS[useAi ? loadingStep : Math.min(loadingStep, 2)] : 'Loading saved diagram…'}
              </span>
            </div>
          )}
        </div>

        {diagram && (
          <aside
            style={{
              width: 320,
              flexShrink: 0,
              borderLeft: `1px solid ${colors.border.default}`,
              background: colors.bg.surface,
              overflowY: 'auto',
            }}
          >
            {selectedNode ? (
              <div style={panelSection}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ ...sectionTitle, marginBottom: 4, color: KIND_ACCENT[selectedNode.kind] }}>
                    {KIND_LABEL[selectedNode.kind] ?? selectedNode.kind}
                  </div>
                  <button
                    type="button"
                    aria-label="Close details"
                    onClick={() => setSelectedId(null)}
                    style={{ background: 'none', border: 'none', color: colors.text.secondary, cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{selectedNode.label}</div>
                <p style={{ fontSize: 12.5, lineHeight: 1.55, color: colors.text.secondary, margin: '0 0 10px' }}>
                  {selectedNode.description || 'No description.'}
                </p>
                {selectedNode.tech.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {selectedNode.tech.map((t) => (
                      <span key={t} style={chip}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {selectedNode.paths.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={sectionTitle}>Code</div>
                    {selectedNode.paths.map((p) => (
                      <div key={p} style={{ fontFamily: font.mono, fontSize: 11, color: colors.text.secondary }}>
                        {p}
                      </div>
                    ))}
                  </div>
                )}
                {[
                  ['Called by', connections.incoming.map((e) => ({ id: e.source, label: e.label }))],
                  ['Calls', connections.outgoing.map((e) => ({ id: e.target, label: e.label }))],
                ].map(([title, list]) =>
                  (list as { id: string; label: string }[]).length > 0 ? (
                    <div key={title as string} style={{ marginTop: 8 }}>
                      <div style={sectionTitle}>{title as string}</div>
                      {(list as { id: string; label: string }[]).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          style={{
                            display: 'block',
                            background: 'none',
                            border: 'none',
                            padding: '2px 0',
                            color: colors.text.primary,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          {nodeLabel(c.id)}
                          {c.label ? <span style={{ color: colors.text.secondary }}> · {c.label}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            ) : (
              <div style={panelSection}>
                <div style={sectionTitle}>Summary</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{diagram.title}</div>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: colors.text.secondary, margin: 0 }}>
                  {diagram.summary}
                </p>
                <p style={{ fontSize: 11.5, color: colors.text.muted, marginTop: 8 }}>
                  Click any box to see what it does and what it connects to.
                </p>
              </div>
            )}

            {diagram.flows.length > 0 && (
              <div style={panelSection}>
                <div style={sectionTitle}>Request flows</div>
                {diagram.flows.map((f, i) => (
                  <button
                    key={`${f.name}-${i}`}
                    type="button"
                    onClick={() => setActiveFlow(activeFlow === i ? null : i)}
                    aria-pressed={activeFlow === i}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      marginBottom: 6,
                      padding: '8px 10px',
                      borderRadius: radius.md,
                      border: `1px solid ${activeFlow === i ? '#35D7FF' : colors.border.default}`,
                      background: activeFlow === i ? 'rgba(53,215,255,0.08)' : colors.bg.surfaceSecondary,
                      color: colors.text.primary,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
                      <RouteIcon size={13} color="#35D7FF" /> {f.name}
                    </div>
                    {activeFlow === i && (
                      <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: colors.text.secondary }}>
                        {f.steps.map((s, j) => (
                          <li key={`${s}-${j}`}>{nodeLabel(s)}</li>
                        ))}
                      </ol>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div style={panelSection}>
              <div style={sectionTitle}>Legend</div>
              {diagram.groups.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      border: `1.5px dashed ${GROUP_THEME[g.id].stroke}`,
                      background: GROUP_THEME[g.id].fill,
                    }}
                  />
                  <span>{g.label}</span>
                </div>
              ))}
            </div>

            <div style={{ ...panelSection, borderBottom: 'none', fontSize: 11.5, color: colors.text.muted, lineHeight: 1.6 }}>
              <div>
                Made by: {diagram.generated_by === 'analysis' ? 'code analysis' : diagram.generated_by}
                {diagram.cache_hit ? ' (saved)' : ''}
              </div>
              <div>
                {diagram.nodes.length} parts · {diagram.edges.length} connections
              </div>
              {diagram.generated_at && <div>{parseServerDate(diagram.generated_at)?.toLocaleString()}</div>}
              <button
                type="button"
                onClick={() => runExport('copy')}
                style={{ ...buttonStyle(false), marginTop: 8, height: 26, fontSize: 11.5 }}
              >
                <Copy size={12} /> Copy Mermaid
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default SystemDesign;
