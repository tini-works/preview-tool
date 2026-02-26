# Plan: Set Up Playwright & Test Prescription Screens

## Context

The project has no testing infrastructure. We need to install Playwright and write E2E tests for the 4 prescription screens. The app uses a **state-based devtools panel** (not URL routing) — screens are selected by clicking in a left catalog panel, and states are switched via buttons in a right inspector panel. The dev server runs on `localhost:5173` via `pnpm dev`.

## Setup

### 1. Install Playwright

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Only chromium — this is a preview tool, not a cross-browser production app.

### 2. Create `playwright.config.ts`

- `testDir: './e2e'`
- `baseURL: 'http://localhost:5173'`
- `webServer.command: 'pnpm dev'`, `port: 5173`, `reuseExistingServer: !process.env.CI`

### 3. Add script to `package.json`

`"test:e2e": "playwright test"`

## Test File

Single file: **`e2e/prescription-flow.spec.ts`**

### Navigation pattern

The app has no URL router. To reach a screen:
1. Go to `http://localhost:5173`
2. Click screen button in left catalog panel: `button:has(span:text-is("scan"))`
3. Wait for screen to load
4. Switch state via right inspector panel: `button:text-is("idle")`

All content assertions target the **device frame** area. Use a scoped locator to avoid matching sidebar text:
```ts
const screen = page.locator('[style*="zoom"]')
```

### Test structure

Use `test.describe` per screen. A shared `beforeEach` navigates to the screen. Individual tests switch states and assert content.

### Test cases (18 total)

**Screen 1: scan** (4 tests — flat scenarios)

| State | Visible | Not visible |
|-------|---------|-------------|
| `idle` | "Hold your insurance card near your phone", "Simulate NFC Scan", "Powered by APO group" | "Card verified!", error note |
| `scanning` | "Reading card..." | error note |
| `success` | "Card verified!" | "Simulate NFC Scan", error note |
| `error` | "Card not recognized", "Try Again" | "Simulate NFC Scan" |

**Screen 2: list** (3 tests — region: prescriptions)

| State | Visible | Not visible |
|-------|---------|-------------|
| `loading` | "TK Techniker Krankenkasse", "Loading prescriptions..." | "Ibuprofen", "Select all" |
| `empty` | "No prescriptions found" | "Ibuprofen", "Select all" |
| `populated` | "Ibuprofen 400mg", "Amoxicillin 500mg", "Metformin 850mg", "Ready", "Pending", "Select all", "Continue" | "No prescriptions found" |

**Screen 3: delivery** (6 tests — region: delivery)

| State | Visible | Not visible |
|-------|---------|-------------|
| `none-selected` | "Home Delivery", "Apotheke Pickup", Continue disabled | address form, map |
| `home-delivery-prefilled` | "Saved Address", "Marienplatz 1, 80331 München", "Change" | map, Apotheke list |
| `home-delivery-empty` | "Street", "House Number", "Postal Code", "City" | "Saved Address", map |
| `apotheke-loading` | "Map view", loading spinner | Apotheke cards |
| `apotheke-list` | "3 Apotheken nearby", "APO Apotheke Marienplatz" | spinner |
| `apotheke-selected` | "APO Apotheke Marienplatz", Continue enabled | spinner |

**Screen 4: confirmation** (5 tests — region: confirmation)

| State | Visible | Not visible |
|-------|---------|-------------|
| `review-pickup` | "Ibuprofen 400mg", "Apotheke Pickup", "APO Apotheke Marienplatz", "TK Techniker Krankenkasse", "Confirm Redemption" | "Prescription Redeemed!" |
| `review-delivery` | "Home Delivery", "Marienplatz 1, 80331 München" | "Apotheke Pickup" |
| `submitting` | "Processing..." button | "Confirm Redemption" text |
| `success-pickup` | "Prescription Redeemed!", "pickup at APO Apotheke Marienplatz", "Back to Home" | "PRESCRIPTIONS", "Confirm Redemption" |
| `success-delivery` | "Prescription Redeemed!", "delivered to Marienplatz", "Back to Home" | "Confirm Redemption" |

## Files

| File | Action |
|------|--------|
| `playwright.config.ts` | Create |
| `e2e/prescription-flow.spec.ts` | Create |
| `package.json` | Add `test:e2e` script + `@playwright/test` devDep |

## Verification

```bash
pnpm test:e2e
```

Run `pnpm test:e2e --headed` if debugging failures.
