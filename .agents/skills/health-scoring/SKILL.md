---
name: health-scoring
description: Rules for the code health engine in Repository Scanner Engine (health score, tech debt, dependency risk, hotspots, the Code Health and Overview pages). Use when changing metrics, thresholds, weights, baselines, secret detection, file classification, findings, or how the score and its explanation are shown.
---

# Health scoring rules

The score answers one question: "Where will this code be hard and risky to change, and why?" It does not check style.

## Measurements

- The main complexity signal is cognitive complexity (SonarSource definition), along with nesting depth.
- **Function length never takes off points by itself.** A long function gets a finding only if it is also complex (for example, length > 80 and cognitive complexity > 15). A long, flat function gets no finding.
- Coupling counts only resolved local imports. Check the standard library first (`sys.stdlib_module_names`), then installed packages, and only then local files. Never report a file as importing itself.
- Each rule has exactly one threshold, defined in one place. `tech_debt.py` and `dependency_risk.py` reuse the same metrics.
- Score only `source` files. Tests, examples, docs, generated, vendored and migration files are reported but not scored.
- Coverage comes from a real report or is marked "unknown". Never guess it.
- Dependency issues come from OSV. If the check didn't run, mark it "not checked", never "pass".
- Secrets need a provider pattern or high entropy. Skip placeholders, docstrings, comments, tests and `.env.example`. Always mask the value.

## Scoring

- Score each signal against per-language benchmark baselines (`health_baselines.json`) with a smooth curve. Never use fixed point deductions with caps.
- Measure the share of code affected (weighted by lines of code), never raw counts. The same code at 1× and 20× size gives the same band (±3).
- Multiply by confidence: high 1.0, medium 0.6, low 0.3.
- Signals that don't apply are left out and their weight is spread across the rest. Coverage under 50% → "Not enough data to rate".
- Bands are A to E. Never show "Grade F".
- Every result stores `scoring_version` and `baselines_version`.

## Showing the score

- Overview and Code Health use the same cached result and the same band function. They must never disagree.
- Every point taken off links to a finding the user can open, with file and line, the reason, the confidence and the score effect.
- There is one findings count, and it matches the list.
- No "-0 pts" rows, and no "no deductions" next to deductions.
- Dismissing a finding needs a reason, and the effect is shown openly.

## Never

- Never tune thresholds by hand to make one repository pass. Change them only against the benchmark set.
- Never call a low-confidence finding "critical".

## Before finishing any scoring change

Run the metric unit tests and the benchmark test. The reference projects must stay at B or higher, and the messy sample repositories at D or lower. Paste the results table into the Walkthrough.
