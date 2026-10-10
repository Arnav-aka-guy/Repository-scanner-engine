import React, { useEffect, useRef, useState } from 'react';

/**
 * Technical SVG Survey Map Hero Animation.
 * Follows .agents/skills/design-direction and motion-system skills:
 * - Technical coordinate ticks, hairline 1px grid, AST node vertices, dependency arcs.
 * - Signal accent (#F2A93B) and graph edge teal (#7CC4C9).
 * - Pauses via IntersectionObserver when offscreen and on tab hidden.
 */
export const SurveyHero: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting && !document.hidden);
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-5xl mx-auto h-72 md:h-96 rounded border border-[#262B28] bg-[#0D0F0E] overflow-hidden select-none"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(38, 43, 40, 0.45) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(38, 43, 40, 0.45) 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px',
      }}
    >
      {/* Top telemetry bar */}
      <div className="absolute top-0 inset-x-0 h-7 border-b border-[#262B28] bg-[#151816]/90 px-3 flex items-center justify-between text-[11px] font-mono text-[#8A928B] z-10">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[#E9ECE6]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7FB77E]" />
            GRID: ACTIVE
          </span>
          <span className="hidden sm:inline text-[#5E645F]">|</span>
          <span className="hidden sm:inline text-[#5E645F]">DATUM: EPSG::900913</span>
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>VERTICES: 1,428</span>
          <span className="text-[#F2A93B]">EDGES: 3,892</span>
        </div>
      </div>

      {/* SVG Canvas with technical survey graph lines */}
      <svg
        className="w-full h-full pt-7"
        viewBox="0 0 1000 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7CC4C9" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#F2A93B" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Structural coordinate ticks */}
        <g stroke="#3A423D" strokeWidth="1">
          <line x1="100" y1="30" x2="100" y2="40" />
          <line x1="300" y1="30" x2="300" y2="40" />
          <line x1="500" y1="30" x2="500" y2="40" />
          <line x1="700" y1="30" x2="700" y2="40" />
          <line x1="900" y1="30" x2="900" y2="40" />
        </g>

        {/* Dependency arcs and call graph lines */}
        <g stroke="#262B28" strokeWidth="1.5">
          <path d="M 120 180 Q 250 80 420 160" />
          <path d="M 420 160 Q 600 240 750 140" />
          <path d="M 750 140 Q 860 90 920 220" />
          <path d="M 220 310 Q 320 220 420 160" />
          <path d="M 420 160 Q 560 110 680 280" />
        </g>

        {/* Active signal paths with animated stroke */}
        <g
          stroke="url(#edgeGrad)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          style={{
            animation: isVisible ? 'survey-dash 12s linear infinite' : 'none',
          }}
        >
          <path d="M 160 220 C 260 140, 360 140, 420 160" />
          <path d="M 420 160 C 520 180, 620 100, 750 140" />
          <path d="M 420 160 C 500 260, 600 300, 680 280" />
        </g>

        {/* Graph Vertices */}
        <g>
          {/* Node 1 */}
          <circle cx="120" cy="180" r="4" fill="#0D0F0E" stroke="#7CC4C9" strokeWidth="2" />
          <text x="120" y="202" fill="#8A928B" fontSize="10" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">api.auth</text>

          {/* Node 2 - Central hub */}
          <circle cx="420" cy="160" r="6" fill="#151816" stroke="#F2A93B" strokeWidth="2" />
          <text x="420" y="142" fill="#E9ECE6" fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">ScannerEngine</text>

          {/* Node 3 */}
          <circle cx="750" cy="140" r="4" fill="#0D0F0E" stroke="#7CC4C9" strokeWidth="2" />
          <text x="750" y="125" fill="#8A928B" fontSize="10" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">ast.parser</text>

          {/* Node 4 */}
          <circle cx="220" cy="310" r="4" fill="#0D0F0E" stroke="#5E645F" strokeWidth="1.5" />
          <text x="220" y="330" fill="#5E645F" fontSize="10" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">models.py</text>

          {/* Node 5 */}
          <circle cx="680" cy="280" r="4" fill="#0D0F0E" stroke="#7CC4C9" strokeWidth="2" />
          <text x="680" y="302" fill="#8A928B" fontSize="10" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">graph.retrieval</text>

          {/* Node 6 */}
          <circle cx="920" cy="220" r="4" fill="#0D0F0E" stroke="#5E645F" strokeWidth="1.5" />
          <text x="920" y="242" fill="#5E645F" fontSize="10" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">vector_store</text>
        </g>
      </svg>

      {/* Coordinate inspection badge in corner */}
      <div className="absolute bottom-2 right-3 font-mono text-[10px] text-[#5E645F] tabular-nums pointer-events-none">
        LOC: 34.208, -118.441 | SCALE 1:100
      </div>

      <style>{`
        @keyframes survey-dash {
          to {
            stroke-dashoffset: -100;
          }
        }
      `}</style>
    </div>
  );
};
