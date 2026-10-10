/**
 * Shared motion system configuration and animation variants.
 * Follows .agents/skills/motion-system/SKILL.md
 */

import { type Transition, type Variants } from 'framer-motion';

export const motionEasing = [0.22, 1, 0.36, 1] as const;

export const motionDuration = {
  fast: 0.15,
  base: 0.3,
  slow: 0.6,
} as const;

export const motionTransitions = {
  fast: {
    duration: motionDuration.fast,
    ease: motionEasing,
  } as Transition,
  base: {
    duration: motionDuration.base,
    ease: motionEasing,
  } as Transition,
  slow: {
    duration: motionDuration.slow,
    ease: motionEasing,
  } as Transition,
  spring: {
    type: 'spring',
    stiffness: 400,
    damping: 32,
  } as Transition,
};

// Standard page / section enter transition
export const fadeInUpVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransitions.base,
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: motionTransitions.fast,
  },
};

// Modal / Dialog scale enter
export const dialogVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: motionTransitions.base,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: motionTransitions.fast,
  },
};

// Container stagger for list items (capped at 8 items)
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransitions.fast,
  },
};
