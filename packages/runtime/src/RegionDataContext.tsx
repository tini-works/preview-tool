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
 * Supports two calling conventions:
 *
 * 1. **New pipeline (fast path):** `useRegionDataForHook('region-key')` — single
 *    argument, looks up region data directly by key.
 *
 * 2. **Legacy pipeline:** `useRegionDataForHook(hookType, identifier)` — two
 *    arguments, searches regions via hookMapping strategies (backward compat).
 *
 * @param hookTypeOrRegionKey - Region key (new pipeline) or hook type (legacy).
 * @param identifier - Hook-specific identifier (legacy only). Omit for new pipeline.
 * @returns The resolved state data or null if no matching region found.
 */
export function useRegionDataForHook(hookTypeOrRegionKey: string, identifier?: unknown): Record<string, unknown> | null {
  const ctx = useContext(RegionDataContext)
  if (!ctx) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[preview-tool] RegionDataContext is null — RegionDataProvider may not be mounted')
    }
    return null
  }

  const { regions, regionData } = ctx

  // Fast path: single-argument call with direct region key (new pipeline)
  if (identifier === undefined && regionData[hookTypeOrRegionKey]) {
    return (regionData[hookTypeOrRegionKey].stateData as Record<string, unknown>) ?? null
  }

  // Legacy path: hookType + identifier (old pipeline, backward compat)

  // Strategy 1: Match by hookMapping (primary)
  for (const [regionKey, region] of Object.entries(regions)) {
    const mapping = region.hookMapping as HookMapping | undefined
    if (!mapping) continue

    if (matchesHook(mapping, hookTypeOrRegionKey, identifier)) {
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
    console.warn(`[preview-tool] No matching region for hook: type=${hookTypeOrRegionKey}, identifier=${JSON.stringify(identifier)}`)
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
