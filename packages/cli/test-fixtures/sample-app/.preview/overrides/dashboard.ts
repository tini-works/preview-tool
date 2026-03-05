// User override for Dashboard screen — this file is not overwritten by `generate`
export const regions = {
  items: {
    label: 'Tasks',
    defaultState: 'populated',
    states: {
      populated: {
        items: [
          { id: 'task-001', name: 'Review PR #42' },
          { id: 'task-002', name: 'Deploy staging' },
          { id: 'task-003', name: 'Write documentation' },
        ],
      },
      empty: {
        items: [],
      },
    },
    isList: true,
    defaultCount: 3,
  },
} as const
