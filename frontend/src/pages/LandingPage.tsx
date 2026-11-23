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
  ShieldCheck,
  Cpu,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { LogoMark } from '../components/brand/Logo';
import { HeroScan } from '../components/landing/HeroScan';

const CAPABILITIES = [
  {
    icon: FolderTree,
    title: 'Repository Analysis',
    tone: 'text-amber',
    description:
      'Parses Python, TypeScript and JavaScript into functions, classes, imports and line ranges, so you can browse a project by what it contains instead of by folder.',
  },
  {
    icon: Share2,
    title: 'Dependency Intelligence',
    tone: 'text-ion',
    description:
      'Shows which files and functions depend on each other, and points out circular imports and the files everything else leans on.',
  },
  {
    icon: Search,
    title: 'Semantic Code Search',
    tone: 'text-iris',
    description:
      'Search by meaning. "Where do we check the password?" finds the right function even when those words never appear in it.',
  },
  {
    icon: MessageSquare,
    title: 'AI Codebase Assistant',
    tone: 'text-mint',
    description:
      'Ask questions about the code and get answers that cite the exact files and lines they came from, so you can check every claim.',
  },
  {
    icon: Layers,
    title: 'Architecture Analysis',
    tone: 'text-ion',
    description:
      'Groups the project into layers, finds the entry points and draws a system design diagram you can export and share.',
  },
  {
    icon: Activity,
    title: 'Code Health and Tech Debt',
    tone: 'text-rose',
    description:
      'A score out of 100 with the working shown: every deduction links to the rule that fired and the files that caused it.',
  },
  {
    icon: FileCode2,
    title: 'Documentation Generation',
    tone: 'text-amber',
    description:
      'Writes an architecture brief, module notes and an onboarding guide from what the scan found, ready to copy as Markdown.',
  },
];

const STEPS = [
  {
    title: 'Add a repository',
    description: 'Point it at a folder on your computer or paste a public GitHub link.',
  },
  {
    title: 'Let it scan',
    description: 'Files are parsed, linked into a graph and indexed for search. Most projects take under a minute.',
  },
  {
    title: 'Start asking',
    description: 'Open the map, follow a call chain, check the health score or ask the assistant where to begin.',
  },
];

