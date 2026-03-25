import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'

export interface PreviewConfig {
  screenGlob: string
  port: number
  title: string
  cssEntry?: string
  specsDir?: string
}

const PreviewConfigSchema = z.object({
  screenGlob: z.string().optional(),
  port: z.number().int().positive().optional(),
  title: z.string().optional(),
  cssEntry: z.string().optional(),
  specsDir: z.string().optional(),
})

export const DEFAULT_CONFIG: PreviewConfig = {
  screenGlob: 'src/**/*.tsx',
  port: 6100,
  title: 'Preview Tool',
}

export const PREVIEW_DIR = '.preview'

/**
 * Auto-detect .specs/ directory by searching upward from cwd.
 * Checks: cwd/.specs, parent/.specs, grandparent/.specs
 */
function autoDetectSpecsDir(cwd: string): string | undefined {
  const candidates = [
    join(cwd, '.specs'),
    join(resolve(cwd, '..'), '.specs'),
    join(resolve(cwd, '../..'), '.specs'),
  ]
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'screens'))) {
      return candidate
    }
  }
  return undefined
}

export async function readConfig(cwd: string): Promise<PreviewConfig> {
  const configPath = join(cwd, PREVIEW_DIR, 'preview.config.json')
  let config: PreviewConfig
  try {
    const raw = await readFile(configPath, 'utf-8')
    const result = PreviewConfigSchema.safeParse(JSON.parse(raw))
    const partial = result.success ? result.data : {}
    config = { ...DEFAULT_CONFIG, ...partial }
  } catch {
    config = { ...DEFAULT_CONFIG }
  }

  // Auto-detect specs dir if not explicitly configured
  if (!config.specsDir) {
    config.specsDir = autoDetectSpecsDir(cwd)
  }

  return config
}

export async function writeConfig(cwd: string, config: PreviewConfig): Promise<void> {
  const dir = join(cwd, PREVIEW_DIR)
  await mkdir(dir, { recursive: true })
  const configPath = join(dir, 'preview.config.json')
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
