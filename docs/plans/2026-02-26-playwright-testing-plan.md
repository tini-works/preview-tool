# Playwright Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up co-located Playwright E2E tests for all 18 screens, auto-generated from `scenarios.ts`, with DoD integration.

**Architecture:** Playwright fixtures provide a `screen` helper that navigates via UI clicks (CatalogPanel + InspectorPanel). A Node.js generator script reads every `scenarios.ts` file and produces a `.spec.ts` per screen. Check 7 in `verify-screen.sh` gates screen completion on test passage.

**Tech Stack:** `@playwright/test`, Chromium, Node.js `.mjs` generator script

**Design doc:** `docs/plans/2026-02-26-playwright-testing-design.md`

---

### Task 1: Install Playwright and configure

**Files:**
- Modify: `package.json:6-10` (scripts), `:31-46` (devDependencies)
- Create: `playwright.config.ts`

**Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
```

**Step 2: Install Chromium browser**

```bash
pnpm exec playwright install chromium
```

**Step 3: Add scripts to package.json**

Add these two entries to the `"scripts"` block:

```json
"test:e2e": "playwright test",
"generate:tests": "node scripts/generate-screen-tests.mjs"
```

**Step 4: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'src/screens',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Step 5: Verify config is recognized**

```bash
pnpm exec playwright test --list
```

Expected: 0 tests found (no spec files yet), no config errors.

**Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts
git commit -m "chore: install Playwright and add config"
```

---

### Task 2: Add data-testid attributes to scaffolding panels

**Files:**
- Modify: `src/devtools/CatalogPanel.tsx:68` — expanded root div
- Modify: `src/devtools/CatalogPanel.tsx:55` — collapsed root div
- Modify: `src/devtools/InspectorPanel.tsx:83` — expanded root div
- Modify: `src/devtools/InspectorPanel.tsx:70` — collapsed root div
- Modify: `src/preview/DeviceFrame.tsx:83` — root div

**Step 1: Add `data-testid="catalog-panel"` to CatalogPanel**

In `src/devtools/CatalogPanel.tsx`, there are two return paths (collapsed and expanded). Add `data-testid` to both root divs.

Collapsed (line 55):
```tsx
// Before:
<div className="flex h-full w-10 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
// After:
<div data-testid="catalog-panel" className="flex h-full w-10 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
```

Expanded (line 68):
```tsx
// Before:
<div className="flex h-full w-56 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
// After:
<div data-testid="catalog-panel" className="flex h-full w-56 flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
```

**Step 2: Add `data-testid="inspector-panel"` to InspectorPanel**

In `src/devtools/InspectorPanel.tsx`, two return paths.

Collapsed (line 70):
```tsx
// Before:
<div className="flex h-full w-10 flex-shrink-0 flex-col border-l border-neutral-200 bg-white">
// After:
<div data-testid="inspector-panel" className="flex h-full w-10 flex-shrink-0 flex-col border-l border-neutral-200 bg-white">
```

Expanded (line 83):
```tsx
// Before:
<div className="flex h-full w-72 flex-shrink-0 flex-col border-l border-neutral-200 bg-white">
// After:
<div data-testid="inspector-panel" className="flex h-full w-72 flex-shrink-0 flex-col border-l border-neutral-200 bg-white">
```

**Step 3: Add `data-testid="device-frame"` to DeviceFrame**

In `src/preview/DeviceFrame.tsx`, line 83:
```tsx
// Before:
<div
  ref={containerRef}
  className="flex flex-1 items-center justify-center overflow-hidden"
>
// After:
<div
  ref={containerRef}
  data-testid="device-frame"
  className="flex flex-1 items-center justify-center overflow-hidden"
>
```

**Step 4: Verify app still works**

```bash
pnpm exec tsc --noEmit
```

Expected: no new errors.

**Step 5: Commit**

```bash
git add src/devtools/CatalogPanel.tsx src/devtools/InspectorPanel.tsx src/preview/DeviceFrame.tsx
git commit -m "chore: add data-testid to CatalogPanel, InspectorPanel, DeviceFrame"
```

---

### Task 3: Create Playwright test fixtures

**Files:**
- Create: `src/screens/_test-helpers/fixtures.ts`

**Step 1: Create the fixtures file**

