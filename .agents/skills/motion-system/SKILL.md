---
name: motion-system
description: Animation and interaction rules for the Repository Scanner Engine frontend using motion/react, Lenis and SVG. Use when adding page transitions, scroll animations, hover or press feedback, loading states, graph animations, counters, or the landing hero animation.
---

# Motion system

Motion has two jobs: to explain what changed, and to make the product feel responsive. It's never just decoration.

## Library

- `motion/react` (the same library as framer-motion v12). Use `LazyMotion` with `domAnimation` so the bundle stays small.
- Lenis for smooth scrolling, on the landing page only. Never inside the app.
- Plain SVG with `stroke-dasharray` / `stroke-dashoffset` for lines that draw themselves.

## Timing (put these in one shared `motion.ts` file)

- `ease`: `[0.22, 1, 0.36, 1]`, used for everything
- `fast`: 0.15s (hover, press, toggles)
- `base`: 0.3s (panels, dialogs, route changes)
- `slow`: 0.6s (landing reveals)
- `spring`: `{ type: "spring", stiffness: 400, damping: 32 }`, only for drag, graph nodes and layout changes
- Stagger lists by 0.04s, and cap the stagger at 8 items. Everything after the 8th item appears together.

## Patterns

- **Press:** `whileTap={{ scale: 0.98 }}` on buttons. Don't scale cards on hover; nudge the border colour instead.
- **Enter:** opacity 0→1 and y 8→0. Exit is shorter than enter.
- **Route change:** a fade plus a 6px slide, or the View Transitions API. Never block input while it runs.
- **Dialogs:** scale 0.98→1 with a fade. The backdrop fades. Return focus to the trigger when the dialog closes.
- **Numbers:** count up when they scroll into view (health score, file counts). Use tabular numbers so the width doesn't jump.
- **Streaming chat:** show tokens as they arrive, with a blinking caret. Don't animate each token on its own.
- **Graph:** nodes appear with a spring. Edges draw in after the nodes. On hover, highlight the neighbours and dim everything else to 30%.
- **Scroll:** use `useScroll` + `useTransform` to tie progress to position. Use `whileInView` with `once: true` for reveals.
- **Looping hero:** pause when off screen (IntersectionObserver) and when the tab is hidden.

## Hard rules

- Animate only `transform`, `opacity`, `clip-path`, `filter: blur` (small values only) and SVG stroke. Never animate width, height, top or left.
- No layout shift (CLS). Reserve space before content arrives.
- Handle `prefers-reduced-motion` with `useReducedMotion()`: everything becomes a plain fade, loops and parallax stop, and Lenis is turned off.
- Nothing that loops forever in the app UI, except the "live" scanning indicator.
- Keep 60fps on a mid-range laptop. Check with the Performance panel in DevTools before calling a motion task done.
