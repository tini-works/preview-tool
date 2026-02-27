import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showInsurance: { label: 'Insurance Section', default: true },
  showFamilyMembers: { label: 'Family Members', default: true },
}
