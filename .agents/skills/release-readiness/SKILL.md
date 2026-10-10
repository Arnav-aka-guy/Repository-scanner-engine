---
name: release-readiness
description: Production and portfolio readiness checklist for the Repository Scanner Engine covering Docker, configuration, CI, docs, security headers, performance and accessibility. Use when preparing a release, writing deployment docs, editing Docker or CI files, or when asked whether the project is ready to ship.
---

# Release readiness

Go through this list and write the result to `docs/RELEASE_CHECKLIST.md`, marking each item ✅ or ❌ with a reason.

## Security

- [ ] The app refuses to start with a weak or placeholder `JWT_SECRET_KEY` unless `LOCAL_MODE` is on
- [ ] No secrets in the repo; a pre-commit secret scan passes
- [ ] Security headers are set: CSP, HSTS (in production), X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy
- [ ] CORS lists exact origins only
- [ ] Rate limits on auth, scan and chat, with Redis storage when there are several workers
- [ ] Every data route checks ownership
- [ ] `/health` shows nothing sensitive in production
- [ ] Dependencies have no known high or critical issues (`pip-audit`, `npm audit --omit=dev`)

## Runtime

- [ ] The Docker image runs as non-root, includes Alembic, runs migrations at startup, and has a healthcheck
- [ ] Compose doesn't publish Postgres on 0.0.0.0, and the data volumes persist
- [ ] Every setting is in `.env.example` and validated at startup with clear errors
- [ ] Logs are structured and contain no PII

## Quality

- [ ] CI covers: backend lint, types and tests; frontend typecheck, lint, tests and build; Docker build; a Playwright smoke test
- [ ] Dependabot is on
- [ ] Lighthouse on the landing page: Performance 90+, Accessibility 100, Best Practices 95+, SEO 95+
- [ ] `axe` finds no serious issues on the main screens
- [ ] No JS chunk over 250 kB gzipped

## Product

- [ ] `make seed` gives a working demo in under 2 minutes
- [ ] The README has: a screenshot or GIF, a quick start, a config table, an architecture diagram, the API overview and a security section
- [ ] DEPLOYMENT, USER_MANAGEMENT, SECURITY, CHANGELOG and LICENSE files exist
- [ ] A 404 page, a 500 page and per-route error boundaries exist
- [ ] Meta tags, an OG image, favicons and a manifest are in place
