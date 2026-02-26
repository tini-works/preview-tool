interface SearchField {
  icon: string
  label: string
  description: string
  filled: boolean
  required?: boolean
}

export type BookingSearchData = {
  fields: SearchField[]
  reason: string
  canSearch: boolean
  isSearching: boolean
}

const emptyFields: SearchField[] = [
  { icon: '📋', label: 'Booking type', description: 'Select type...', filled: false },
  { icon: '👤', label: 'Book appointment for', description: 'Select patient...', filled: false },
  { icon: '📅', label: 'Time slots', description: 'Select preferred times...', filled: false },
  { icon: '📍', label: 'Location', description: 'Select location...', filled: false, required: true },
]

const partialFields: SearchField[] = [
  { icon: '📋', label: 'Booking type', description: 'Acute', filled: true },
  { icon: '👤', label: 'Book appointment for', description: 'Sarah M.', filled: true },
  { icon: '📅', label: 'Time slots', description: '15 slots selected', filled: true },
  { icon: '📍', label: 'Location', description: 'Select location...', filled: false, required: true },
]

const readyFields: SearchField[] = [
  { icon: '📋', label: 'Booking type', description: 'Acute', filled: true },
  { icon: '👤', label: 'Book appointment for', description: 'Sarah M.', filled: true },
  { icon: '📅', label: 'Time slots', description: '15 slots selected', filled: true },
  { icon: '📍', label: 'Location', description: 'Friedrichstr. 123, Berlin', filled: true },
]

export const regions = {
  search: {
    label: 'Search',
    states: {
      empty: { fields: emptyFields, reason: '', canSearch: false, isSearching: false },
      partial: { fields: partialFields, reason: 'Persistent headache for 3 days', canSearch: false, isSearching: false },
      ready: { fields: readyFields, reason: 'Persistent headache for 3 days', canSearch: true, isSearching: false },
      loading: { fields: readyFields, reason: 'Persistent headache for 3 days', canSearch: false, isSearching: true },
    },
    defaultState: 'empty',
  },
}

export const flags = {
  showRecentSearches: { label: 'Recent Searches', default: true },
  showSpecialties: { label: 'Specialties Filter', default: true },
}
