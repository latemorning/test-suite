# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Playwright E2E test suite for a local Korean PG (payment gateway) test page at `http://localhost/pg/pgfront.do`. Tests card point payment flows, family point discount flows, and PG API integration flows.

**Source of truth for scope and design decisions:** `docs/pg-local-e2e-test-plan.md` — read before implementing or changing test code. If implementation must differ from the plan, update the plan first.

---

## Commands

```bash
npm install                     # install dependencies
npx playwright install chromium # install browser (or npm run install:browsers)
npm run service:up              # start local Docker service
npm run service:logs            # stream service logs

npm test                        # run all tests
npm run test:smoke              # page load verification only
npm run test:payment            # card point payment tests
npm run test:family-payment     # family point discount tests
npm run test:api-terms          # PG API terms flow tests
npm run test:api-point          # PG API point payment tests

npm run test:headed             # run with visible browser (250ms slowMo by default)
npm run test:ui                 # Playwright UI mode
npm run test:debug              # Playwright debug mode
```

Override slow-motion timing in headed mode:
```bash
HEADED_SLOW_MO_MS=500 npm run test:headed
```

---

## Architecture

### Test organization

Each flow has a dedicated spec file tagged for selective execution:

| Spec | Tag | Flow |
|---|---|---|
| `tests/pg/smoke.spec.ts` | `@smoke` | Page load check |
| `tests/pg/payment.spec.ts` | `@payment` | Card point payment |
| `tests/pg/family-payment.spec.ts` | `@family-payment` | Family point discount |
| `tests/pg/api-terms.spec.ts` | `@api-terms` | API terms lookup/agreement |
| `tests/pg/api-point-payment.spec.ts` | `@api-point` | Full API point payment |

### Scenario-driven test generation

Tests are generated from data matrices defined in `tests/pg/scenarios.ts`, not hardcoded. Each scenario combines a PG provider, shop, payment amount, and expected outcome. Spec files loop over the scenario list and call `test()` for each entry. To add a new test case, add a scenario to `scenarios.ts` (usually driven by environment variables).

```typescript
// Pattern used in all spec files
for (const scenario of paymentScenarios) {
  test(scenario.name, async ({ page }) => { ... })
}
```

### Page object models

All UI interaction logic lives in page classes under `tests/pg/`:
- `pg-page.ts` — entry form (PG provider selection, shop, amount, submit)
- `card-point-payment-page.ts` — standard card point payment popup
- `settle-combined-payment-page.ts` — combined payment variant popup
- `family-payment-page.ts` — family point discount popup
- `api-terms-page.ts`, `api-point-page.ts` — API flow pages

### Cross-cutting helpers

- `page-actions.ts` — `clickAndMaybeGetPopup()`, `findButton()` (multi-strategy Korean UI button lookup), `withAutoAcceptDialogs()`, `resolveUsablePage()`
- `assertions.ts` — `expectSuccessAlert()`, `expectPageText()`, `getVisibleTextSnapshot()` (failure diagnostics)
- `point-conversion.ts` — card exchange rate logic; Hyundai has a 2:3 ratio (현대카드: 사용포인트 2 → 전환포인트 3), all others default to 1:1

### Environment configuration

`tests/support/env.ts` loads `.env` with a custom parser (no external dependency) and exports a typed `env` object with defaults. All test parameters — URLs, PG providers, amounts, shop codes, success patterns — are configurable here. See `.env.example` for all available variables.

Key variables:
- `PG_FRONT_URL` — default `http://localhost/pg/pgfront.do`
- `CARD_POINT_AMOUNTS` — comma-separated list, e.g. `5000,10000`
- `PAYMENT_PG_PROVIDER_NAMES` — comma-separated PG provider display names
- `FAMILY_PAYMENT_AMOUNTS` — amounts including edge-case values (900 → unit error, 501000 → limit error)

---

## Playwright Configuration

- Browser: Chromium only, headless by default
- `fullyParallel: false` (sequential execution)
- Retries: 0
- Timeouts: 120s per test, 15s per action, 30s navigation, 10s expect
- Failure artifacts: trace, screenshot, video saved to `playwright-report/`

---

## TypeScript Comment Style

- Write comments in **Korean** unless preserving an external API name, selector, error message, or quoted UI text.
- Use `/** TSDoc */` for all exported functions, classes, and types.
- Use `//` only to explain non-obvious intent, assumptions, or PG flow requirements — not to restate what the code does.

---

## Scope Boundaries (V1)

**In scope:** page load, encryption, test submit, terms lookup, virtual authentication, card point payment, confirmation, success assertion against `http://localhost/pg/pgfront.do`.

**Out of scope:** GitHub Actions CI, Slack/external alerting, production environment testing, real payment side-effect validation (SMS, email, settlement, inventory).
