import { createContext, useContext, type ReactNode } from 'react'
import type { RegionsMap, RegionDataMap, HookMapping } from './types.ts'

interface RegionDataContextValue {
  regions: RegionsMap
  regionData: RegionDataMap
}

const RegionDataContext = createContext<RegionDataContextValue | null>(null)

interface RegionDataProviderProps {
  regions: RegionsMap
  regionData: RegionDataMap
  children: ReactNode
}

export function RegionDataProvider({ regions, regionData, children }: RegionDataProviderProps) {
  return (
    <RegionDataContext.Provider value={{ regions, regionData }}>
      {children}
    </RegionDataContext.Provider>
  )
}

/**
 * Resolve region data for a mock hook call.
 *
 * Mock hooks call this with their hook type and identifier (e.g., queryKey).
 * It searches all regions for a matching hookMapping and returns the
 * current state data for that region.
 *
 * @param hookType - The type of hook: 'query-hook', 'custom-hook', 'store', etc.
 * @param identifier - Hook-specific identifier: queryKey array, sectionId string, etc.
 * @returns The resolved state data or null if no matching region found.
 */
export function useRegionDataForHook(hookType: string, identifier: unknown): Record<string, unknown> | null {
  const ctx = useContext(RegionDataContext)
  if (!ctx) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[preview-tool] RegionDataContext is null — RegionDataProvider may not be mounted')
    }
    return null
  }

  const { regions, regionData } = ctx

  // Strategy 1: Match by hookMapping (primary)
  for (const [regionKey, region] of Object.entries(regions)) {
    const mapping = region.hookMapping as HookMapping | undefined
    if (!mapping) continue

    if (matchesHook(mapping, hookType, identifier)) {
      return (regionData[regionKey]?.stateData as Record<string, unknown>) ?? null
    }
  }

  // Strategy 2: Match by region key directly (for hooks that pass sectionId = regionKey)
  if (typeof identifier === 'string' && regionData[identifier]) {
    return (regionData[identifier].stateData as Record<string, unknown>) ?? null
  }

  // Strategy 3: Match queryKey first element against region keys
  if (Array.isArray(identifier) && identifier.length > 0) {
    const first = String(identifier[0])
    if (regionData[first]) {
      return (regionData[first].stateData as Record<string, unknown>) ?? null
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(`[preview-tool] No matching region for hook: type=${hookType}, identifier=${JSON.stringify(identifier)}`)
  }

  return null
}

function matchesHook(mapping: HookMapping, hookType: string, identifier: unknown): boolean {
  // query-hook: match by queryKey prefix
  if (hookType === 'query-hook' && mapping.type === 'query-hook') {
    if (Array.isArray(identifier)) {
      const first = String(identifier[0] ?? '')
      return first === mapping.identifier || first.startsWith(mapping.identifier)
    }
    if (typeof identifier === 'string') {
      return identifier === mapping.identifier || identifier.startsWith(mapping.identifier)
    }
  }

  // custom-hook: match by sectionId
  if (hookType === 'custom-hook' && mapping.type === 'custom-hook') {
    return identifier === mapping.identifier
  }

  // store: match by store/selector identifier
  if (hookType === 'store' && mapping.type === 'store') {
    return identifier === mapping.identifier
  }

  // context: match by context name
  if (hookType === 'context' && mapping.type === 'context') {
    return identifier === mapping.identifier
  }

  // unknown: always match if types align
  if (mapping.type === 'unknown') {
    return typeof identifier === 'string' && identifier === mapping.identifier
  }

  return false
}
