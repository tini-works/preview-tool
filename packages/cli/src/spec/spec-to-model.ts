import type { SpecManifestScreen } from './types.js'

export interface RegionDef {
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
  hookMapping?: {
    type: string
    hookName: string
    identifier: string
    importPath: string
  }
  translations?: Record<string, Record<string, unknown>>
  regionAliases?: string[]
}

export type RegionsMap = Record<string, RegionDef>

export interface ScreenEntryLike {
  route: string
  regions: RegionsMap
  flags?: Record<string, { label: string; default: boolean }>
  routeParams?: Record<string, string>
}

export function specToRegions(screen: SpecManifestScreen): RegionsMap {
  const region: RegionDef = {
    label: screen.title,
    defaultState: screen.defaultState ?? screen.states[0] ?? 'default',
    states: { ...screen.stateData },
  }

  if (screen.translations) {
    region.translations = screen.translations
  }

  if (screen.dataDeps.length > 0) {
    const dep = screen.dataDeps[0]
    region.hookMapping = {
      type: 'custom-hook',
      hookName: dep.hook,
      identifier: dep.hook,
      importPath: dep.module,
    }
  }

  return { [screen.id]: region }
}

export function specToScreenEntry(screen: SpecManifestScreen): ScreenEntryLike {
  return {
    route: screen.id,
    regions: specToRegions(screen),
    ...(screen.routeParams ? { routeParams: screen.routeParams } : {}),
  }
}
