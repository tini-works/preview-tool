export type PrescriptionScanData = {
  state: 'idle' | 'scanning' | 'success' | 'error'
}

export const regions = {
  scan: {
    label: 'Scan',
    states: {
      idle: { state: 'idle' } satisfies PrescriptionScanData,
      scanning: { state: 'scanning' } satisfies PrescriptionScanData,
      success: { state: 'success' } satisfies PrescriptionScanData,
      error: { state: 'error' } satisfies PrescriptionScanData,
    },
    defaultState: 'idle',
  },
}
