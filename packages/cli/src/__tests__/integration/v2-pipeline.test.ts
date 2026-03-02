import { describe, it, expect, afterAll } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { generateAll } from '../../generator/index.js'
import { DEFAULT_CONFIG } from '../../lib/config.js'

describe('v2 pipeline integration', () => {
  const sampleApp = path.resolve(__dirname, '../../../test-fixtures/sample-app')
  const previewDir = path.join(sampleApp, '.preview')

  afterAll(() => {
    // Cleanup generated files
    fs.rmSync(previewDir, { recursive: true, force: true })
  })

  it('discovers screens, generates mocks and registry', async () => {
    const result = await generateAll(sampleApp, DEFAULT_CONFIG)

    expect(result.screensFound).toBeGreaterThan(0)

    // Check .preview directory was created
    expect(fs.existsSync(previewDir)).toBe(true)

    // Check manifest was written
    const manifest = JSON.parse(
      fs.readFileSync(path.join(previewDir, 'manifest.json'), 'utf-8'),
    )
    expect(manifest.screens.length).toBeGreaterThan(0)

    // Check alias manifest
    expect(fs.existsSync(path.join(previewDir, 'alias-manifest.json'))).toBe(true)

    // Check screen registry
    expect(fs.existsSync(path.join(previewDir, 'screens.ts'))).toBe(true)

    // Check mocks directory has files
    const mocksDir = path.join(previewDir, 'mocks')
    expect(fs.existsSync(mocksDir)).toBe(true)
    const mockFiles = fs.readdirSync(mocksDir)
    expect(mockFiles.length).toBeGreaterThan(0)
  })
})
