export type Item = {
  id: string
  title: string
  subtitle: string
}

export const MOCK_ITEMS: Item[] = [
  { id: '1', title: 'Design system', subtitle: 'Set up tokens and theme' },
  { id: '2', title: 'Authentication', subtitle: 'Login and signup flows' },
  { id: '3', title: 'Dashboard', subtitle: 'Main overview screen' },
]

export type HelloWorldData = {
  isLoading: boolean
  items: Item[]
  lang?: string
}

export const regions = {
  items: {
    label: 'Items',
    isList: true,
    mockItems: MOCK_ITEMS,
    states: {
      loading: { isLoading: true, items: [] as Item[] },
      empty: { isLoading: false, items: [] as Item[] },
      populated: { isLoading: false, items: MOCK_ITEMS },
    },
    defaultState: 'populated',
  },
}
