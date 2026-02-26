export type BookingTypeData = {
  selectedType: 'acute' | 'prevention' | 'follow-up'
}

export const scenarios = {
  acute: {
    label: 'Acute appointment selected',
    data: { selectedType: 'acute' } satisfies BookingTypeData,
  },
  prevention: {
    label: 'Prevention appointment selected',
    data: { selectedType: 'prevention' } satisfies BookingTypeData,
  },
  'follow-up': {
    label: 'Follow-up appointment selected',
    data: { selectedType: 'follow-up' } satisfies BookingTypeData,
  },
}
