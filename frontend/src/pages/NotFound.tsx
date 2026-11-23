import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LogoMark } from '../components/brand/Logo';

export const NotFound: React.FC = () => (
  <div className="relative flex min-h-[100dvh] w-full flex-col bg-ink font-sans text-fg">
    <header className="mx-auto flex w-full max-w-[1200px] items-center px-5 py-5 sm:px-8">
      <Link to="/" className="flex items-center gap-2.5">
        <LogoMark size={24} />
        <span className="text-[14px] font-semibold tracking-[-0.01em]">Repository Scanner</span>
      </Link>
    </header>
    <main className="flex flex-1 items-center px-5 pb-24 sm:px-8">
      <div className="mx-auto w-full max-w-[1200px]">
        <p className="spectrum-text display text-[96px] leading-none sm:text-[160px]">404</p>
        <h1 className="display mt-4 text-[30px] leading-tight sm:text-[40px]">Page Not Found</h1>
        <p className="mt-3 max-w-[460px] text-[16px] leading-relaxed text-fg-3">
          This address does not match any page. Check the link, or head back to your repositories.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/app" className="btn-primary h-10 px-5">
            Go to my repositories
          </Link>
          <Link to="/" className="btn-secondary h-10 px-5">
            <ArrowLeft size={15} />
            Back to home
          </Link>
        </div>
      </div>
    </main>
  </div>
);
