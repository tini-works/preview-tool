export type Apotheke = {
  id: string
  name: string
  address: string
  distance: string
  openUntil: string
  availability: 'available' | 'limited'
}

export type PrescriptionDeliveryData = {
  selected: 'none' | 'delivery' | 'pickup'
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
  { id: 'apo-004', name: 'Rosen Apotheke', address: 'Rosenstraße 8, 80331 München', distance: '1.5 km', openUntil: '18:00', availability: 'available' },
  { id: 'apo-005', name: 'Viktualienmarkt Apotheke', address: 'Viktualienmarkt 2, 80331 München', distance: '1.8 km', openUntil: '19:30', availability: 'available' },
  { id: 'apo-006', name: 'Isartor Apotheke', address: 'Isartorplatz 6, 80331 München', distance: '2.1 km', openUntil: '17:30', availability: 'limited' },
  { id: 'apo-007', name: 'Maximilians Apotheke', address: 'Maximilianstr. 15, 80539 München', distance: '2.4 km', openUntil: '20:00', availability: 'available' },
  { id: 'apo-008', name: 'Gärtnerplatz Apotheke', address: 'Gärtnerplatz 1, 80469 München', distance: '2.7 km', openUntil: '18:00', availability: 'available' },
  { id: 'apo-009', name: 'Fraunhofer Apotheke', address: 'Fraunhoferstr. 22, 80469 München', distance: '3.0 km', openUntil: '19:00', availability: 'limited' },
  { id: 'apo-010', name: 'Schwabing Apotheke', address: 'Leopoldstr. 44, 80802 München', distance: '3.5 km', openUntil: '20:00', availability: 'available' },
]

export const regions = {
  delivery: {
    label: 'Delivery',
    isList: true,
    mockItems: MOCK_APOTHEKEN,
    defaultCount: 3,
    states: {
      'none-selected': {
        selected: 'none' as const,
      },
      'home-delivery-prefilled': {
        selected: 'delivery' as const,
        savedAddress: 'Marienplatz 1, 80331 München',
        deliveryNote: '',
      },
      'home-delivery-empty': {
        selected: 'delivery' as const,
      },
      'apotheke-loading': {
        selected: 'pickup' as const,
        pickupView: 'loading' as const,
        apotheken: [] as Apotheke[],
      },
      'apotheke-list': {
        selected: 'pickup' as const,
        pickupView: 'list' as const,
        apotheken: MOCK_APOTHEKEN,
      },
      'apotheke-selected': {
        selected: 'pickup' as const,
        pickupView: 'selected' as const,
        apotheken: MOCK_APOTHEKEN,
        selectedApothekeId: 'apo-001',
      },
    },
    defaultState: 'none-selected',
  },
}
