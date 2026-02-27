export type BookingAppointmentsData = {
  view: 'loaded' | 'empty' | 'loading'
}

export const regions = {
  appointments: {
    label: 'Appointments',
    states: {
      loaded: { view: 'loaded' } satisfies BookingAppointmentsData,
      empty: { view: 'empty' } satisfies BookingAppointmentsData,
      loading: { view: 'loading' } satisfies BookingAppointmentsData,
    },
    defaultState: 'loaded',
  },
}
