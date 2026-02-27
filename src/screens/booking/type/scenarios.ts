export type BookingTypeData = {
  selectedType: 'acute' | 'prevention' | 'follow-up'
}

export const regions = {
  type: {
    label: 'Type',
    states: {
      acute: { selectedType: 'acute' } satisfies BookingTypeData,
      prevention: { selectedType: 'prevention' } satisfies BookingTypeData,
      'follow-up': { selectedType: 'follow-up' } satisfies BookingTypeData,
    },
    defaultState: 'acute',
  },
}
