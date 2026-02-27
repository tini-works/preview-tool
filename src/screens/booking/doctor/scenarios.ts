export type BookingDoctorData = {
  view: 'browsing' | 'selected' | 'specialty-drawer'
}

export const regions = {
  doctor: {
    label: 'Doctor',
    states: {
      browsing: { view: 'browsing' } satisfies BookingDoctorData,
      selected: { view: 'selected' } satisfies BookingDoctorData,
      'specialty-drawer': { view: 'specialty-drawer' } satisfies BookingDoctorData,
    },
    defaultState: 'browsing',
  },
}
