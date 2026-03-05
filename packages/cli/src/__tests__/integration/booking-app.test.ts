import { describe, it, expect } from 'vitest'
import { resolveSource } from '../../resolver/resolve-source.js'
import { detectFramework } from '../../resolver/detect-framework.js'
import { generateWrapperCode } from '../../resolver/generate-wrapper.js'
import { discoverScreens } from '../../analyzer/discover.js'
import { collectAllFacts } from '../../analyzer/collect-facts.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BOOKING_APP = join(process.env.HOME ?? '', 'Desktop/booking/client')
const skipIfNoBookingApp = existsSync(BOOKING_APP) ? describe : describe.skip

skipIfNoBookingApp('booking app integration', () => {
  it('resolves local path', async () => {
    const resolved = await resolveSource(BOOKING_APP)
    expect(resolved.isRemote).toBe(false)
    expect(resolved.cwd).toBe(BOOKING_APP)
  })

  it('detects React + Vite', async () => {
    const framework = await detectFramework(BOOKING_APP)
    expect(framework.name).toBe('react')
    expect(framework.bundler).toBe('vite')
  })

  it('detects providers', async () => {
    const framework = await detectFramework(BOOKING_APP)
    expect(framework.providers).toContain('@tanstack/react-query')
    expect(framework.providers).toContain('react-router-dom')
    expect(framework.providers).toContain('react-i18next')
  })

  it('detects page pattern', async () => {
    const framework = await detectFramework(BOOKING_APP)
    expect(framework.pagePattern).toBe('src/pages/**/*.tsx')
  })

  it('discovers screens (at least 5)', async () => {
    const framework = await detectFramework(BOOKING_APP)
    const screens = await discoverScreens(BOOKING_APP, framework.pagePattern)
    expect(screens.length).toBeGreaterThanOrEqual(5)

    const routes = screens.map(s => s.route)
    expect(routes).toContain('/')
    expect(routes).toContain('/login')
    expect(routes).toContain('/register')
  })

  it('generates wrapper with detected providers', async () => {
    const framework = await detectFramework(BOOKING_APP)
    const code = generateWrapperCode(framework.providers)
    expect(code).toContain('QueryClientProvider')
    expect(code).toContain('MemoryRouter')
    expect(code).toContain('I18nextProvider')
  })

  it('collects facts from booking app screens', async () => {
    const framework = await detectFramework(BOOKING_APP)
    const screens = await discoverScreens(BOOKING_APP, framework.pagePattern)

    const screenInputs = screens.map(s => ({
      filePath: s.filePath,
      route: s.route,
      exportName: s.exportName,
    }))
    const allFacts = await collectAllFacts(screenInputs)

    // Should collect facts for all screens
    expect(allFacts.length).toBe(screens.length)

    // At least one screen should have hooks or components
    const hasContent = allFacts.some(f =>
      f.hooks.length > 0 || f.components.length > 0
    )
    expect(hasContent).toBe(true)
  })

  it('collects hook import paths from booking app facts', async () => {
    const framework = await detectFramework(BOOKING_APP)
    const screens = await discoverScreens(BOOKING_APP, framework.pagePattern)

    const screenInputs = screens.map(s => ({
      filePath: s.filePath,
      route: s.route,
      exportName: s.exportName,
    }))
    const allFacts = await collectAllFacts(screenInputs)

    // Every hook should have a non-empty importPath
    const allHooks = allFacts.flatMap(f => f.hooks)
    expect(allHooks.length).toBeGreaterThan(0)
    for (const hook of allHooks) {
      expect(hook.importPath).toBeTruthy()
    }
  })
})
