import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { StatusBar } from '../components/StatusBar';

describe('Phase 1 Navigation & Shell Structure', () => {
  it('renders all required category headers and navigation items in Sidebar', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>
    );

    // Section headers
    expect(html).toContain('WORKSPACE');
    expect(html).toContain('ANALYSIS');
    expect(html).toContain('OUTPUT');
    expect(html).toContain('SYSTEM');

    // Nav items
    expect(html).toContain('Overview');
    expect(html).toContain('Explorer');
    expect(html).toContain('Search');
    expect(html).toContain('Assistant');
    expect(html).toContain('Dependencies');
    expect(html).toContain('Architecture');
    expect(html).toContain('Code Health');
    expect(html).toContain('Documentation');
    expect(html).toContain('Settings');
  });

  it('renders meaningful status disclosures and metrics in StatusBar', () => {
    const html = renderToString(
      <StatusBar repoPath="summer-project-1" totalFiles={42} totalLines={1234} />
    );

    // Meaningful labels
    expect(html).toContain('Backend');
    expect(html).toContain('files');
    expect(html).toContain('lines');
    expect(html).toContain('42');
    expect(html).toContain('1,234');
  });
});
