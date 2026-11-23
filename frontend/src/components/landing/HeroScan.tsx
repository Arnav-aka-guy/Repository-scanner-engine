import React from 'react';

type Tone = 'ion' | 'iris' | 'mint' | 'amber' | 'rose';

interface MapNode {
  id: string;
  x: number;
  y: number;
  label: string;
  tone: Tone;
  r?: number;
}

const TONE: Record<Tone, string> = {
  ion: '#35D7FF',
  iris: '#9D8CFF',
  mint: '#3DDC97',
  amber: '#FFB020',
  rose: '#FF5C7A',
};

const NODES: MapNode[] = [
  { id: 'ui', x: 70, y: 120, label: 'frontend/App.tsx', tone: 'amber' },
  { id: 'store', x: 110, y: 270, label: 'workspaceStore.ts', tone: 'amber' },
  { id: 'client', x: 250, y: 190, label: 'services/api.ts', tone: 'amber' },
  { id: 'main', x: 400, y: 110, label: 'backend/main.py', tone: 'ion', r: 7 },
  { id: 'routes', x: 410, y: 300, label: 'api/routes.py', tone: 'ion' },
  { id: 'scanner', x: 560, y: 200, label: 'scanner/engine.py', tone: 'iris', r: 8 },
  { id: 'parser', x: 600, y: 70, label: 'ast_parser.py', tone: 'iris' },
  { id: 'graph', x: 700, y: 320, label: 'dependency_graph.py', tone: 'iris' },
  { id: 'health', x: 740, y: 160, label: 'health/score.py', tone: 'rose' },
  { id: 'embed', x: 860, y: 90, label: 'embeddings.py', tone: 'mint' },
  { id: 'vector', x: 880, y: 250, label: 'vector_store.py', tone: 'mint' },
  { id: 'db', x: 840, y: 370, label: 'storage/sqlite.py', tone: 'mint' },
];

const EDGES: Array<[string, string, boolean?]> = [
  ['ui', 'client'],
  ['store', 'client'],
  ['ui', 'store'],
  ['client', 'main'],
  ['client', 'routes'],
  ['main', 'routes'],
  ['routes', 'scanner'],
  ['main', 'scanner'],
  ['scanner', 'parser'],
  ['scanner', 'graph'],
  ['scanner', 'health'],
  ['parser', 'embed'],
  ['graph', 'health', true],
  ['health', 'graph', true],
  ['embed', 'vector'],
  ['scanner', 'vector'],
  ['graph', 'db'],
  ['vector', 'db'],
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const SWEEP = 7;

function curve(a: MapNode, b: MapNode, bend = 0) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + bend;
  return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
}

/** Animated module map: a spectral beam sweeps across and lights each file as it passes. */
export const HeroScan: React.FC = () => (
  <div className="hero-scan relative overflow-hidden rounded-[16px] border border-line bg-surface">
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-ion live-dot" />
        <span className="truncate text-fg-2">
          Scanning <span className="font-medium text-fg">Repository-scanner-engine</span>
        </span>
      </div>
      <div className="hidden items-center gap-4 text-[12px] text-fg-3 sm:flex">
        <Legend color={TONE.amber} label="Frontend" />
        <Legend color={TONE.ion} label="API" />
        <Legend color={TONE.iris} label="Core" />
        <Legend color={TONE.mint} label="Storage" />
      </div>
    </div>

    <svg viewBox="0 0 960 430" className="block h-auto w-full" role="img" aria-label="Animated map of a repository being scanned, with files lighting up as they are indexed">
      <defs>
        <pattern id="hs-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#1E1E24" />
        </pattern>
        <linearGradient id="hs-beam" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#35D7FF" stopOpacity="0" />
          <stop offset="0.7" stopColor="#9D8CFF" stopOpacity="0.10" />
          <stop offset="0.93" stopColor="#FF5C7A" stopOpacity="0.22" />
          <stop offset="1" stopColor="#FFB020" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width="960" height="430" fill="url(#hs-dots)" />

      <g fill="none" strokeWidth="1.25">
        {EDGES.map(([from, to, cycle], i) => {
          const a = byId[from];
          const b = byId[to];
          const d = curve(a, b, cycle ? (from === 'graph' ? 40 : -40) : (i % 2 ? 18 : -18));
          const delay = (Math.max(a.x, b.x) / 960) * SWEEP * 0.82;
          return (
            <path
              key={`${from}-${to}`}
              d={d}
              className="hs-edge"
              stroke={cycle ? TONE.rose : '#3A3A44'}
              strokeDasharray={cycle ? '4 4' : undefined}
              style={{ animationDelay: `${delay}s` }}
            />
          );
        })}
      </g>

      {NODES.map((n) => {
        const delay = (n.x / 960) * SWEEP * 0.82;
        const c = TONE[n.tone];
        const r = n.r ?? 5.5;
        const labelLeft = n.x > 800;
        return (
          <g key={n.id} className="hs-node" style={{ animationDelay: `${delay}s` }}>
            <circle cx={n.x} cy={n.y} r={r + 7} fill={c} opacity="0.12" className="hs-halo" style={{ animationDelay: `${delay}s` }} />
            <circle cx={n.x} cy={n.y} r={r} fill="#0D0D10" stroke={c} strokeWidth="2" />
            <circle cx={n.x} cy={n.y} r={r - 3} fill={c} />
            <text
              x={labelLeft ? n.x - r - 10 : n.x + r + 10}
              y={n.y + 4}
              textAnchor={labelLeft ? 'end' : 'start'}
              fontFamily="'JetBrains Mono', monospace"
              fontSize="12"
              fill="#B4B4BC"
            >
              {n.label}
            </text>
          </g>
        );
      })}

      <g className="hs-flag" style={{ animationDelay: `${(760 / 960) * SWEEP * 0.82}s` }}>
        <rect x="610" y="228" width="168" height="26" rx="6" fill="#1B1013" stroke="#FF5C7A" strokeOpacity="0.5" />
        <text x="622" y="245" fontSize="12" fill="#FF8DA2" fontFamily="'Hanken Grotesk Variable', sans-serif">
          Circular import found
        </text>
      </g>

      <rect className="hs-beam" x="-260" y="0" width="260" height="430" fill="url(#hs-beam)" />
    </svg>
  </div>
);

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </span>
);
