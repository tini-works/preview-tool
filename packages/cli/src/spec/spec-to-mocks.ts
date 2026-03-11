import type { SpecDataDep, SpecManifestScreen } from './types.js'

const NOOP = '(() => {}) as any'

function isLikelySetter(field: string): boolean {
  return /^set[A-Z]/.test(field) || /^toggle[A-Z]/.test(field) || /^reset[A-Z]/.test(field)
}

export function generateMockCode(
  screen: SpecManifestScreen,
  dep: SpecDataDep
): string {
  const dataFields = dep.provides.filter((f) => !isLikelySetter(f))
  const setterFields = dep.provides.filter((f) => isLikelySetter(f))

  const stateObj = dataFields
    .map((f) => `    ${f}: regionData?.${f} ?? null,`)
    .join('\n')

  const setterObj = setterFields
    .map((f) => `    ${f}: ${NOOP},`)
    .join('\n')

  const allFields = [stateObj, setterObj].filter(Boolean).join('\n')

  const lines = [
    `// Auto-generated spec-driven mock for ${dep.module}`,
    `export * from '__real:${dep.module}'`,
    '',
    `import { useRegionDataForHook } from '@preview-tool/runtime'`,
    '',
    `export function ${dep.hook}(...args: any[]) {`,
    `  const regionData = useRegionDataForHook('${screen.id}')`,
    `  const state = {`,
    allFields,
    `  }`,
    '',
    `  // Support Zustand selector pattern`,
    `  if (typeof args[0] === 'function') {`,
    `    try { return args[0](state) } catch { return state }`,
    `  }`,
    '',
    `  return state`,
    `}`,
  ]

  return lines.join('\n')
}

export function generateAllMockCode(
  screens: SpecManifestScreen[]
): Map<string, string> {
  const mockModules = new Map<string, string>()
  const seen = new Set<string>()

  for (const screen of screens) {
    for (const dep of screen.dataDeps) {
      const key = `${dep.module}::${dep.hook}`
      if (seen.has(key)) continue
      seen.add(key)
      mockModules.set(key, generateMockCode(screen, dep))
    }
  }

  return mockModules
}

export function generateAliasManifest(
  screens: SpecManifestScreen[]
): Record<string, string> {
  const manifest: Record<string, string> = {}
  const seen = new Set<string>()

  for (const screen of screens) {
    for (const dep of screen.dataDeps) {
      if (seen.has(dep.module)) continue
      seen.add(dep.module)
      manifest[dep.module] = `virtual:spec-mock:${dep.module}`
    }
  }

  return manifest
}
