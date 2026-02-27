export type BookingPatientData = {
  selectedPatient: 'self' | 'family'
}

export const regions = {
  patient: {
    label: 'Patient',
    states: {
      self: { selectedPatient: 'self' } satisfies BookingPatientData,
      family: { selectedPatient: 'family' } satisfies BookingPatientData,
    },
    defaultState: 'self',
  },
}
