# Playwright Testing Design

**Date:** 2026-02-26
**Status:** Approved

## Goal

Set up Playwright E2E testing for the preview tool's screens. Every screen gets co-located tests that verify each scenario renders without crashing. Tests integrate into the screen DoD via `verify-screen.sh`.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test purpose | Scenario rendering + flow navigation + DoD gate | Comprehensive regression safety net |
| Test location | Co-located (`src/screens/{section}/{screen}/*.spec.ts`) | Matches project's co-location pattern (en.json, de.json, scenarios.ts) |
| Test authoring | Auto-generated from `scenarios.ts` | Scalable — 18 screens, each with 3-6 states |
| Assertions | Render + no crash (frame not empty, no console errors) | Low-maintenance baseline; custom assertions added by editing |
| Navigation | UI-driven clicks (CatalogPanel + InspectorPanel) | No read-only file changes to App.tsx |
| Helper pattern | Playwright test fixtures | Idiomatic, auto-wires console capture, pre-scopes frame locator |
| Selector strategy | `data-testid` on 3 panels | Stable selectors; minimal scaffolding change (1 attribute each) |
| Browser | Chromium only | Preview tool, not a cross-browser production app |

## Architecture

```
                     ┌─────────────────────────────────┐
                     │        playwright.config.ts      │
                     │  testDir: src/screens             │
                     │  testMatch: **/*.spec.ts          │
                     │  webServer: pnpm dev :5173        │
                     └─────────────┬───────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                     ▼
   src/screens/_test-helpers/   scripts/           verify-screen.sh
   fixtures.ts                 generate-screen-     (check 7)
   • screen.select()           tests.ts
   • screen.switchState()      • reads scenarios.ts
   • screen.switchRegionState()• generates .spec.ts
   • screen.frame (locator)
   • console error capture
              │
              ▼
   src/screens/{section}/{screen}/*.spec.ts  (co-located, auto-generated)
```

## Fixtures API

```typescript
// src/screens/_test-helpers/fixtures.ts
import { test as base, expect } from '@playwright/test'

type ScreenFixtures = {
  screen: {
    select: (screenName: string) => Promise<void>
    switchState: (stateName: string) => Promise<void>
    switchRegionState: (regionLabel: string, stateName: string) => Promise<void>
    frame: Locator  // pre-scoped to device frame content
  }
}

export const test = base.extend<ScreenFixtures>({
  screen: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')

    const catalog = page.getByTestId('catalog-panel')
    const inspector = page.getByTestId('inspector-panel')
    const frame = page.getByTestId('device-frame')

    const helper = {
      select: async (name: string) => {
        await catalog.locator('button', { hasText: name }).click()
        await page.waitForTimeout(300)
      },
      switchState: async (state: string) => {
        await inspector.locator(`button:text-is("${state}")`).click()
        await page.waitForTimeout(200)
      },
      switchRegionState: async (region: string, state: string) => {
        const group = inspector.locator(`text="${region}"`).locator('..')
        await group.locator(`button:text-is("${state}")`).click()
        await page.waitForTimeout(200)
      },
      frame,
    }

    await use(helper)

    // After test: fail if console errors occurred
    if (errors.length > 0) {
      throw new Error(`Console errors during test:\n${errors.join('\n')}`)
    }
  },
})

export { expect }
```

## Test Shape

### Flat scenarios (e.g., scan)

```typescript
import { test, expect } from '../../_test-helpers/fixtures'

test.describe('prescription/scan', () => {
  test.beforeEach(async ({ screen }) => {
    await screen.select('scan')
  })

  test('idle — renders without error', async ({ screen }) => {
    await screen.switchState('idle')
    await expect(screen.frame).not.toBeEmpty()
  })

  test('scanning — renders without error', async ({ screen }) => {
    await screen.switchState('scanning')
    await expect(screen.frame).not.toBeEmpty()
  })
})
```

### Region-based (e.g., delivery)

```typescript
import { test, expect } from '../../_test-helpers/fixtures'

test.describe('prescription/delivery', () => {
  test.beforeEach(async ({ screen }) => {
    await screen.select('delivery')
  })

  test('delivery:none-selected — renders without error', async ({ screen }) => {
    await screen.switchRegionState('Delivery', 'none-selected')
    await expect(screen.frame).not.toBeEmpty()
  })
})
```

## Auto-Generator

**Script:** `scripts/generate-screen-tests.ts` (run with `tsx`)
**Command:** `pnpm generate:tests`

**Algorithm:**
1. Glob all `src/screens/**/scenarios.ts`
2. For each file, determine screen path and type:
   - If exports `scenarios` → flat, extract `Object.keys(scenarios)`
   - If exports `regions` → region-based, extract region label + state keys per region
3. Generate `.spec.ts` using the fixture template
4. Write to screen folder (overwrites existing generated files)

**Screen name extraction:** From the file path — `src/screens/prescription/scan/scenarios.ts` → screen name `scan`, describe label `prescription/scan`.

## Scaffolding Changes (data-testid)

Three minimal additions (1 attribute each):

| File | Change |
|------|--------|
| `src/devtools/CatalogPanel.tsx` | Add `data-testid="catalog-panel"` to root `<div>` |
| `src/devtools/InspectorPanel.tsx` | Add `data-testid="inspector-panel"` to root `<div>` |
| `src/preview/DeviceFrame.tsx` | Add `data-testid="device-frame"` to root `<div>` |

## DoD Integration

### verify-screen.sh — Check 7

```bash
# 7. Playwright tests pass
echo ""
echo "7. Playwright tests..."
if ls "$SCREEN_PATH"/*.spec.ts 1>/dev/null 2>&1; then
  if pnpm exec playwright test "$SCREEN_PATH/" 2>&1; then
    echo "   ✓ Playwright tests pass"
  else
    echo "   ✗ Playwright tests failed"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "   ⊘ No .spec.ts file found"
fi
```

### spec-template.md — Additional DoD command

```markdown
7. **Playwright tests pass:**
   \`\`\`bash
   pnpm exec playwright test {screen_path}/
   \`\`\`
```

## File Map

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Edit | Add `@playwright/test` devDep, `test:e2e` + `generate:tests` scripts |
| `playwright.config.ts` | Create | Config: testDir=`src/screens`, chromium, webServer |
| `src/screens/_test-helpers/fixtures.ts` | Create | Playwright fixture with screen helper |
| `src/devtools/CatalogPanel.tsx` | Edit | Add `data-testid="catalog-panel"` |
| `src/devtools/InspectorPanel.tsx` | Edit | Add `data-testid="inspector-panel"` |
| `src/preview/DeviceFrame.tsx` | Edit | Add `data-testid="device-frame"` |
| `scripts/generate-screen-tests.ts` | Create | Auto-generates .spec.ts from scenarios.ts |
| `~/.claude/skills/screen-spec/references/verify-screen.sh` | Edit | Add check 7 |
| `~/.claude/skills/screen-spec/references/spec-template.md` | Edit | Add Playwright to DoD |
| `src/screens/**/*.spec.ts` | Generated | One per screen |

## Verification

```bash
# Generate tests for all screens
pnpm generate:tests

# Run all tests
pnpm test:e2e

# Run tests for a specific screen
pnpm exec playwright test src/screens/prescription/delivery/

# Verify a screen (all DoD checks including Playwright)
bash ~/.claude/skills/screen-spec/references/verify-screen.sh prescription/delivery
```
