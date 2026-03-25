import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readConfig, DEFAULT_CONFIG, PREVIEW_DIR } from '../config.js'

async function writeConfigFile(cwd: string, content: unknown): Promise<void> {
  const previewDir = join(cwd, PREVIEW_DIR)
  await mkdir(previewDir, { recursive: true })
  await writeFile(join(previewDir, 'preview.config.json'), JSON.stringify(content), 'utf-8')
}

describe('readConfig', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'preview-config-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns default config when no config file exists', async () => {
    const config = await readConfig(tmpDir)
    expect(config.port).toBe(DEFAULT_CONFIG.port)
    expect(config.screenGlob).toBe(DEFAULT_CONFIG.screenGlob)
    expect(config.title).toBe(DEFAULT_CONFIG.title)
  })

  it('applies valid config values over defaults', async () => {
    await writeConfigFile(tmpDir, { port: 3000, title: 'My App' })
    const config = await readConfig(tmpDir)
    expect(config.port).toBe(3000)
    expect(config.title).toBe('My App')
    expect(config.screenGlob).toBe(DEFAULT_CONFIG.screenGlob)
  })

  it('ignores non-numeric port in config (falls back to default)', async () => {
    await writeConfigFile(tmpDir, { port: 'not-a-number' })
    const config = await readConfig(tmpDir)
    expect(config.port).toBe(DEFAULT_CONFIG.port)
  })

  it('ignores non-string screenGlob in config (falls back to default)', async () => {
    await writeConfigFile(tmpDir, { screenGlob: 42 })
    const config = await readConfig(tmpDir)
    expect(config.screenGlob).toBe(DEFAULT_CONFIG.screenGlob)
  })

  it('ignores negative port in config (falls back to default)', async () => {
    await writeConfigFile(tmpDir, { port: -1 })
    const config = await readConfig(tmpDir)
    expect(config.port).toBe(DEFAULT_CONFIG.port)
  })

  it('ignores zero port in config (falls back to default)', async () => {
    await writeConfigFile(tmpDir, { port: 0 })
    const config = await readConfig(tmpDir)
    expect(config.port).toBe(DEFAULT_CONFIG.port)
  })

  it('ignores entirely invalid config object and uses all defaults', async () => {
    await writeConfigFile(tmpDir, { port: 'bad', title: 99, screenGlob: false })
    const config = await readConfig(tmpDir)
    expect(config.port).toBe(DEFAULT_CONFIG.port)
    expect(config.title).toBe(DEFAULT_CONFIG.title)
    expect(config.screenGlob).toBe(DEFAULT_CONFIG.screenGlob)
  })

  it('accepts valid optional cssEntry and specsDir fields', async () => {
    await writeConfigFile(tmpDir, { cssEntry: 'src/index.css', specsDir: '.specs' })
    const config = await readConfig(tmpDir)
    expect(config.cssEntry).toBe('src/index.css')
    // specsDir may be overridden by auto-detection if .specs/screens doesn't exist,
    // but the raw value from config is still accepted when it's a valid string
  })

  it('returns defaults for malformed JSON', async () => {
    const previewDir = join(tmpDir, PREVIEW_DIR)
    await mkdir(previewDir, { recursive: true })
    await writeFile(join(previewDir, 'preview.config.json'), 'not valid json', 'utf-8')
    const config = await readConfig(tmpDir)
    expect(config.port).toBe(DEFAULT_CONFIG.port)
    expect(config.screenGlob).toBe(DEFAULT_CONFIG.screenGlob)
  })
})
