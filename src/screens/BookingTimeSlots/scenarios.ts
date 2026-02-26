type SlotRow = [boolean, boolean, boolean, boolean, boolean]

export type BookingTimeSlotsData = {
  slots: [SlotRow, SlotRow, SlotRow]
  showWarning: boolean
}

const ALL: SlotRow = [true, true, true, true, true]

export const scenarios = {
  'all-selected': {
    label: 'All 15 time slots selected',
    data: {
      slots: [ALL, ALL, ALL],
      showWarning: false,
    } satisfies BookingTimeSlotsData,
  },
  partial: {
    label: 'Some slots deselected',
    data: {
      slots: [
        [true, true, false, true, false],
        [false, true, false, true, false],
        [true, false, false, false, true],
      ],
      showWarning: false,
    } satisfies BookingTimeSlotsData,
  },
  minimal: {
    label: 'Only a few slots selected',
    data: {
      slots: [
        [false, false, true, false, false],
        [false, false, false, false, false],
        [false, true, false, false, false],
      ],
      showWarning: true,
    } satisfies BookingTimeSlotsData,
  },
}
