import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showSelectAll: { label: 'Select All', default: true },
  showStatusBadges: { label: 'Status Badges', default: true },
}
