export type BookingLocationData = {
  view: 'initial' | 'search-results' | 'selected'
}

export const regions = {
  location: {
    label: 'Location',
    states: {
      initial: { view: 'initial' } satisfies BookingLocationData,
      'search-results': { view: 'search-results' } satisfies BookingLocationData,
      selected: { view: 'selected' } satisfies BookingLocationData,
    },
    defaultState: 'initial',
  },
}
