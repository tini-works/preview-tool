export type BookingAppointmentsData = {
  view: 'loaded' | 'empty' | 'loading'
}

export const scenarios = {
  loaded: {
    label: 'Upcoming and past appointments displayed',
    data: { view: 'loaded' } satisfies BookingAppointmentsData,
  },
  empty: {
    label: 'No appointments booked yet',
    data: { view: 'empty' } satisfies BookingAppointmentsData,
  },
  loading: {
    label: 'Loading appointment data',
    data: { view: 'loading' } satisfies BookingAppointmentsData,
  },
}
