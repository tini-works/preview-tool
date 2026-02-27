import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showFavorites: { label: 'Favorite Doctors', default: true },
}
