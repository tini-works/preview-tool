import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'RadioCard:Home Delivery', setState: 'home-delivery' },
  { trigger: 'RadioCard:Apotheke Pickup', setState: 'apotheke-pickup' },
  { trigger: 'Button:Continue', navigate: '/prescription/location', navigateState: 'pickup-selected' },
  { trigger: 'ScreenHeader:Delivery Method', navigate: '/prescription/list', navigateState: 'populated' },
]
