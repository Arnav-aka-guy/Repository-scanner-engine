import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage';
import { Login } from '../pages/Login';
import { Signup } from '../pages/Signup';
import { AddRepositoryModal } from '../components/AddRepositoryModal';

describe('Phase 1 Public Landing Page & Auth Flow', () => {
  it('renders technical hero, core capabilities, and CTA on LandingPage', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>
    );

    expect(html).toContain('Understand unfamiliar codebases faster');
    expect(html).toContain('Repository Analysis');
    expect(html).toContain('Dependency Intelligence');
    expect(html).toContain('Semantic Code Search');
    expect(html).toContain('AI Codebase Assistant');
    expect(html).toContain('Architecture Analysis');
    expect(html).toContain('Code Health');
    expect(html).toContain('Tech Debt');
    expect(html).toContain('Get Started');
    expect(html).toContain('Log In');
  });

  it('renders login form with email, password fields and link to signup', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>
    );

    expect(html).toContain('Log in to your workspace');
    expect(html).toContain('Email or Username');
    expect(html).toContain('Password');
  });

  it('renders signup form with name, email, password and 5-repo quota note', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/signup']}>
        <Signup />
      </MemoryRouter>
    );

    expect(html).toContain('Create your account');
    expect(html).toContain('Full Name');
    expect(html).toContain('Email Address');
    expect(html).toContain('Manage up to 5 repositories');
    expect(html).toContain('Log in');
  });
});

describe('Phase 2 Add Repository Modal & Quota Check', () => {
  it('renders Add Repository Modal with local directory path and public GitHub options', () => {
    const html = renderToString(
      <AddRepositoryModal
        isOpen={true}
        onClose={() => {}}
        onCreated={() => {}}
        currentCount={2}
        maxLimit={5}
      />
    );

    expect(html).toContain('Add Repository');
    expect(html).toContain('Local Directory');
    expect(html).toContain('Public GitHub');
    expect(html).toContain('Browse');
    expect(html).toContain('Repository Name');
    expect(html).toContain('Saved to your personal workspace');
  });

  it('indicates quota limit reached when 5 repositories are saved', () => {
    const html = renderToString(
      <AddRepositoryModal
        isOpen={true}
        onClose={() => {}}
        onCreated={() => {}}
        currentCount={5}
        maxLimit={5}
      />
    );

    expect(html).toContain('You have reached the maximum limit of 5 saved repositories');
  });
});
