# AGENTS.md

## Project Purpose

This repository is for automating the local PG test page flow.

The current v1 target is a local browser E2E test against:

`http://localhost/pg/pgfront.do`

## Source Of Truth

Before implementing or changing test code, read:

[`docs/pg-local-e2e-test-plan.md`](docs/pg-local-e2e-test-plan.md)

That document defines the current scope, target flow, assumptions, and excluded work.

## Current V1 Scope

- Stack: TypeScript + Playwright
- Target: local PG test page only
- Flow: page load, encryption, test submit, terms lookup, virtual authentication send, card point payment, confirmation, success assertion
- Default card point amount: `5000`

## Out Of Scope For V1

- GitHub Actions
- Slack or external alerting
- Production environment testing
- External side-effect validation such as real payment, SMS, email, inventory, settlement, or third-party integration effects

## Working Rules

- Do not scaffold Playwright or add test code unless explicitly requested.
- Keep implementation aligned with `docs/pg-local-e2e-test-plan.md`.
- If implementation needs to differ from the plan, update the plan document first.
- Keep local defaults configurable through environment variables when test code is later added.

## TypeScript Comment Style

- Write TypeScript comments in Korean unless preserving an external API name, selector, error message, or quoted UI text.
- Use TSDoc-style comments (`/** ... */`) for exported functions, classes, types, and reusable test helpers.
- Use short `//` comments only when they explain non-obvious intent, assumptions, or PG flow requirements.
- Prefer comments that explain why a step is necessary instead of restating what the code already says.
- Do not add decorative, redundant, or stale comments.