const FACTS = [
  {
    icon: ShieldCheck,
    title: 'Your code stays on your machine',
    description: 'Scans and indexes are stored locally. Files like .env and private keys are never read.',
  },
  {
    icon: Cpu,
    title: 'Pick your AI provider',
    description: 'Run a local model with Ollama, or connect Groq, OpenRouter or OpenAI with your own key.',
  },
  {
    icon: Database,
    title: 'Up to 5 repositories per account',
    description: 'Each one keeps its own scan and search index, and you can switch between them in a click.',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, user, authEnabled } = useAuthStore();
  const activeRepository = useWorkspaceStore((s) => s.activeRepository);
  const isAuthenticated = Boolean(token);
  const targetWorkspace = activeRepository ? '/explorer' : authEnabled && token ? '/app' : '/overview';
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;
    let rafId = 0;
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

  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -72 });
    else el.scrollIntoView({ behavior: 'smooth' });
  };

  const primaryLabel = isAuthenticated ? 'Open workspace' : 'Get Started';
  const goPrimary = () => navigate(isAuthenticated ? '/app' : authEnabled ? '/signup' : targetWorkspace);

  return (
    <div className="min-h-screen w-full bg-ink font-sans text-fg">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Repository Scanner</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[14px] text-fg-3 md:flex" aria-label="Page sections">
            <a href="#features" onClick={(e) => scrollToSection(e, 'features')} className="hover:text-fg">Features</a>
            <a href="#how-it-works" onClick={(e) => scrollToSection(e, 'how-it-works')} className="hover:text-fg">How it works</a>
            <a href="#privacy" onClick={(e) => scrollToSection(e, 'privacy')} className="hover:text-fg">Privacy</a>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <button type="button" onClick={() => navigate('/app')} className="btn-primary h-9 px-4 text-[14px]">
                {user?.name ? `Open workspace` : 'My repositories'}
              </button>
            ) : (
              <>
                <Link to="/login" className="hidden h-9 items-center rounded-md px-3 text-[14px] text-fg-2 hover:text-fg sm:inline-flex">
                  Log In
                </Link>
                <button type="button" onClick={goPrimary} className="btn-primary h-9 px-4 text-[14px]">
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="hero-glow pointer-events-none absolute inset-x-0 -top-40 h-[520px]" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1200px] px-5 pb-16 pt-16 sm:px-8 sm:pt-24 lg:pb-24">
            <div className="max-w-[820px]">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-fg-3">
                <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                Free, open source and runs on your computer
              </p>
              <h1 className="display text-[44px] leading-[1.02] sm:text-[64px] lg:text-[80px]">
                Understand unfamiliar codebases faster.
              </h1>
              <p className="mt-6 max-w-[600px] text-[17px] leading-relaxed text-fg-3 sm:text-[19px]">
                Repository Scanner reads a project once and gives you a map of every file, a search that understands
                what you mean, a health report and an assistant that can point to the exact line.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button type="button" onClick={goPrimary} className="btn-primary h-11 px-5 text-[15px]">
                  {primaryLabel}
                </button>
                <a
                  href="#how-it-works"
                  onClick={(e) => scrollToSection(e, 'how-it-works')}
                  className="btn-secondary h-11 px-5 text-[15px]"
                >
                  See how it works
                </a>
                {!isAuthenticated && (
                  <Link to="/login" className="px-2 text-[15px] text-fg-3 hover:text-fg sm:hidden">
                    Log In
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-14 sm:mt-16">
              <HeroScan />
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-line-soft">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[360px_1fr] lg:gap-16 lg:py-28">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="display text-[32px] leading-[1.1] sm:text-[40px]">One scan, seven ways to read the code.</h2>
              <p className="mt-4 text-[16px] leading-relaxed text-fg-3">
                Everything below comes from the same scan, so the map, the search, the health score and the assistant
                always agree with each other.
              </p>
            </div>
            <ul className="divide-y divide-line-soft border-y border-line-soft">
              {CAPABILITIES.map(({ icon: Icon, title, description, tone }) => (
                <li key={title} className="grid grid-cols-[40px_1fr] gap-4 py-6 sm:grid-cols-[48px_220px_1fr] sm:gap-6">
                  <span className={`grid h-10 w-10 place-items-center rounded-[10px] border border-line bg-surface ${tone}`}>
                    <Icon size={19} strokeWidth={1.75} />
                  </span>
                  <h3 className="self-center text-[17px] font-semibold tracking-[-0.01em] sm:self-start sm:pt-2">{title}</h3>
                  <p className="col-start-2 text-[15px] leading-relaxed text-fg-3 sm:col-start-3 sm:pt-1.5">{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-line-soft bg-surface/40">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="display max-w-[640px] text-[32px] leading-[1.1] sm:text-[40px]">From folder to answers in three steps.</h2>
            <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              <span className="spectrum-line absolute left-0 right-0 top-[19px] hidden h-px opacity-60 md:block" aria-hidden="true" />
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative">
                  <span className="relative grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-ink text-[15px] font-semibold">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.01em]">{step.title}</h3>
                  <p className="mt-2 max-w-[340px] text-[15px] leading-relaxed text-fg-3">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="privacy" className="border-t border-line-soft">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
              <h2 className="display text-[32px] leading-[1.1] sm:text-[40px]">
                Built for code you would rather not upload anywhere.
              </h2>
              <div className="grid gap-8">
                {FACTS.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex gap-4">
                    <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-3" />
                    <div>
                      <h3 className="text-[17px] font-semibold">{title}</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-fg-3">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line-soft">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-24">
            <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface px-6 py-12 sm:px-12 sm:py-16">
              <div className="spectrum-line absolute inset-x-0 top-0 h-[2px]" aria-hidden="true" />
              <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                <div className="max-w-[560px]">
                  <h2 className="display text-[30px] leading-[1.1] sm:text-[40px]">Open your first repository.</h2>
                  <p className="mt-3 text-[16px] leading-relaxed text-fg-3">
                    Create an account, add a folder or a GitHub link, and you will have a map of it in about a minute.
                  </p>
                </div>
                <button type="button" onClick={goPrimary} className="btn-primary h-11 shrink-0 self-start px-6 text-[15px] md:self-auto">
                  {isAuthenticated ? 'Go to Workspace' : 'Get Started'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-8 text-[13px] text-fg-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="flex items-center gap-2">
            <LogoMark size={18} />
            Repository Scanner
          </span>
          <a
            href="https://github.com/Arnav-aka-guy/Repository-scanner-engine"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-fg"
          >
            Source on GitHub <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