```typescript
import { test as base, expect, type Locator } from '@playwright/test'

type ScreenHelper = {
  /** Click a screen by name in the CatalogPanel sidebar */
  select: (screenName: string) => Promise<void>
  /** Switch state for flat-scenario screens (click state button in InspectorPanel) */
  switchState: (stateName: string) => Promise<void>
  /** Switch state for region-based screens (find region label, then click state button) */
  switchRegionState: (regionLabel: string, stateName: string) => Promise<void>
  /** Locator scoped to the DeviceFrame content area */
  frame: Locator
}

type ScreenFixtures = {
  screen: ScreenHelper
}

export const test = base.extend<ScreenFixtures>({
  screen: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')

    const catalog = page.getByTestId('catalog-panel')
    const inspector = page.getByTestId('inspector-panel')
    const frame = page.getByTestId('device-frame')

    const helper: ScreenHelper = {
      select: async (name: string) => {
        await catalog.locator('button', { hasText: name }).click()
        // Wait for lazy-loaded screen component to render
        await page.waitForTimeout(500)
      },
      switchState: async (state: string) => {
        await inspector.locator(`button:text-is("${state}")`).click()
        await page.waitForTimeout(300)
      },
      switchRegionState: async (region: string, state: string) => {
        // Region group: <span>{label}</span> is inside the region container
        // Navigate up to the container, then find the state button
        const regionGroup = inspector.locator(`text="${region}"`).locator('..')
        await regionGroup.locator(`button:text-is("${state}")`).click()
        await page.waitForTimeout(300)
      },
      frame,
    }

    await use(helper)

    // After test: fail if console errors occurred during rendering
    if (errors.length > 0) {
      throw new Error(
        `Console errors during test:\n${errors.join('\n')}`
      )
    }
  },
})

export { expect }
```

**Step 2: Verify TypeScript is happy**

```bash
pnpm exec tsc --noEmit
```

Expected: may warn about `@playwright/test` not being in tsconfig includes — that's fine, Playwright uses its own tsconfig. No blocking errors.

**Step 3: Commit**

```bash
git add src/screens/_test-helpers/fixtures.ts
git commit -m "feat(test): add Playwright screen test fixtures"
```

---

### Task 4: Write a manual smoke test for one screen

Before building the auto-generator, verify the fixture works end-to-end with one hand-written test.

**Files:**
- Create: `src/screens/prescription/scan/scan.spec.ts`

**Step 1: Write the test**

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

  test('success — renders without error', async ({ screen }) => {
    await screen.switchState('success')
    await expect(screen.frame).not.toBeEmpty()
  })

  test('error — renders without error', async ({ screen }) => {
    await screen.switchState('error')
    await expect(screen.frame).not.toBeEmpty()
  })
})
```

**Step 2: Run it**

```bash
pnpm test:e2e
```

Expected: 4 tests pass. If any fail, debug with:
```bash
pnpm test:e2e --headed --debug
```

Common issues:
- `data-testid` not found → check Task 2 was applied correctly
- Screen doesn't load → increase `waitForTimeout` in fixtures
- Console error caught → check if it's a pre-existing React warning (may need to filter `msg.type() === 'error'` more carefully)

**Step 3: Commit**

```bash
git add src/screens/prescription/scan/scan.spec.ts
git commit -m "test: add manual smoke test for prescription/scan"
```

---

### Task 5: Build the auto-generator script

**Files:**
- Create: `scripts/generate-screen-tests.mjs`

**Step 1: Create the generator**

The script needs to:
1. Find all `scenarios.ts` files
2. Detect flat (`export const scenarios`) vs region-based (`export const regions`)
3. Extract state keys (flat) or region labels + state keys (regions)
4. Generate a `.spec.ts` file per screen

```javascript
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, basename } from 'node:path'

const SCREENS_DIR = 'src/screens'
const HEADER = '// Auto-generated by scripts/generate-screen-tests.mjs — do not edit manually'

function findScenariosFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (entry === '_test-helpers' || entry === '_shared') continue
    if (statSync(full).isDirectory()) {
      results.push(...findScenariosFiles(full))
    } else if (entry === 'scenarios.ts') {
      results.push(full)
    }
  }
  return results
}

