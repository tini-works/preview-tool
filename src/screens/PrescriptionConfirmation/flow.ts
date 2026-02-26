import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Review & Confirm', navigate: '/prescription-location' },
  { trigger: 'Button:Confirm Redemption', setRegionState: { region: 'confirmation', state: 'success-pickup' } },
  { trigger: 'Button:Back to Home', navigate: '/prescription-scan', navigateState: 'idle' },
]
