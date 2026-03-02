import type { ScreenManifestEntry } from '../analyzer/types.js'

function resolveScreenImport(filePath: string): string {
  // The .preview/ directory uses @host alias → cwd/src
  // Convert "src/pages/home.tsx" → "@host/pages/home.tsx"
  if (filePath.startsWith('src/')) {
    return '@host/' + filePath.slice(4)
  }
  return '../' + filePath
}

function formatRegions(entry: ScreenManifestEntry): string {
  if (entry.regions.length === 0) {
    return '[]'
  }

  const regionEntries = entry.regions.map((region) => {
    const statesStr = JSON.stringify(region.states)
    return `    {
      name: ${JSON.stringify(region.name)},
      label: ${JSON.stringify(region.label)},
      states: ${statesStr},
      defaultState: ${JSON.stringify(region.defaultState)},
      isList: ${region.isList},
    }`
  })

  return `[\n${regionEntries.join(',\n')}\n  ]`
}

export function generateScreenRegistry(
  screens: readonly ScreenManifestEntry[],
): string {
  if (screens.length === 0) {
    return `export const screens = [];\n`
  }

  const entries = screens.map((screen) => {
    const regions = formatRegions(screen)
    return `  {
    name: ${JSON.stringify(screen.name)},
    route: ${JSON.stringify(screen.path)},
    module: () => import(${JSON.stringify(resolveScreenImport(screen.file))}),
    regions: ${regions},
  }`
  })

  return `export const screens = [\n${entries.join(',\n')}\n];\n`
}
