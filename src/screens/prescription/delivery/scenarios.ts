export type PrescriptionDeliveryData = {
  selected: 'none' | 'delivery' | 'pickup'
}

export const scenarios = {
  'none-selected': {
    label: 'No delivery method selected',
    data: { selected: 'none' } satisfies PrescriptionDeliveryData,
  },
  'home-delivery': {
    label: 'Home delivery selected',
    data: { selected: 'delivery' } satisfies PrescriptionDeliveryData,
  },
  'apotheke-pickup': {
    label: 'Apotheke pickup selected',
    data: { selected: 'pickup' } satisfies PrescriptionDeliveryData,
  },
}
