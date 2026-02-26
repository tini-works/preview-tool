import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Delivery Method', navigate: '/prescription-list', navigateState: 'populated' },
  { trigger: 'RadioCard:Home Delivery', setState: 'home-delivery' },
  { trigger: 'RadioCard:Apotheke Pickup', setState: 'apotheke-pickup' },
  { trigger: 'Button:Continue', navigate: '/prescription-location', navigateState: 'delivery-prefilled' },
]
