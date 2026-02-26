import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Delivery Address', navigate: '/prescription-delivery', navigateState: 'home-delivery' },
  { trigger: 'ScreenHeader:Choose Apotheke', navigate: '/prescription-delivery', navigateState: 'apotheke-pickup' },
  { trigger: 'Button:Continue', navigate: '/prescription-confirmation' },
]
