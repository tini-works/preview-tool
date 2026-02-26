import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Review & Confirm', navigate: '/prescription-location', navigateState: 'delivery-prefilled' },
  { trigger: 'ScreenHeader:Redeem Prescription', navigate: '/prescription-scan', navigateState: 'idle' },
  { trigger: 'Button:Confirm Redemption', setRegionState: { region: 'confirmation', state: 'success-pickup' } },
  { trigger: 'Button:Back to Home', navigate: '/prescription-scan', navigateState: 'idle' },
]