function parseScenarios(filePath) {
  const content = readFileSync(filePath, 'utf8')
  const screenDir = dirname(filePath)
  const rel = relative(SCREENS_DIR, screenDir) // e.g., "prescription/scan"
  const parts = rel.split('/')
  const screenName = parts[parts.length - 1]

  // Detect flat scenarios vs regions
  const hasRegions = /export\s+const\s+regions\s*=/.test(content)
  const hasScenarios = /export\s+const\s+scenarios\s*=/.test(content)

  if (hasRegions) {
    // Extract region entries: key → { label, states: { stateKey: ... } }
    const regions = []
    // Match region blocks: regionKey: { label: 'RegionLabel', ... states: { 'state-a': ..., 'state-b': ... } }
    const regionBlockRegex = /(\w+):\s*\{[^}]*label:\s*'([^']+)'[^]*?states:\s*\{([^]*?)\}\s*,\s*(?:defaultState|isList)/g
    let match
    while ((match = regionBlockRegex.exec(content)) !== null) {
      const [, regionKey, label, statesBlock] = match
      // Extract state keys from the states block
      const stateKeys = []
      const stateKeyRegex = /'([^']+)':/g
      let stateMatch
      while ((stateMatch = stateKeyRegex.exec(statesBlock)) !== null) {
        stateKeys.push(stateMatch[1])
      }
      regions.push({ key: regionKey, label, stateKeys })
    }
    return { type: 'regions', screenDir, screenName, describeName: rel, regions }
  }

  if (hasScenarios) {
    // Extract scenario keys from: scenarios = { key1: { ... }, key2: { ... } }
    const stateKeys = []
    // Match top-level keys in the scenarios object
    const scenariosMatch = content.match(/export\s+const\s+scenarios\s*=\s*\{([^]*)\}/)
    if (scenariosMatch) {
      const block = scenariosMatch[1]
      // Match keys that start a scenario entry (word at line start followed by colon, or quoted key)
      const keyRegex = /^\s+(\w[\w-]*):\s*\{/gm
      let keyMatch
      while ((keyMatch = keyRegex.exec(block)) !== null) {
        stateKeys.push(keyMatch[1])
      }
      // Also match quoted keys like 'some-key':
      const quotedKeyRegex = /^\s+'([\w-]+)':\s*\{/gm
      while ((keyMatch = quotedKeyRegex.exec(block)) !== null) {
        if (!stateKeys.includes(keyMatch[1])) {
          stateKeys.push(keyMatch[1])
        }
      }
    }
    return { type: 'scenarios', screenDir, screenName, describeName: rel, stateKeys }
  }

  return null
}

function computeFixturesImport(screenDir) {
  // Compute relative path from screenDir to src/screens/_test-helpers/fixtures
  const fixturesPath = join(SCREENS_DIR, '_test-helpers/fixtures')
  const rel = relative(screenDir, fixturesPath).replace(/\\/g, '/')
  return rel
}

function generateSpec(info) {
  const fixturesImport = computeFixturesImport(info.screenDir)
  const lines = [HEADER, '']
  lines.push(`import { test, expect } from '${fixturesImport}'`)
  lines.push('')
  lines.push(`test.describe('${info.describeName}', () => {`)
  lines.push(`  test.beforeEach(async ({ screen }) => {`)
  lines.push(`    await screen.select('${info.screenName}')`)
  lines.push(`  })`)

  if (info.type === 'scenarios') {
    for (const key of info.stateKeys) {
      lines.push('')
      lines.push(`  test('${key} — renders without error', async ({ screen }) => {`)
      lines.push(`    await screen.switchState('${key}')`)
      lines.push(`    await expect(screen.frame).not.toBeEmpty()`)
      lines.push(`  })`)
    }
  } else if (info.type === 'regions') {
    for (const region of info.regions) {
      for (const state of region.stateKeys) {
        lines.push('')
        lines.push(`  test('${region.key}:${state} — renders without error', async ({ screen }) => {`)
        lines.push(`    await screen.switchRegionState('${region.label}', '${state}')`)
        lines.push(`    await expect(screen.frame).not.toBeEmpty()`)
        lines.push(`  })`)
      }
    }
  }

  lines.push('})')
  lines.push('')
  return lines.join('\n')
}

// Main
const files = findScenariosFiles(SCREENS_DIR)
let generated = 0
let skipped = 0

for (const file of files) {
  const info = parseScenarios(file)
  if (!info) {
    console.log(`  skip: ${file} (no scenarios or regions found)`)
    skipped++
    continue
  }
  const specPath = join(info.screenDir, `${info.screenName}.spec.ts`)
  const content = generateSpec(info)
  writeFileSync(specPath, content, 'utf8')
  const stateCount = info.type === 'scenarios'
    ? info.stateKeys.length
    : info.regions.reduce((sum, r) => sum + r.stateKeys.length, 0)
  console.log(`  write: ${specPath} (${stateCount} tests)`)
  generated++
}

console.log(`\nDone: ${generated} spec files generated, ${skipped} skipped`)
```

**Step 2: Run the generator**

```bash
pnpm generate:tests
```

Expected output: ~16 lines showing generated spec files, one per screen. The prescription/scan one should be overwritten (replacing our manual test from Task 4 with the generated version — same content).

**Step 3: Verify generated files exist**

```bash
ls src/screens/**/\*.spec.ts
```

Expected: one `.spec.ts` in each screen folder.

**Step 4: Commit**

```bash
git add scripts/generate-screen-tests.mjs src/screens/**/*.spec.ts
git commit -m "feat(test): add test generator and generate specs for all screens"
```

---

### Task 6: Run all tests and fix issues

**Files:**
- May modify: `src/screens/_test-helpers/fixtures.ts` (if timing or selector adjustments needed)
- May modify: `scripts/generate-screen-tests.mjs` (if regex misses edge cases)

**Step 1: Run all tests**

```bash
pnpm test:e2e
```

Expected: most tests pass. Common failures:
- **Timeout on select**: screen name is ambiguous (e.g., "confirmation" exists in both booking and prescription). Fix: the CatalogPanel groups screens by section, and screen buttons show only the screen name. If there are duplicate screen names across sections, the `hasText` locator might match the wrong one. Investigate and fix the `select()` helper to be more precise if needed.
- **Region state button not found**: the regex in the generator missed some state keys. Fix: adjust regex and regenerate.
- **Console errors**: pre-existing React warnings. Fix: filter out known non-error warnings in fixtures.

**Step 2: Debug failures**

```bash
pnpm test:e2e --headed
```

For specific failing tests:
```bash
pnpm exec playwright test src/screens/prescription/delivery/ --headed --debug
```

**Step 3: Fix and re-run until green**

Iterate until all tests pass.

**Step 4: Commit fixes**

```bash
git add -u
git commit -m "fix(test): resolve test failures across all screens"
```

---

### Task 7: Update verify-screen.sh with Playwright check

**Files:**
- Modify: `~/.claude/skills/screen-spec/references/verify-screen.sh:129` (before the Summary section)

**Step 1: Add check 7 before the Summary block**

Insert this block between the forbidden colors check (ends at line 129) and the Summary section (starts at line 131):

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

**Step 2: Test the updated script**

```bash
bash ~/.claude/skills/screen-spec/references/verify-screen.sh prescription/scan
```

Expected: check 7 shows "Playwright tests pass" (assuming tests passed in Task 6).

**Step 3: No git commit** — this file lives outside the repo (`~/.claude/skills/`).

---

### Task 8: Update spec-template.md DoD section

**Files:**
- Modify: `~/.claude/skills/screen-spec/references/spec-template.md` (DoD section, after check 7 "All scenarios from spec")

**Step 1: Add check 8 to the DoD verification commands**

After the "All scenarios from spec" check (currently item 7 in spec-template.md), add:

```markdown
8. **Playwright tests pass:**
   ```bash
   pnpm exec playwright test {screen_path}/
   ```
```

**Step 2: No git commit** — this file lives outside the repo (`~/.claude/skills/`).

---

### Task 9: Final verification

**Step 1: Run all Playwright tests**

```bash
pnpm test:e2e
```

Expected: all tests pass.

**Step 2: Run verify-screen.sh on a prescription screen**

```bash
bash ~/.claude/skills/screen-spec/references/verify-screen.sh prescription/delivery
```

Expected: all 7 checks pass (or only check 3 fails due to pre-existing `hello-world` build error).

**Step 3: Run verify-screen.sh on a booking screen**

```bash
bash ~/.claude/skills/screen-spec/references/verify-screen.sh booking/search
```

Expected: similar result — checks pass, Playwright test runs.

**Step 4: Count total tests**

```bash
pnpm exec playwright test --list 2>&1 | tail -1
```

Expected: ~50-70 total tests across all screens.

**Step 5: Final commit with everything clean**

```bash
git status
```

If any unstaged changes remain, stage and commit appropriately.

---

## Summary

| Task | Description | Files | Est. |
|------|-------------|-------|------|
| 1 | Install Playwright + config | `package.json`, `playwright.config.ts` | 3 min |
| 2 | Add `data-testid` to 3 panels | `CatalogPanel.tsx`, `InspectorPanel.tsx`, `DeviceFrame.tsx` | 2 min |
| 3 | Create Playwright fixtures | `_test-helpers/fixtures.ts` | 3 min |
| 4 | Manual smoke test (1 screen) | `prescription/scan/scan.spec.ts` | 3 min |
| 5 | Build auto-generator script | `scripts/generate-screen-tests.mjs` | 5 min |
| 6 | Run all tests, fix failures | fixtures + generator tweaks | 10 min |
| 7 | Update `verify-screen.sh` | `verify-screen.sh` | 2 min |
| 8 | Update `spec-template.md` DoD | `spec-template.md` | 1 min |
| 9 | Final verification | — | 3 min |
