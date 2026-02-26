export type Insurance = {
  type: 'GKV' | 'PKV'
  insurer: string
  memberId: string
}

export type FamilyMember = {
  initials: string
  name: string
  relationship: string
}

export type Settings = {
  language: string
  notificationsEnabled: boolean
}

export type User = {
  fullName: string
  initials: string
  email: string
  dateOfBirth: string
  gender: string
  phone: string
  address: string
}

export type ProfileData = {
  isLoading: boolean
  user: User
  insurances: Insurance[]
  familyMembers: FamilyMember[]
  settings: Settings
}

const MOCK_USER: User = {
  fullName: 'Sarah Müller',
  initials: 'SM',
  email: 'sarah.mueller@mail.de',
  dateOfBirth: '15 Mar 1990',
  gender: 'Female',
  phone: '+49 170 1234567',
  address: 'Marienplatz 1, 80331 München',
}

const MOCK_INSURANCES: Insurance[] = [
  { type: 'GKV', insurer: 'Techniker Krankenkasse', memberId: 'A123456789' },
  { type: 'PKV', insurer: 'Debeka', memberId: 'P987654321' },
]

const MOCK_FAMILY: FamilyMember[] = [
  { initials: 'MM', name: 'Max Müller', relationship: 'Son' },
  { initials: 'LM', name: 'Lena Müller', relationship: 'Daughter' },
]

const MOCK_SETTINGS: Settings = {
  language: 'Deutsch',
  notificationsEnabled: true,
}

const EMPTY_USER: User = {
  fullName: '',
  initials: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  phone: '',
  address: '',
}

export const scenarios = {
  populated: {
    label: 'Populated',
    data: {
      isLoading: false,
      user: MOCK_USER,
      insurances: MOCK_INSURANCES,
      familyMembers: MOCK_FAMILY,
      settings: MOCK_SETTINGS,
    } satisfies ProfileData,
  },
  loading: {
    label: 'Loading',
    data: {
      isLoading: true,
      user: EMPTY_USER,
      insurances: [] as Insurance[],
      familyMembers: [] as FamilyMember[],
      settings: { language: 'Deutsch', notificationsEnabled: true },
    } satisfies ProfileData,
  },
  minimal: {
    label: 'Minimal (new user)',
    data: {
      isLoading: false,
      user: MOCK_USER,
      insurances: [] as Insurance[],
      familyMembers: [] as FamilyMember[],
      settings: MOCK_SETTINGS,
    } satisfies ProfileData,
  },
}
