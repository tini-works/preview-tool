import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showDeliveryNote: { label: 'Delivery Note', default: true },
  showMap: { label: 'Map View', default: true },
}
