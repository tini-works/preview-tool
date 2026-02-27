import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showRecentSearches: { label: 'Recent Searches', default: true },
  showSpecialties: { label: 'Specialties Filter', default: true },
}
