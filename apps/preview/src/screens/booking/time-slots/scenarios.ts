type SlotRow = [boolean, boolean, boolean, boolean, boolean]

export type BookingTimeSlotsData = {
  slots: [SlotRow, SlotRow, SlotRow]
  showWarning: boolean
}

const ALL: SlotRow = [true, true, true, true, true]

export const regions = {
  timeSlots: {
    label: 'Time Slots',
    states: {
      'all-selected': {
        slots: [ALL, ALL, ALL],
        showWarning: false,
      } satisfies BookingTimeSlotsData,
      partial: {
        slots: [
          [true, true, false, true, false],
          [false, true, false, true, false],
          [true, false, false, false, true],
        ],
        showWarning: false,
      } satisfies BookingTimeSlotsData,
      minimal: {
        slots: [
          [false, false, true, false, false],
          [false, false, false, false, false],
          [false, true, false, false, false],
        ],
        showWarning: true,
      } satisfies BookingTimeSlotsData,
    },
    defaultState: 'all-selected',
  },
}
