import type { ScreenManifestEntry } from '../analyzer/types.js'

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
    module: () => import(${JSON.stringify(screen.file)}),
    regions: ${regions},
  }`
  })

  return `export const screens = [\n${entries.join(',\n')}\n];\n`
}
