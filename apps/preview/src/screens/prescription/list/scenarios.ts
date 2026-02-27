export type Prescription = {
  id: string
  medication: string
  dosage: string
  doctor: string
  date: string
  status: 'ready' | 'pending' | 'expired'
}

export type PrescriptionListData = {
  view: 'loading' | 'empty' | 'populated'
  insurer: string
  memberId: string
  prescriptions: Prescription[]
  selectedIds: string[]
}

const MOCK_PRESCRIPTIONS: Prescription[] = [
  { id: 'rx-001', medication: 'Ibuprofen 400mg', dosage: '1 tablet, 3\u00D7 daily', doctor: 'Dr. Schmidt', date: '20 Feb 2026', status: 'ready' },
  { id: 'rx-002', medication: 'Amoxicillin 500mg', dosage: '1 capsule, 2\u00D7 daily', doctor: 'Dr. Weber', date: '18 Feb 2026', status: 'ready' },
  { id: 'rx-003', medication: 'Metformin 850mg', dosage: '1 tablet, 2\u00D7 daily', doctor: 'Dr. Fischer', date: '25 Feb 2026', status: 'pending' },
  { id: 'rx-004', medication: 'Omeprazol 20mg', dosage: '1 capsule, 1\u00D7 daily', doctor: 'Dr. M\u00FCller', date: '15 Feb 2026', status: 'ready' },
  { id: 'rx-005', medication: 'Bisoprolol 5mg', dosage: '1 tablet, 1\u00D7 morning', doctor: 'Dr. Hoffmann', date: '12 Feb 2026', status: 'ready' },
  { id: 'rx-006', medication: 'Pantoprazol 40mg', dosage: '1 tablet, 1\u00D7 daily', doctor: 'Dr. Becker', date: '10 Feb 2026', status: 'expired' },
  { id: 'rx-007', medication: 'Ramipril 5mg', dosage: '1 tablet, 1\u00D7 morning', doctor: 'Dr. Wagner', date: '8 Feb 2026', status: 'ready' },
  { id: 'rx-008', medication: 'Simvastatin 20mg', dosage: '1 tablet, 1\u00D7 evening', doctor: 'Dr. Braun', date: '5 Feb 2026', status: 'pending' },
  { id: 'rx-009', medication: 'Levothyroxin 75\u00B5g', dosage: '1 tablet, 1\u00D7 morning', doctor: 'Dr. Zimmermann', date: '3 Feb 2026', status: 'ready' },
  { id: 'rx-010', medication: 'Diclofenac 75mg', dosage: '1 tablet, 2\u00D7 daily', doctor: 'Dr. Hartmann', date: '1 Feb 2026', status: 'expired' },
]

export const regions = {
  prescriptions: {
    label: 'Prescriptions',
    isList: true,
    mockItems: MOCK_PRESCRIPTIONS,
    defaultCount: 3,
    states: {
      loading: {
        view: 'loading' as const,
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        prescriptions: [] as Prescription[],
        selectedIds: [] as string[],
      },
      empty: {
        view: 'empty' as const,
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        prescriptions: [] as Prescription[],
        selectedIds: [] as string[],
      },
      populated: {
        view: 'populated' as const,
        insurer: 'TK Techniker Krankenkasse',
        memberId: 'A123456789',
        prescriptions: MOCK_PRESCRIPTIONS,
        selectedIds: ['rx-001', 'rx-002'],
      },
    },
    defaultState: 'populated',
  },
}
