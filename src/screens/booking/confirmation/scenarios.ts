export type BookingConfirmationData = {
  status: 'searching' | 'found'
}

export const regions = {
  confirmation: {
    label: 'Confirmation',
    states: {
      searching: { status: 'searching' } satisfies BookingConfirmationData,
      found: { status: 'found' } satisfies BookingConfirmationData,
    },
    defaultState: 'searching',
  },
}
