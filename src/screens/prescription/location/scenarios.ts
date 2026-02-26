export type Apotheke = {
  id: string
  name: string
  address: string
  distance: string
  openUntil: string
  availability: 'available' | 'limited'
}

export type PrescriptionLocationData = {
  method: 'delivery' | 'pickup'
  savedAddress?: string
  deliveryNote?: string
  pickupView?: 'loading' | 'list' | 'selected'
  apotheken?: Apotheke[]
  selectedApothekeId?: string
}

const MOCK_APOTHEKEN: Apotheke[] = [
  { id: 'apo-001', name: 'APO Apotheke Marienplatz', address: 'Marienplatz 1, 80331 München', distance: '0.3 km', openUntil: '20:00', availability: 'available' },
  { id: 'apo-002', name: 'APO Apotheke Sendlinger Tor', address: 'Sendlinger Str. 5, 80331 München', distance: '0.8 km', openUntil: '18:30', availability: 'available' },
  { id: 'apo-003', name: 'APO Apotheke Stachus', address: 'Karlsplatz 3, 80335 München', distance: '1.2 km', openUntil: '19:00', availability: 'limited' },
]

export const regions = {
  location: {
    label: 'Location',
    isList: true,
    mockItems: MOCK_APOTHEKEN,
    states: {
      'delivery-prefilled': {
        method: 'delivery',
        savedAddress: 'Marienplatz 1, 80331 München',
        deliveryNote: '',
      },
      'delivery-empty': {
        method: 'delivery',
      },
      'pickup-loading': {
        method: 'pickup',
        pickupView: 'loading',
        apotheken: [] as Apotheke[],
      },
      'pickup-list': {
        method: 'pickup',
        pickupView: 'list',
        apotheken: MOCK_APOTHEKEN,
      },
      'pickup-selected': {
        method: 'pickup',
        pickupView: 'selected',
        apotheken: MOCK_APOTHEKEN,
        selectedApothekeId: 'apo-001',
      },
    },
    defaultState: 'delivery-prefilled',
  },
}
