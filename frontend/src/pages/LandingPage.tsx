import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Lenis from 'lenis';
import {
  FolderTree,
  Share2,
  Search,
  MessageSquare,
  Activity,
  FileCode2,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Cpu,
  Database,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { SurveyHero } from '../components/SurveyHero';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const isAuthenticated = Boolean(token);
  const lenisRef = useRef<Lenis | null>(null);

  // Initialize Lenis smooth scroll on landing page only, respecting prefers-reduced-motion
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      touchMultiplier: 2,
    });
    lenisRef.current = lenis;

    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const capabilities = [
    {
      num: '01',
      icon: FolderTree,
      title: 'Repository Analysis',
      badge: 'PARSER',
      description:
        'Full AST parsing across Python, TypeScript and JavaScript. Discovers functions, classes, imports, call signatures and line ranges.',
      highlight: 'Polyglot AST Extraction',
    },
    {
      num: '02',
      icon: Share2,
      title: 'Dependency Intelligence',
      badge: 'GRAPH ENGINE',
      description:
        'Resolves module dependencies, call hierarchies, and cross-file references. Detects circular dependencies and structural choke points.',
      highlight: 'Cycle & Depth Detection',
    },
    {
      num: '03',
      icon: Search,
      title: 'Semantic Code Search',
      badge: 'RETRIEVAL',
      description:
        'Combines dense vector embeddings with BM25 lexical token matching via Reciprocal Rank Fusion (RRF) for precise concept discovery.',
      highlight: 'Dense + BM25 Fusion',
    },
    {
      num: '04',
      icon: MessageSquare,
      title: 'AI Codebase Assistant',
      badge: 'PROVENANCE',
      description:
        'Repository-aware assistant with verifiable line-range citations and AST source grounding. Every statement is traceable to code.',
      highlight: 'Verifiable Citations',
    },
    {
      num: '05',
      icon: Layers,
      title: 'Architecture Analysis',
      badge: 'SYSTEM MODEL',
      description:
        'Maps architectural layers, public entry points, module cohesion, and data flows to construct a mental model of the system.',
      highlight: 'Layer & Flow Mapping',
    },
    {
      num: '06',
      icon: Activity,
      title: 'Code Health',
      badge: 'TRANSPARENT MATH',
      description:
        'Deterministic health metrics across complexity, maintainability, architecture, and docs with inspectable rate-based formulas.',
      highlight: 'Formula Traceability & Tech Debt',
    },
    {
      num: '07',
      icon: FileCode2,
      title: 'Documentation Generation',
      badge: 'STATIC GEN',
      description:
        'Generates architectural briefs, API contracts, and onboarding walkthroughs directly from parsed codebase symbols.',
      highlight: 'Instant Markdown & HTML',
    },
  ];

  const steps = [
    {
      number: '01 — Scan',
      title: 'Add Repository',
      description: 'Point to any local directory on your machine or import public repositories.',
    },
    {
      number: '02 — Index',
      title: 'Parse & Map',
      description: 'The engine parses ASTs, maps dependency graphs, and builds isolated vector indexes.',
    },
    {
      number: '03 — Explore',
      title: 'Inspect & Query',
      description: 'Query the assistant, inspect call chains, trace debt, and explore system boundaries.',
    },
  ];

  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      if (lenisRef.current) {
        lenisRef.current.scrollTo(el);
      } else {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="bg-[#0D0F0E] text-[#E9ECE6] min-h-screen w-full font-sans selection:bg-[#F2A93B]/20 selection:text-[#F2A93B]">
      {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#151816] border-b border-[#262B28] px-6 h-13 flex items-center justify-between">
        <div className="flex items-center gap-5">
          {/* Back Navigation Button */}
          <button
            type="button"
            onClick={() => {
              if (activeRepository) {
                navigate('/explorer');
              } else if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/app');
              }
            }}
            className="btn-secondary text-xs inline-flex items-center gap-1.5 px-2.5 py-1"
            title={activeRepository ? 'Back to repository' : 'Go back'}
          >
            <ArrowLeft size={13} />
            <span>{activeRepository ? 'Back to Code' : 'Back'}</span>
          </button>

          <Link
            to="/"
            className="flex items-center gap-2.5 text-[#E9ECE6] font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <div className="w-6 h-6 bg-[#F2A93B] rounded flex items-center justify-center text-[#0D0F0E] font-bold text-xs font-mono">
              A
            </div>
            <span className="tracking-tight font-display text-base">Repository Scanner</span>
          </Link>

          <nav className="hidden md:flex items-center gap-5 ml-2">
            <a
              href="#preview"
              onClick={(e) => scrollToSection(e, 'preview')}
              className="text-xs font-mono text-[#8A928B] hover:text-[#E9ECE6] transition-colors"
            >
              01 — Survey Map
            </a>
            <a
              href="#capabilities"
              onClick={(e) => scrollToSection(e, 'capabilities')}
              className="text-xs font-mono text-[#8A928B] hover:text-[#E9ECE6] transition-colors"
            >
              02 — Capabilities
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, 'how-it-works')}
              className="text-xs font-mono text-[#8A928B] hover:text-[#E9ECE6] transition-colors"
            >
              03 — Workflow
            </a>
            <a
              href="#specs"
              onClick={(e) => scrollToSection(e, 'specs')}
              className="text-xs font-mono text-[#8A928B] hover:text-[#E9ECE6] transition-colors"
            >
              04 — Specs
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <button
              onClick={() => navigate('/app')}
              className="btn-primary text-xs inline-flex items-center gap-1.5"
            >
              <span>Workspace ({user?.name || 'My Repos'})</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <>
              <Link
                to="/login"
                className="text-xs font-mono text-[#8A928B] hover:text-[#E9ECE6] px-3 py-1.5 rounded transition-colors"
              >
                Log In
              </Link>
              <button
                onClick={() => navigate('/signup')}
                className="btn-primary text-xs inline-flex items-center gap-1.5"
              >
                <span>Get Started</span>
                <ArrowRight size={13} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Main Hero Section ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        {/* Technical mono badge */}
        <div className="inline-flex items-center gap-2 bg-[#151816] border border-[#262B28] rounded px-3 py-1 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7FB77E]" />
          <span className="text-[11px] text-[#8A928B] font-mono tracking-wider uppercase">
            Codebase Survey Engine · Multi-User v2.0
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight text-[#E9ECE6] max-w-3xl mx-auto mb-5 leading-tight">
          A survey map for code.
        </h1>

        <p className="text-base text-[#8A928B] max-w-2xl mx-auto mb-8 leading-relaxed font-sans">
          Understand unfamiliar codebases faster. Turn complex codebases into precise engineering maps of files, call hierarchies,
          dependencies, code health, and AST-grounded search.
        </p>

        <div className="flex items-center justify-center gap-3 mb-12">
          <button
            onClick={() => navigate(activeRepository ? '/explorer' : '/app')}
            className="btn-primary px-5 py-2 text-sm font-medium gap-2"
          >
            <span>{activeRepository ? 'Resume Analysis' : isAuthenticated ? 'Open Workspace' : 'Get Started Free'}</span>
            <ArrowRight size={15} />
          </button>

          <button
            type="button"
            onClick={(e) => scrollToSection(e, 'how-it-works')}
            className="btn-secondary px-4 py-2 text-xs"
          >
            See how it works
          </button>
        </div>

        {/* Survey Hero Visual Animation */}
        <div id="preview" className="mt-8">
          <SurveyHero />
        </div>
      </section>

      {/* ── Section 2: Reality / Why Survey Map ───────────────────────── */}
      <section className="border-y border-[#262B28] bg-[#151816] py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-[11px] font-mono text-[#F2A93B] uppercase tracking-widest">
            01 — The Problem
          </span>
          <h2 className="text-2xl md:text-3xl font-bold font-display text-[#E9ECE6] mt-2 mb-4">
            Reading unfamiliar code should not feel like archaeology.
          </h2>
          <p className="text-sm text-[#8A928B] leading-relaxed max-w-2xl mx-auto mb-8">
            Developers spend up to 70% of engineering time reading unfamiliar code. Blindly searching across
            thousands of files produces fragile mental models and missed dependency cycles.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-left">
            {[
              { label: '01', text: 'Where does execution begin?' },
              { label: '02', text: 'How do modules depend on each other?' },
              { label: '03', text: 'Which symbols are structural choke points?' },
              { label: '04', text: 'Where does hidden technical debt reside?' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-[#1C201D] border border-[#262B28] rounded p-3.5 flex flex-col gap-2"
              >
                <span className="font-mono text-[10px] text-[#5E645F]">{item.label}</span>
                <span className="text-xs text-[#E9ECE6] leading-snug">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: Core Capabilities ─────────────────────────────── */}
      <section id="capabilities" className="max-w-5xl mx-auto py-20 px-6">
        <div className="text-center mb-12">
          <span className="text-[11px] font-mono text-[#F2A93B] uppercase tracking-widest">
            02 — Capabilities
          </span>
          <h2 className="text-2xl md:text-3xl font-bold font-display text-[#E9ECE6] mt-2">
            Engineered for serious codebase inspection.
          </h2>
          <p className="text-sm text-[#8A928B] max-w-lg mx-auto mt-2">
            Static AST structures, deterministic dependency resolution, and inspectable code health math.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <div
                key={idx}
                className="bg-[#151816] border border-[#262B28] rounded p-5 flex flex-col gap-3 hover:border-[#3A423D] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded bg-[#1C201D] border border-[#262B28] flex items-center justify-center text-[#7CC4C9]">
                    <Icon size={16} />
                  </div>
                  <span className="text-[10px] font-mono text-[#8A928B] bg-[#1C201D] px-2 py-0.5 rounded border border-[#262B28]">
                    {cap.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[#E9ECE6] mb-1 font-display">
                    {cap.title}
                  </h3>
                  <p className="text-xs text-[#8A928B] leading-relaxed">
                    {cap.description}
                  </p>
                </div>

                <div className="mt-auto pt-2 border-t border-[#1C201D] text-[11px] font-mono text-[#7CC4C9]">
                  {cap.highlight}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section 4: Workflow ──────────────────────────────────────── */}
      <section id="how-it-works" className="border-y border-[#262B28] bg-[#151816] py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-[11px] font-mono text-[#F2A93B] uppercase tracking-widest">
              03 — Workflow
            </span>
            <h2 className="text-2xl md:text-3xl font-bold font-display text-[#E9ECE6] mt-2">
              Three steps to complete architectural clarity.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {steps.map((st, i) => (
              <div
                key={i}
                className="bg-[#1C201D] border border-[#262B28] rounded p-6 relative"
              >
                <div className="text-xs font-mono text-[#F2A93B] mb-2 font-semibold tracking-wider">
                  {st.number}
                </div>
                <h3 className="text-base font-semibold text-[#E9ECE6] mb-2 font-display">
                  {st.title}
                </h3>
                <p className="text-xs text-[#8A928B] leading-relaxed">
                  {st.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 5: Architecture & Storage Specs ───────────────────── */}
      <section id="specs" className="max-w-5xl mx-auto py-16 px-6">
        <div className="text-center mb-8">
          <span className="text-[11px] font-mono text-[#F2A93B] uppercase tracking-widest">
            04 — Platform Specifications
          </span>
          <h2 className="text-2xl font-bold font-display text-[#E9ECE6] mt-2">
            Multi-repository isolation with local first safety.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#151816] border border-[#262B28] rounded p-5">
            <div className="flex items-center gap-2 text-[#F2A93B] mb-2">
              <Database size={16} />
              <span className="text-xs font-semibold font-mono">5 Repositories Quota</span>
            </div>
            <p className="text-xs text-[#8A928B] leading-relaxed">
              Save up to 5 repositories per user account with isolated vector indexes, persisted AST scans, and 1-click active switching.
            </p>
          </div>

          <div className="bg-[#151816] border border-[#262B28] rounded p-5">
            <div className="flex items-center gap-2 text-[#7FB77E] mb-2">
              <ShieldCheck size={16} />
              <span className="text-xs font-semibold font-mono">Tenant Isolation & Guardrails</span>
            </div>
            <p className="text-xs text-[#8A928B] leading-relaxed">
              Every repository and file read is authenticated and scoped to the user. Sensitive files (.env, keys) are strictly blocked.
            </p>
          </div>

          <div className="bg-[#151816] border border-[#262B28] rounded p-5">
            <div className="flex items-center gap-2 text-[#7CC4C9] mb-2">
              <Cpu size={16} />
              <span className="text-xs font-semibold font-mono">Configurable Inference</span>
            </div>
            <p className="text-xs text-[#8A928B] leading-relaxed">
              Select local offline inference (Ollama) or fast cloud inference (Groq / OpenRouter / OpenAI) with transparent provider management.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 6: Final CTA ─────────────────────────────────────── */}
      <section className="border-t border-[#262B28] bg-[#11141A] py-16 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold font-display text-[#E9ECE6] mb-3">
            Stop searching blindly. Start surveying the system.
          </h2>
          <p className="text-sm text-[#8A928B] leading-relaxed mb-6 font-sans">
            Get instant architectural clarity, dependency intelligence, and verifiable code grounding for your repository.
          </p>

          <button
            onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
            className="btn-primary px-6 py-2.5 text-sm font-medium gap-2 mx-auto"
          >
            <span>{isAuthenticated ? 'Go to Workspace' : 'Get Started Now'}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-[#262B28] bg-[#0D0F0E] py-6 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#5E645F]">
          <div className="flex items-center gap-2">
            <span className="text-[#8A928B]">Repository Scanner Engine</span>
            <span>·</span>
            <span>Survey Map For Code</span>
          </div>
          <div>
            <span className="tabular-nums">v2.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
