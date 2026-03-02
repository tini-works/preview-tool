import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PreviewConfig } from '../lib/config.js'
import type {
  ClassifiedHook,
  GenerationManifest,
  ScreenManifestEntry,
  ScreenRegion,
} from '../analyzer/types.js'
import { discoverScreens } from '../analyzer/discover-screens.js'
import { extractHooks } from '../analyzer/extract-hooks.js'
import { classifyHook } from '../analyzer/classify-hook.js'
import { inferRegions } from '../analyzer/infer-regions.js'
import { generateMockModule } from './generate-mocks.js'
import { generateScreenRegistry } from './generate-registry.js'
import { generateAliasManifest, sanitizeFileName } from './generate-alias.js'

interface GenerationResult {
  readonly screensFound: number
  readonly regionsInferred: number
  readonly mocksGenerated: number
}

const SKIP_MOCK_CATEGORIES = new Set(['state', 'unknown'])

export async function generateAll(
  cwd: string,
  _config: PreviewConfig,
): Promise<GenerationResult> {
  const previewDir = join(cwd, '.preview')
  const mocksDir = join(previewDir, 'mocks')

  await mkdir(previewDir, { recursive: true })
  await mkdir(mocksDir, { recursive: true })

  // Step 1: Discover screens
  const screens = await discoverScreens(cwd)

  // Step 2: For each screen, analyze hooks and infer regions
  const allClassifiedHooks: ClassifiedHook[] = []
  const screenEntries: ScreenManifestEntry[] = []
  let totalRegions = 0

  for (const screen of screens) {
    const filePath = join(cwd, screen.file)
    const source = await readFile(filePath, 'utf-8')

    const extractedHooks = extractHooks(source, screen.file)
    const classified = extractedHooks.map((h) => classifyHook(h))
    const regions = inferRegions(classified)

    allClassifiedHooks.push(...classified)
    totalRegions += regions.length

    screenEntries.push({
      name: screen.name,
      path: screen.path,
      file: screen.file,
      regions,
    })
  }

  // Step 3: Generate mock modules (one per unique import path, skip state + unknown)
  const processedImports = new Set<string>()
  let mocksGenerated = 0

  for (const hook of allClassifiedHooks) {
    if (SKIP_MOCK_CATEGORIES.has(hook.category)) {
      continue
    }

    if (processedImports.has(hook.importPath)) {
      continue
    }

    processedImports.add(hook.importPath)

    // Gather all regions from all screens for this hook's region name
    const relevantRegions: ScreenRegion[] = []
    for (const entry of screenEntries) {
      for (const region of entry.regions) {
        if (region.name === hook.regionName) {
          relevantRegions.push(region)
        }
      }
    }

    const mockCode = generateMockModule(hook, relevantRegions)
    const fileName = sanitizeFileName(hook.importPath)
    const mockFilePath = join(mocksDir, `${fileName}.js`)

    await writeFile(mockFilePath, mockCode, 'utf-8')
    mocksGenerated++
  }

  // Step 4: Generate alias manifest
  const aliases = generateAliasManifest(allClassifiedHooks, '.preview/mocks')
  await writeFile(
    join(previewDir, 'alias-manifest.json'),
    JSON.stringify(aliases, null, 2) + '\n',
    'utf-8',
  )

  // Step 5: Generate screen registry
  const registryCode = generateScreenRegistry(screenEntries)
  await writeFile(join(previewDir, 'screens.ts'), registryCode, 'utf-8')

  // Step 6: Write manifest
  const manifest: GenerationManifest = {
    screens: screenEntries,
    aliases,
    mocksDir: '.preview/mocks',
  }
  await writeFile(
    join(previewDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  )

  return {
    screensFound: screens.length,
    regionsInferred: totalRegions,
    mocksGenerated,
  }
}
