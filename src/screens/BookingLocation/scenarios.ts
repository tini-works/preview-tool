export type BookingLocationData = {
  view: 'initial' | 'search-results' | 'selected'
}

export const scenarios = {
  initial: {
    label: 'No location selected',
    data: { view: 'initial' } satisfies BookingLocationData,
  },
  'search-results': {
    label: 'Showing address search results',
    data: { view: 'search-results' } satisfies BookingLocationData,
  },
  selected: {
    label: 'Location selected',
    data: { view: 'selected' } satisfies BookingLocationData,
  },
}
