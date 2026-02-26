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
  lang: string
}

export const scenarios = {
  loading: {
    label: 'Loading',
    data: { isLoading: true, items: [] as Item[], lang: 'en' } satisfies HelloWorldData,
  },
  empty: {
    label: 'Empty',
    data: { isLoading: false, items: [] as Item[], lang: 'en' } satisfies HelloWorldData,
  },
  populated: {
    label: 'Populated',
    data: { isLoading: false, items: MOCK_ITEMS, lang: 'en' } satisfies HelloWorldData,
  },
  singleItem: {
    label: 'Single Item',
    data: { isLoading: false, items: [MOCK_ITEMS[0]], lang: 'en' } satisfies HelloWorldData,
  },
  german: {
    label: 'German',
    data: { isLoading: false, items: MOCK_ITEMS, lang: 'de' } satisfies HelloWorldData,
  },
}
