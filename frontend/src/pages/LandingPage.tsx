import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Terminal,
  CheckCircle2,
  ShieldCheck,
  Cpu,
  Database,
  ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const isAuthenticated = Boolean(token);

  const capabilities = [
    {
      icon: FolderTree,
      title: 'Repository Analysis',
      badge: 'AST Parser',
      description:
        'Full AST parsing across Python and TypeScript/JavaScript. Discovers functions, classes, imports, and LOC metrics across files.',
      highlight: 'Polyglot AST Extraction',
    },
    {
      icon: Share2,
      title: 'Dependency Intelligence',
      badge: 'Graph Engine',
      description:
        'Resolves module dependencies, call hierarchies, and cross-file references. Detects circular dependencies and structural choke points.',
      highlight: 'Cycle & Depth Detection',
    },
    {
      icon: Search,
      title: 'Semantic Code Search',
      badge: 'Hybrid Retrieval',
      description:
        'Blends dense vector embeddings with BM25 keyword matching via Reciprocal Rank Fusion (RRF) for natural language discovery.',
      highlight: 'Dense + BM25 Fusion',
    },
    {
      icon: MessageSquare,
      title: 'AI Codebase Assistant',
      badge: 'Grounded RAG',
      description:
        'Repository-aware question answering with verifiable line-range citations and AST source grounding. No hallucinations.',
      highlight: 'Verifiable Citations',
    },
    {
      icon: Layers,
      title: 'Architecture Analysis',
      badge: 'System View',
      description:
        'Maps architectural layers, entry points, module cohesion, and data flows to deliver a mental model in minutes.',
      highlight: 'Layer & Flow Mapping',
    },
    {
      icon: Activity,
      title: 'Code Health & Tech Debt',
      badge: 'Transparent Scoring',
      description:
        'Deterministic health metrics across complexity, maintainability, architecture, and docs with inspectable math.',
      highlight: 'Formula Traceability',
    },
    {
      icon: FileCode2,
      title: 'Documentation Generation',
      badge: 'Automated Docs',
      description:
        'Generates architectural documentation, API contracts, and onboarding walkthroughs directly from parsed code.',
      highlight: 'Instant Markdown & HTML',
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Add Repository',
      description: 'Point to any local codebase on your machine or import public repositories.',
    },
    {
      number: '02',
      title: 'Analyze Codebase',
      description: 'The engine parses ASTs, maps dependency graphs, and builds isolated vector indexes.',
    },
    {
      number: '03',
      title: 'Explore & Understand',
      description: 'Query the assistant, inspect call chains, search concepts, and inspect architecture.',
    },
  ];

  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#0F1115',
        color: '#E6EAF0',
        minHeight: '100vh',
        width: '100%',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backgroundColor: '#151922',
          borderBottom: '1px solid #292F38',
          padding: '0 24px',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
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
            className="btn-secondary"
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
            title={activeRepository ? 'Back to repository' : 'Go back'}
          >
            <ArrowLeft size={13} />
            <span>{activeRepository ? 'Back to Code' : 'Back'}</span>
          </button>

          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
              color: '#E6EAF0',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                backgroundColor: '#5B8DEF',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              A
            </div>
            <span>Repository Scanner</span>
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a
              href="#features"
              onClick={(e) => scrollToSection(e, 'features')}
              style={{ fontSize: '13px', color: '#A0A8B5', textDecoration: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#E6EAF0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#A0A8B5')}
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, 'how-it-works')}
              style={{ fontSize: '13px', color: '#A0A8B5', textDecoration: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#E6EAF0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#A0A8B5')}
            >
              How it works
            </a>
            <a
              href="#preview"
              onClick={(e) => scrollToSection(e, 'preview')}
              style={{ fontSize: '13px', color: '#A0A8B5', textDecoration: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#E6EAF0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#A0A8B5')}
            >
              Preview
            </a>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated ? (
            <button
              onClick={() => navigate('/app')}
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '6px 14px',
              }}
            >
              <span>Workspace ({user?.name || 'My Repos'})</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <>
              <Link
                to="/login"
                style={{
                  fontSize: '13px',
                  color: '#A0A8B5',
                  textDecoration: 'none',
                  padding: '6px 12px',
                  borderRadius: '5px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#E6EAF0')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#A0A8B5')}
              >
                Log In
              </Link>
              <button
                onClick={() => navigate('/signup')}
                className="btn-primary"
                style={{
                  fontSize: '12px',
                  padding: '6px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Get Started</span>
                <ArrowRight size={13} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Main Hero Section ─────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: '1160px',
          margin: '0 auto',
          padding: '64px 24px 48px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#1B2028',
            border: '1px solid #292F38',
            borderRadius: '20px',
            padding: '4px 12px',
            marginBottom: '20px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#4CAF79',
            }}
          />
          <span style={{ fontSize: '11px', color: '#A0A8B5', fontFamily: 'JetBrains Mono, monospace' }}>
            Multi-User Code Intelligence Engine v2.0
          </span>
        </div>

        <h1
          style={{
            fontSize: '46px',
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            margin: '0 auto 16px',
            maxWidth: '820px',
            color: '#E6EAF0',
          }}
        >
          Understand unfamiliar codebases faster.
        </h1>

        <p
          style={{
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#A0A8B5',
            maxWidth: '680px',
            margin: '0 auto 32px',
          }}
        >
          Repository Scanner turns complex codebases into an understandable map of files,
          dependencies, architecture, code health, and searchable knowledge grounded in your actual code.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '48px',
          }}
        >
          <button
            onClick={() => navigate(activeRepository ? '/explorer' : '/app')}
            className="btn-primary"
            style={{
              padding: '10px 22px',
              fontSize: '14px',
              fontWeight: 500,
              gap: '8px',
            }}
          >
            <span>{activeRepository ? 'Resume Analysis' : isAuthenticated ? 'Open Workspace' : 'Get Started Free'}</span>
            <ArrowRight size={16} />
          </button>

          <button
            type="button"
            onClick={(e) => scrollToSection(e, 'how-it-works')}
            className="btn-secondary"
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            See how it works
          </button>
        </div>

        {/* ── Realistic Hero Visual (Developer Tool Workspace) ────────── */}
        <div
          id="preview"
          style={{
            backgroundColor: '#151922',
            border: '1px solid #292F38',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
            textAlign: 'left',
          }}
        >
          {/* Mock Window Title Bar */}
          <div
            style={{
              height: '32px',
              backgroundColor: '#1B2028',
              borderBottom: '1px solid #292F38',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#292F38' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#292F38' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#292F38' }} />
              <span
                style={{
                  fontSize: '11px',
                  color: '#6F7887',
                  fontFamily: 'JetBrains Mono, monospace',
                  marginLeft: '8px',
                }}
              >
                summer-project-1 / analysis-session
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontSize: '10px',
                  backgroundColor: 'rgba(76,175,121,0.1)',
                  color: '#4CAF79',
                  border: '1px solid rgba(76,175,121,0.2)',
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                READY · 128 FILES
              </span>
            </div>
          </div>

          {/* Mock Workspace Content Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '240px 1fr 300px',
              height: '380px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px',
            }}
          >
            {/* Column 1: Tree */}
            <div
              style={{
                backgroundColor: '#11141A',
                borderRight: '1px solid #292F38',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                color: '#A0A8B5',
              }}
            >
              <div style={{ color: '#6F7887', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>
                EXPLORER
              </div>
              <div>▾ backend/</div>
              <div style={{ paddingLeft: '12px' }}>▾ api/</div>
              <div style={{ paddingLeft: '24px', color: '#5B8DEF' }}>• repository.py</div>
              <div style={{ paddingLeft: '24px' }}>• search.py</div>
              <div style={{ paddingLeft: '24px' }}>• chat.py</div>
              <div style={{ paddingLeft: '12px' }}>▾ graph/</div>
              <div style={{ paddingLeft: '24px' }}>• builder.py</div>
              <div style={{ paddingLeft: '24px' }}>• service.py</div>
              <div style={{ paddingLeft: '12px' }}>▾ retrieval/</div>
              <div style={{ paddingLeft: '24px' }}>• hybrid.py</div>
            </div>

            {/* Column 2: Code / Graph representation */}
            <div
              style={{
                backgroundColor: '#151922',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#E6EAF0', fontWeight: 600 }}>backend/api/repository.py</span>
                <span style={{ color: '#6F7887' }}>Python 3.13 · AST Indexed</span>
              </div>

              <div
                style={{
                  backgroundColor: '#0F1115',
                  border: '1px solid #1E2530',
                  borderRadius: '4px',
                  padding: '10px',
                  lineHeight: '1.6',
                  color: '#A0A8B5',
                }}
              >
                <div>
                  <span style={{ color: '#5B8DEF' }}>@router</span>.post(
                  <span style={{ color: '#4CAF79' }}>"/scan"</span>)
                </div>
                <div>
                  <span style={{ color: '#C9943A' }}>async def</span>{' '}
                  <span style={{ color: '#E6EAF0' }}>scan_repository</span>(body: ScanRequest):
                </div>
                <div style={{ paddingLeft: '16px', color: '#6F7887' }}>
                  # Verifies path isolation and triggers AST dependency index
                </div>
                <div style={{ paddingLeft: '16px' }}>
                  path = validate_repository_path(body.path)
                </div>
                <div style={{ paddingLeft: '16px' }}>
                  parsed = <span style={{ color: '#C9943A' }}>await</span> parser.parse_repository(path)
                </div>
              </div>

              {/* Dependency relation teaser */}
              <div
                style={{
                  backgroundColor: '#1B2028',
                  border: '1px solid #292F38',
                  borderRadius: '4px',
                  padding: '10px',
                }}
              >
                <div style={{ color: '#6F7887', marginBottom: '6px' }}>GRAPH RELATIONSHIPS</div>
                <div style={{ color: '#E6EAF0' }}>
                  repository.py <span style={{ color: '#5B8DEF' }}>IMPORTS</span> parser.service
                </div>
                <div style={{ color: '#E6EAF0' }}>
                  repository.py <span style={{ color: '#5B8DEF' }}>CALLS</span> validate_repository_path
                </div>
              </div>
            </div>

            {/* Column 3: Grounded AI Assistant preview */}
            <div
              style={{
                backgroundColor: '#11141A',
                borderLeft: '1px solid #292F38',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ color: '#6F7887', fontSize: '10px', textTransform: 'uppercase' }}>
                AI CODEBASE ASSISTANT
              </div>
              <div
                style={{
                  backgroundColor: '#1B2028',
                  borderRadius: '4px',
                  padding: '8px',
                  color: '#E6EAF0',
                }}
              >
                "Where does repository scanning start?"
              </div>

              <div
                style={{
                  backgroundColor: '#151922',
                  border: '1px solid #292F38',
                  borderRadius: '4px',
                  padding: '8px',
                  color: '#A0A8B5',
                  lineHeight: '1.5',
                  fontSize: '10px',
                }}
              >
                Scanning starts in <span style={{ color: '#5B8DEF' }}>backend/api/repository.py:scan_repository</span>,
                which delegates AST extraction to <span style={{ color: '#5B8DEF' }}>ParserService</span>.
                <div style={{ marginTop: '8px', color: '#6F7887' }}>
                  Grounded in:
                  <div style={{ color: '#4CAF79' }}>• backend/api/repository.py #L12-L34</div>
                  <div style={{ color: '#4CAF79' }}>• backend/parser/service.py #L8-L20</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: The Problem ────────────────────────────────────── */}
      <section
        style={{
          borderTop: '1px solid #1E2530',
          borderBottom: '1px solid #1E2530',
          backgroundColor: '#151922',
          padding: '64px 24px',
        }}
      >
        <div style={{ maxWidth: '840px', margin: '0 auto', textAlign: 'center' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#5B8DEF',
              letterSpacing: '0.08em',
            }}
          >
            The Reality
          </span>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: 700,
              marginTop: '8px',
              marginBottom: '16px',
              color: '#E6EAF0',
            }}
          >
            Reading a large repository shouldn't feel like archaeology.
          </h2>
          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.7,
              color: '#A0A8B5',
              marginBottom: '28px',
            }}
          >
            Developers spend up to 70% of their time reading unfamiliar code rather than writing new features.
            Searching blindly across thousands of files leads to missed dependencies, hidden side effects,
            and fragile architectural assumptions.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              textAlign: 'left',
            }}
          >
            {[
              'Where does core functionality live?',
              'How do modules depend on each other?',
              'What symbols are most critical to stability?',
              'Where does hidden technical debt reside?',
            ].map((question, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: '#1B2028',
                  border: '1px solid #292F38',
                  borderRadius: '6px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <CheckCircle2 size={16} style={{ color: '#5B8DEF', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '12px', color: '#E6EAF0', lineHeight: 1.5 }}>{question}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: Core Capabilities ─────────────────────────────── */}
      <section
        id="features"
        style={{
          maxWidth: '1160px',
          margin: '0 auto',
          padding: '72px 24px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#5B8DEF',
              letterSpacing: '0.08em',
            }}
          >
            Core Capabilities
          </span>
          <h2 style={{ fontSize: '30px', fontWeight: 700, color: '#E6EAF0', marginTop: '6px' }}>
            Built for serious developer workflows.
          </h2>
          <p style={{ fontSize: '14px', color: '#A0A8B5', maxWidth: '580px', margin: '8px auto 0' }}>
            Every capability is grounded in static AST structures and deterministic dependency graphs.
          </p>
        </div>

        {/* Editorial Structured Capabilities Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: '#151922',
                  border: '1px solid #292F38',
                  borderRadius: '6px',
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#292F38')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(91,141,239,0.1)',
                      border: '1px solid rgba(91,141,239,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#5B8DEF',
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'JetBrains Mono, monospace',
                      color: '#A0A8B5',
                      backgroundColor: '#1B2028',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #292F38',
                    }}
                  >
                    {cap.badge}
                  </span>
                </div>

                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#E6EAF0', margin: '0 0 6px' }}>
                    {cap.title}
                  </h3>
                  <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#A0A8B5', margin: 0 }}>
                    {cap.description}
                  </p>
                </div>

                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: '10px',
                    borderTop: '1px solid #1E2530',
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#5B8DEF',
                  }}
                >
                  {cap.highlight}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section 4: How It Works ──────────────────────────────────── */}
      <section
        id="how-it-works"
        style={{
          borderTop: '1px solid #1E2530',
          borderBottom: '1px solid #1E2530',
          backgroundColor: '#151922',
          padding: '64px 24px',
        }}
      >
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                color: '#5B8DEF',
                letterSpacing: '0.08em',
              }}
            >
              Workflow
            </span>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#E6EAF0', marginTop: '6px' }}>
              Three steps to complete architectural clarity.
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
            }}
          >
            {steps.map((st, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: '#1B2028',
                  border: '1px solid #292F38',
                  borderRadius: '6px',
                  padding: '24px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#5B8DEF',
                    marginBottom: '12px',
                  }}
                >
                  {st.number}
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#E6EAF0', marginBottom: '8px' }}>
                  {st.title}
                </h3>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#A0A8B5', margin: 0 }}>
                  {st.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 5: Product Preview ───────────────────────────────── */}
      <section
        id="preview"
        style={{
          maxWidth: '1160px',
          margin: '0 auto',
          padding: '64px 24px',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: '#5B8DEF',
            letterSpacing: '0.08em',
          }}
        >
          Product Architecture
        </span>
        <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#E6EAF0', marginTop: '6px', marginBottom: '32px' }}>
          Personal developer workspace with multi-repo storage.
        </h2>

        <div
          style={{
            backgroundColor: '#151922',
            border: '1px solid #292F38',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '20px',
            }}
          >
            <div
              style={{
                backgroundColor: '#1B2028',
                border: '1px solid #292F38',
                borderRadius: '6px',
                padding: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#5B8DEF', marginBottom: '8px' }}>
                <Database size={16} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>5 Repositories Quota</span>
              </div>
              <p style={{ fontSize: '12px', color: '#A0A8B5', lineHeight: 1.6, margin: 0 }}>
                Save up to 5 repositories in your personal account with isolated vector indexes, persisted AST scans, and instant 1-click switching.
              </p>
            </div>

            <div
              style={{
                backgroundColor: '#1B2028',
                border: '1px solid #292F38',
                borderRadius: '6px',
                padding: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4CAF79', marginBottom: '8px' }}>
                <ShieldCheck size={16} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Strict User Data Isolation</span>
              </div>
              <p style={{ fontSize: '12px', color: '#A0A8B5', lineHeight: 1.6, margin: 0 }}>
                Every repository, vector chunk, and file read is authenticated and scoped to the user. Sensitive files (.env, keys) are strictly blocked.
              </p>
            </div>

            <div
              style={{
                backgroundColor: '#1B2028',
                border: '1px solid #292F38',
                borderRadius: '6px',
                padding: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9943A', marginBottom: '8px' }}>
                <Cpu size={16} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Local & Cloud Providers</span>
              </div>
              <p style={{ fontSize: '12px', color: '#A0A8B5', lineHeight: 1.6, margin: 0 }}>
                Choose local offline AI (Ollama) or fast cloud inference (Groq / OpenRouter / OpenAI) with transparent provider management.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: Final CTA ─────────────────────────────────────── */}
      <section
        style={{
          borderTop: '1px solid #1E2530',
          backgroundColor: '#11141A',
          padding: '72px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2
            style={{
              fontSize: '32px',
              fontWeight: 700,
              color: '#E6EAF0',
              marginBottom: '12px',
            }}
          >
            Stop searching blindly. Start understanding the system.
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: '#A0A8B5',
              lineHeight: 1.6,
              marginBottom: '28px',
            }}
          >
            Get instant architectural clarity, dependency intelligence, and verifiable code grounding for your codebase.
          </p>

          <button
            onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
            className="btn-primary"
            style={{
              padding: '11px 26px',
              fontSize: '14px',
              fontWeight: 500,
              gap: '8px',
            }}
          >
            <span>{isAuthenticated ? 'Go to Workspace' : 'Get Started Now'}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid #292F38',
          backgroundColor: '#0F1115',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: '1160px',
          margin: '0 auto',
          fontSize: '12px',
          color: '#6F7887',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Repository Scanner Engine</span>
          <span>·</span>
          <span>Technical Codebase Intelligence</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>v2.0.0</span>
        </div>
      </footer>
    </div>
  );
};
