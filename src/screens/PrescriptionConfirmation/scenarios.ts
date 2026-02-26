export type ConfirmationPrescription = {
  medication: string
  dosage: string
}

export type PrescriptionConfirmationData = {
  state: 'review' | 'submitting' | 'success'
  deliveryMethod: 'delivery' | 'pickup'
  prescriptions: ConfirmationPrescription[]
  deliveryLabel: string
  locationLabel: string
  locationDetail?: string
  timeline: string
  insurer: string
  memberId: string
  consentChecked: boolean
}

const MOCK_PRESCRIPTIONS: ConfirmationPrescription[] = [
  { medication: 'Ibuprofen 400mg', dosage: '1 tablet, 3× daily' },
  { medication: 'Amoxicillin 500mg', dosage: '1 capsule, 2× daily' },
]

export const scenarios = {
  'review-pickup': {
    label: 'Review with Apotheke pickup',
    data: {
      state: 'review',
      deliveryMethod: 'pickup',
      prescriptions: MOCK_PRESCRIPTIONS,
      deliveryLabel: 'Apotheke Pickup',
      locationLabel: 'APO Apotheke Marienplatz',
      locationDetail: 'Marienplatz 1, 80331 München',
      timeline: 'Available today',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      consentChecked: true,
    } satisfies PrescriptionConfirmationData,
  },
  'review-delivery': {
    label: 'Review with home delivery',
    data: {
      state: 'review',
      deliveryMethod: 'delivery',
      prescriptions: MOCK_PRESCRIPTIONS,
      deliveryLabel: 'Home Delivery',
      locationLabel: 'Marienplatz 1, 80331 München',
      timeline: '1–3 business days',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      consentChecked: false,
    } satisfies PrescriptionConfirmationData,
  },
  submitting: {
    label: 'Submitting redemption',
    data: {
      state: 'submitting',
      deliveryMethod: 'pickup',
      prescriptions: MOCK_PRESCRIPTIONS,
      deliveryLabel: 'Apotheke Pickup',
      locationLabel: 'APO Apotheke Marienplatz',
      locationDetail: 'Marienplatz 1, 80331 München',
      timeline: 'Available today',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      consentChecked: true,
    } satisfies PrescriptionConfirmationData,
  },
  'success-pickup': {
    label: 'Redemption success (pickup)',
    data: {
      state: 'success',
      deliveryMethod: 'pickup',
      prescriptions: MOCK_PRESCRIPTIONS,
      deliveryLabel: 'Apotheke Pickup',
      locationLabel: 'APO Apotheke Marienplatz',
      locationDetail: 'Marienplatz 1, 80331 München',
      timeline: 'Available today',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      consentChecked: true,
    } satisfies PrescriptionConfirmationData,
  },
  'success-delivery': {
    label: 'Redemption success (delivery)',
    data: {
      state: 'success',
      deliveryMethod: 'delivery',
      prescriptions: MOCK_PRESCRIPTIONS,
      deliveryLabel: 'Home Delivery',
      locationLabel: 'Marienplatz 1, 80331 München',
      timeline: '1–3 business days',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      consentChecked: true,
    } satisfies PrescriptionConfirmationData,
  },
}
