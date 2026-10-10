---
name: design-direction
description: Visual design system and taste rules for the Repository Scanner Engine frontend ("survey map for code"). Use when creating or restyling any page, component, landing section, empty state, or colour/typography choice, so the UI looks deliberate and hand-made rather than templated AI output.
---

# Design direction: survey map for code

The product maps codebases, so it should feel like a survey map or an engineering drawing: precise, calm and warm, with one signal colour on a dark ground. Inside the app, screens are dense and keyboard-first. The landing page is more open and editorial.

## Tokens (the source of truth is the CSS variables in `src/index.css`)

- ground `#0D0F0E` / light `#F4F1EA`
- surface `#151816` / `#FFFFFF`
- raised `#1C201D` / `#ECE8DF`
- line `#262B28` / `#D9D4C8`
- text `#E9ECE6` / `#1A1C1A`
- muted text `#8A928B` / `#5E645F`
- signal `#F2A93B` / `#B86E00`: primary actions, live states and focus rings only. It should cover no more than about 5% of any screen.
- edge `#7CC4C9` / `#2D7F86`: graph edges and links
- success `#7FB77E`, danger `#E5654B`

Fonts:

- Bricolage Grotesque: display text only
- IBM Plex Sans: UI and body
- JetBrains Mono: code, paths, numbers, labels

Use tabular numbers for all metrics.

Type scale: 12 / 13 / 14 / 16 / 20 / 28 / 40 / 64. Spacing follows a 4px grid. Corner radius is 4px for inputs and 6px for cards. Avoid large rounded corners.

## Signature details (use these and repeat them)

- hairline 1px lines, and on the landing page and empty states, faint grid lines with coordinate ticks
- numbered section labels in mono: `01 — Scan`
- file paths and counts in mono, muted, as small labels
- real product fragments in place of illustrations
- one clear focal point per screen

## Banned (if you notice yourself doing any of these, stop and redo it)

- purple, indigo or pink gradients; gradient text; glowing blobs or orbs; mesh backgrounds
- glassmorphism used everywhere; `backdrop-blur` on cards
- three or four identical feature cards with an icon in a rounded square
- sparkle icons; emoji in headings or buttons
- marketing words: supercharge, unlock, revolutionize, seamless, next-gen, effortless, "AI-powered" in headlines
- fake logos, fake testimonials, fake numbers
- `rounded-2xl shadow-xl` on every box; drop shadows on a dark background
- everything centred; equal visual weight everywhere
- inline `style={{}}` for things that should be classes; hover done with `onMouseEnter`

## Every component must have

- hover, `:focus-visible`, active and disabled states
- 44px touch targets on mobile
- AA contrast in both light and dark themes
- three states for data: a skeleton that matches the final layout, an empty state with one clear action, and an error state with a retry

## Before you call a screen done

Check it in the browser at 1440, 768 and 375 px, in light and dark. Take screenshots. Ask yourself: "Could this screen belong to any other SaaS product?" If the answer is yes, add one of the signature details above.
