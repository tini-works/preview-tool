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
  { medication: 'Ibuprofen 400mg', dosage: '1 tablet, 3\u00d7 daily' },
  { medication: 'Amoxicillin 500mg', dosage: '1 capsule, 2\u00d7 daily' },
  { medication: 'Metformin 850mg', dosage: '1 tablet, 2\u00d7 daily' },
  { medication: 'Omeprazol 20mg', dosage: '1 capsule, 1\u00d7 daily' },
  { medication: 'Bisoprolol 5mg', dosage: '1 tablet, 1\u00d7 morning' },
  { medication: 'Pantoprazol 40mg', dosage: '1 tablet, 1\u00d7 daily' },
  { medication: 'Ramipril 5mg', dosage: '1 tablet, 1\u00d7 morning' },
  { medication: 'Simvastatin 20mg', dosage: '1 tablet, 1\u00d7 evening' },
  { medication: 'Levothyroxin 75\u00b5g', dosage: '1 tablet, 1\u00d7 morning' },
  { medication: 'Diclofenac 75mg', dosage: '1 tablet, 2\u00d7 daily' },
]

export const regions = {
  confirmation: {
    label: 'Confirmation',
    isList: true,
    mockItems: MOCK_PRESCRIPTIONS,
    defaultCount: 3,
    states: {
      'review-pickup': {
        state: 'review' as const,
        deliveryMethod: 'pickup' as const,
        prescriptions: MOCK_PRESCRIPTIONS,
        deliveryLabel: 'Apotheke Pickup',
        locationLabel: 'APO Apotheke Marienplatz',
        locationDetail: 'Marienplatz 1, 80331 M\u00fcnchen',
        timeline: 'Available today',
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        consentChecked: true,
      },
      'review-delivery': {
        state: 'review' as const,
        deliveryMethod: 'delivery' as const,
        prescriptions: MOCK_PRESCRIPTIONS,
        deliveryLabel: 'Home Delivery',
        locationLabel: 'Marienplatz 1, 80331 M\u00fcnchen',
        timeline: '1\u20133 business days',
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        consentChecked: false,
      },
      submitting: {
        state: 'submitting' as const,
        deliveryMethod: 'pickup' as const,
        prescriptions: MOCK_PRESCRIPTIONS,
        deliveryLabel: 'Apotheke Pickup',
        locationLabel: 'APO Apotheke Marienplatz',
        locationDetail: 'Marienplatz 1, 80331 M\u00fcnchen',
        timeline: 'Available today',
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        consentChecked: true,
      },
      'success-pickup': {
        state: 'success' as const,
        deliveryMethod: 'pickup' as const,
        prescriptions: MOCK_PRESCRIPTIONS,
        deliveryLabel: 'Apotheke Pickup',
        locationLabel: 'APO Apotheke Marienplatz',
        locationDetail: 'Marienplatz 1, 80331 M\u00fcnchen',
        timeline: 'Available today',
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        consentChecked: true,
      },
      'success-delivery': {
        state: 'success' as const,
        deliveryMethod: 'delivery' as const,
        prescriptions: MOCK_PRESCRIPTIONS,
        deliveryLabel: 'Home Delivery',
        locationLabel: 'Marienplatz 1, 80331 M\u00fcnchen',
        timeline: '1\u20133 business days',
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        consentChecked: true,
      },
    },
    defaultState: 'review-pickup',
  },
}
