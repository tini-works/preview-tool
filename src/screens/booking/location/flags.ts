import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showCurrentLocation: { label: 'Use Current Location', default: true },
  showRecentLocations: { label: 'Recent Locations', default: true },
}
