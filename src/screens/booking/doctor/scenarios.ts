export type BookingDoctorData = {
  view: 'browsing' | 'selected' | 'specialty-drawer'
}

export const scenarios = {
  browsing: {
    label: 'Viewing all doctors',
    data: { view: 'browsing' } satisfies BookingDoctorData,
  },
  selected: {
    label: 'A doctor is selected',
    data: { view: 'selected' } satisfies BookingDoctorData,
  },
  'specialty-drawer': {
    label: 'Specialty selection drawer open',
    data: { view: 'specialty-drawer' } satisfies BookingDoctorData,
  },
}
