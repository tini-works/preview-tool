import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showInsurance: { label: 'Insurance Section', default: true },
  showConsent: { label: 'Consent Checkbox', default: true },
}
