import { HealthScore } from './HealthTypes';
import { colors } from '../../design-system/tokens';

export interface HealthBand {
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  label: 'Healthy' | 'Good' | 'Fair' | 'Needs Review' | 'Needs Attention';
  color: string;
  badge: 'green' | 'blue' | 'yellow' | 'red';
  description: string;
}

/**
 * Single canonical source of truth for Health Score grade bands across
 * Overview and Code Health Dashboard.
 * Rule from health-scoring skill:
 * Bands are strictly A to E. Never show "Grade F".
 */
export function getHealthBand(score: number): HealthBand {
  if (score >= 90) {
    return {
      letter: 'A',
      label: 'Healthy',
      color: colors.status.success,
      badge: 'green',
      description: 'Codebase adheres to clean architectural guidelines with minimal complexity and well-documented interfaces.',
    };
  }
  if (score >= 80) {
    return {
      letter: 'B',
      label: 'Good',
      color: colors.accent.blue,
      badge: 'blue',
      description: 'Codebase exhibits good structural cohesion with manageable coupling and clear responsibilities.',
    };
  }
  if (score >= 70) {
    return {
      letter: 'C',
      label: 'Fair',
      color: colors.status.warning,
      badge: 'yellow',
      description: 'Moderate technical debt or complex nesting detected. Consider targeted refactoring of high-impact modules.',
    };
  }
  if (score >= 60) {
    return {
      letter: 'D',
      label: 'Needs Review',
      color: colors.status.warning,
      badge: 'yellow',
      description: 'Several hotspots, high cyclomatic/cognitive complexity, or missing test/doc coverage require attention.',
    };
  }
  return {
    letter: 'E',
    label: 'Needs Attention',
    color: colors.status.danger,
    badge: 'red',
    description: 'High architectural risk, excessive complexity, or critical maintainability gaps identified.',
  };
}
