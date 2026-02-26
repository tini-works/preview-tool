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
  { id: 'rx-001', medication: 'Ibuprofen 400mg', dosage: '1 tablet, 3× daily', doctor: 'Dr. Schmidt', date: '20 Feb 2026', status: 'ready' },
  { id: 'rx-002', medication: 'Amoxicillin 500mg', dosage: '1 capsule, 2× daily', doctor: 'Dr. Weber', date: '18 Feb 2026', status: 'ready' },
  { id: 'rx-003', medication: 'Metformin 850mg', dosage: '1 tablet, 2× daily', doctor: 'Dr. Fischer', date: '25 Feb 2026', status: 'pending' },
]

export const scenarios = {
  loading: {
    label: 'Loading prescriptions',
    data: {
      view: 'loading',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      prescriptions: [] as Prescription[],
      selectedIds: [] as string[],
    } satisfies PrescriptionListData,
  },
  empty: {
    label: 'No prescriptions found',
    data: {
      view: 'empty',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      prescriptions: [] as Prescription[],
      selectedIds: [] as string[],
    } satisfies PrescriptionListData,
  },
  populated: {
    label: 'Prescriptions with selection',
    data: {
      view: 'populated',
      insurer: 'TK Techniker Krankenkasse',
      memberId: 'A123456789',
      prescriptions: MOCK_PRESCRIPTIONS,
      selectedIds: ['rx-001', 'rx-002'],
    } satisfies PrescriptionListData,
  },
}

export const hasListData = true
