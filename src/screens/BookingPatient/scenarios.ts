export type BookingPatientData = {
  selectedPatient: 'self' | 'family'
}

export const scenarios = {
  self: {
    label: 'Booking for self',
    data: { selectedPatient: 'self' } satisfies BookingPatientData,
  },
  family: {
    label: 'Booking for family member',
    data: { selectedPatient: 'family' } satisfies BookingPatientData,
  },
}
