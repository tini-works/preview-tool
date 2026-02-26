export type BookingConfirmationData = {
  status: 'searching' | 'found'
}

export const scenarios = {
  searching: {
    label: 'Finding a doctor match',
    data: { status: 'searching' } satisfies BookingConfirmationData,
  },
  found: {
    label: 'Match found successfully',
    data: { status: 'found' } satisfies BookingConfirmationData,
  },
}
