export type HelloData = Record<string, never>

export const regions = {
  hello: {
    label: 'Hello',
    states: {
      default: {} as HelloData,
    },
    defaultState: 'default',
  },
}
