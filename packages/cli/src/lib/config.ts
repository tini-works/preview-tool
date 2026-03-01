import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LLMConfig } from '../llm/types.js'

export interface PreviewConfig {
  screenGlob: string
  port: number
  title: string
  llm: LLMConfig
}

export const DEFAULT_CONFIG: PreviewConfig = {
  screenGlob: 'src/**/*.tsx',
  port: 6100,
  title: 'Preview Tool',
  llm: {
    provider: 'auto' as const,
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
  },
}

export const PREVIEW_DIR = '.preview'

export async function readConfig(cwd: string): Promise<PreviewConfig> {
  const configPath = join(cwd, PREVIEW_DIR, 'preview.config.json')
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PreviewConfig> & { llm?: Partial<LLMConfig> }
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      llm: { ...DEFAULT_CONFIG.llm, ...(parsed.llm ?? {}) },
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function writeConfig(cwd: string, config: PreviewConfig): Promise<void> {
  const dir = join(cwd, PREVIEW_DIR)
  await mkdir(dir, { recursive: true })
  const configPath = join(dir, 'preview.config.json')
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
