import { describe, it, expect } from 'vitest'
import { resolveSource } from '../../resolver/resolve-source.js'
import { detectFramework } from '../../resolver/detect-framework.js'
import { generateWrapperCode } from '../../resolver/generate-wrapper.js'
import { discoverScreens } from '../../analyzer/discover.js'
import { analyzeHooks } from '../../analyzer/analyze-hooks.js'
import { existsSync, readFileSync } from 'node:fs'
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

  it('analyzes hooks from booking app screens', async () => {
    const framework = await detectFramework(BOOKING_APP)
    const screens = await discoverScreens(BOOKING_APP, framework.pagePattern)

    // At least one screen should use useAppLiveQuery
    let foundDataHook = false
    let foundDevtoolStore = false
    let foundAuthStore = false

    for (const screen of screens) {
      try {
        const source = readFileSync(screen.filePath, 'utf-8')
        const result = analyzeHooks(source, screen.filePath)

        if (result.hooks.some(h => h.hookName === 'useAppLiveQuery')) {
          foundDataHook = true
        }
        if (result.imports.some(i => i.reason === 'devtool-store')) {
          foundDevtoolStore = true
        }
        if (result.imports.some(i => i.reason === 'auth-store')) {
          foundAuthStore = true
        }
      } catch {
        // Skip unreadable files
      }
    }

    expect(foundDataHook).toBe(true)
    expect(foundDevtoolStore).toBe(true)
    expect(foundAuthStore).toBe(true)
  })

  it('detects section IDs from booking app hooks', async () => {
    // Read the home page which has useAppLiveQuery with 'service-grid'
    const homePath = join(BOOKING_APP, 'src/pages/home.tsx')
    if (existsSync(homePath)) {
      const source = readFileSync(homePath, 'utf-8')
      const result = analyzeHooks(source, homePath)

      const sectionIds = result.hooks.map(h => h.sectionId).filter(Boolean)
      expect(sectionIds.length).toBeGreaterThan(0)
    }
  })
})
