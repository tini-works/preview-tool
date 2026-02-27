import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Simulate NFC Scan', navigate: '/prescription/list', navigateState: 'populated' },
  { trigger: 'Button:Try Again', setState: 'idle' },
]
