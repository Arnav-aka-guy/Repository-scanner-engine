import { describe, it, expect } from 'vitest';
import { colors, radius, spacing, heights, font } from '../design-system/tokens';
import {
  Button,
  IconButton,
  Input,
  Select,
  Badge,
  Panel,
  SectionHeader,
  Metric,
  StatusIndicator,
  Tooltip,
  EmptyState,
  LoadingState,
  DataTable,
  CodeBlock,
  FilePath,
  Divider,
  ProgressiveDisclosure,
} from '../design-system/primitives';

describe('Design Tokens', () => {
  it('defines the black canvas palette with ion accent', () => {
    expect(colors.bg.primary).toBe('#000000');
    expect(colors.bg.surface).toBe('#0D0D10');
    expect(colors.bg.surfaceSecondary).toBe('#141418');
    expect(colors.border.default).toBe('#222228');
    expect(colors.text.primary).toBe('#F4F4F5');
    expect(colors.accent.blue).toBe('#35D7FF');
    expect(colors.status.success).toBe('#3DDC97');
    expect(colors.status.warning).toBe('#FFB020');
    expect(colors.status.danger).toBe('#FF5C7A');
  });

  it('defines standard dimensions and typography', () => {
    expect(radius.sm).toBeDefined();
    expect(spacing.md).toBeDefined();
    expect(heights.header).toBe('52px');
    expect(heights.statusBar).toBe('28px');
    expect(font.sans).toContain('Hanken Grotesk');
    expect(font.mono).toContain('JetBrains Mono');
  });
});

describe('Design Primitives Exports', () => {
  it('exports all design system required components', () => {
    expect(Button).toBeDefined();
    expect(IconButton).toBeDefined();
    expect(Input).toBeDefined();
    expect(Select).toBeDefined();
    expect(Badge).toBeDefined();
    expect(Panel).toBeDefined();
    expect(SectionHeader).toBeDefined();
    expect(Metric).toBeDefined();
    expect(StatusIndicator).toBeDefined();
    expect(Tooltip).toBeDefined();
    expect(EmptyState).toBeDefined();
    expect(LoadingState).toBeDefined();
    expect(DataTable).toBeDefined();
    expect(CodeBlock).toBeDefined();
    expect(FilePath).toBeDefined();
    expect(Divider).toBeDefined();
    expect(ProgressiveDisclosure).toBeDefined();
  });
});
