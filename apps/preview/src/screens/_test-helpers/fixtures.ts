import { test as base, expect, type Locator } from '@playwright/test'

type ScreenHelper = {
  /** Click a screen by path in the CatalogPanel sidebar (e.g., "scan" or "prescription/scan") */
  select: (screenPath: string) => Promise<void>
  /** Switch state for a region (find region label, then click state button) */
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
      select: async (screenPath: string) => {
        // screenPath can be "scan" (standalone) or "prescription/scan" (sectioned)
        const parts = screenPath.split('/')
        const name = parts[parts.length - 1]
        if (parts.length > 1) {
          // Scope within the section group: find <p>SECTION</p> → go to parent <div>
          const section = parts[0]
          const sectionGroup = catalog.locator(`p:text-is("${section.toUpperCase()}")`).locator('..')
          await sectionGroup.locator(`button:has(span:text-is("${name}"))`).click()
        } else {
          await catalog.locator(`button:has(span:text-is("${name}"))`).click()
        }
        // Wait for lazy-loaded screen component to render
        await page.waitForTimeout(500)
      },
      switchRegionState: async (region: string, state: string) => {
        // DOM: <div.region-container> → <div><span>{label}</span></div> → <div><button>...</button></div>
        // Navigate from label span → parent div → grandparent region container
        const regionGroup = inspector.locator(`text="${region}"`).locator('..').locator('..')
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
