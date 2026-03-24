import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateAll } from '../../generator/index.js'
import { DEFAULT_CONFIG } from '../../lib/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(__dirname, '../../../test-fixtures/sample-app')
const PREVIEW_DIR = join(FIXTURE_DIR, '.preview')
const SCENARIOS_DIR = join(PREVIEW_DIR, 'scenarios')

const skipIfNoFixture = existsSync(FIXTURE_DIR) ? describe : describe.skip

skipIfNoFixture('scenario generation integration', () => {
  beforeAll(async () => {
    await generateAll(FIXTURE_DIR, DEFAULT_CONFIG)
  }, 120_000)

  it('creates scenarios directory', () => {
    expect(existsSync(SCENARIOS_DIR)).toBe(true)
  })

  it('creates at least one scenario file', () => {
    const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
  })

  it('each file exports scenarios and defaultScenario', () => {
    const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
    for (const file of files) {
      const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
      expect(content).toContain('export const scenarios')
      expect(content).toContain('export const defaultScenario')
    }
  })

  it('at least one file has a non-unknown source', () => {
    const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
    const hasKnownSource = files.some(file => {
      const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
      return (
        content.includes('"library"') ||
        content.includes('"use-state-enum"') ||
        content.includes('"heuristic"') ||
        content.includes('"use-reducer"')
      )
    })
    expect(hasKnownSource).toBe(true)
  })

  it('no file contains new Error(', () => {
    const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
    for (const file of files) {
      const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
      expect(content).not.toContain('new Error(')
    }
  })

  it('generates a scenario file for the products screen (Layer 1: useQuery)', () => {
    // products screen imports useQuery from @tanstack/react-query
    // deriveStateMachine Layer 1 should produce idle/loading/success/error states
    const productsFile = join(SCENARIOS_DIR, 'products.ts')
    expect(existsSync(productsFile)).toBe(true)
    const content = readFileSync(productsFile, 'utf-8')
    expect(content).toContain('"library"')
    expect(content).toContain('"success"')
  })

  it('generates a scenario file for the checkout screen (Layer 1: useForm)', () => {
    // checkout screen imports useForm from react-hook-form
    // deriveStateMachine Layer 1 should produce form states (idle/dirty/submitting/...)
    const checkoutFile = join(SCENARIOS_DIR, 'checkout.ts')
    expect(existsSync(checkoutFile)).toBe(true)
    const content = readFileSync(checkoutFile, 'utf-8')
    expect(content).toContain('"form"')
  })
})
