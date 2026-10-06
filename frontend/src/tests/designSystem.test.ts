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
  it('defines restrained color system without dominant purple', () => {
    expect(colors.bg.primary).toBe('#0F1115');
    expect(colors.bg.surface).toBe('#151922');
    expect(colors.bg.surfaceSecondary).toBe('#1B2028');
    expect(colors.border.default).toBe('#292F38');
    expect(colors.text.primary).toBe('#E6EAF0');
    expect(colors.accent.blue).toBe('#5B8DEF');
    expect(colors.status.success).toBe('#4CAF79');
    expect(colors.status.warning).toBe('#C9943A');
    expect(colors.status.danger).toBe('#C95A5A');
  });

  it('defines standard dimensions and typography', () => {
    expect(radius.sm).toBeDefined();
    expect(spacing.md).toBeDefined();
    expect(heights.header).toBe('36px');
    expect(heights.statusBar).toBe('26px');
    expect(font.sans).toContain('Inter');
    expect(font.mono).toContain('JetBrains Mono');
  });
});

describe('Design Primitives Exports', () => {
  it('exports all Phase 0 required components', () => {
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
