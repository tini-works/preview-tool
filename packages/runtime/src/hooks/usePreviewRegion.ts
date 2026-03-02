import { useDevToolsStore } from '../store/index.ts'

interface PreviewRegionState {
  readonly state: string
  readonly listCount: number
}

export function usePreviewRegion(regionName: string): PreviewRegionState {
  const regionStates = useDevToolsStore(s => s.regionStates)
  const regionListCounts = useDevToolsStore(s => s.regionListCounts)

  return {
    state: regionStates[regionName] ?? 'populated',
    listCount: regionListCounts[regionName] ?? 3,
  }
}
