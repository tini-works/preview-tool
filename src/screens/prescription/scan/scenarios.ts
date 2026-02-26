export type PrescriptionScanData = {
  state: 'idle' | 'scanning' | 'success' | 'error'
}

export const scenarios = {
  idle: {
    label: 'Ready to scan insurance card',
    data: { state: 'idle' } satisfies PrescriptionScanData,
  },
  scanning: {
    label: 'Scanning insurance card',
    data: { state: 'scanning' } satisfies PrescriptionScanData,
  },
  success: {
    label: 'Card verified successfully',
    data: { state: 'success' } satisfies PrescriptionScanData,
  },
  error: {
    label: 'Card not recognized',
    data: { state: 'error' } satisfies PrescriptionScanData,
  },
}
