import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'RadioCard:Home Delivery', setRegionState: { region: 'delivery', state: 'home-delivery-prefilled' } },
  { trigger: 'RadioCard:Apotheke Pickup', setRegionState: { region: 'delivery', state: 'apotheke-loading' } },
  { trigger: 'Button:Continue', navigate: '/prescription/confirmation', navigateState: 'review-pickup' },
  { trigger: 'ScreenHeader:Delivery', navigate: '/prescription/list', navigateState: 'populated' },
]
