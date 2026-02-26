import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Continue', navigate: '/prescription/confirmation', navigateState: 'review-pickup' },
  { trigger: 'ScreenHeader:Choose Apotheke', navigate: '/prescription/delivery', navigateState: 'apotheke-pickup' },
  { trigger: 'ScreenHeader:Delivery Address', navigate: '/prescription/delivery', navigateState: 'home-delivery' },
]
