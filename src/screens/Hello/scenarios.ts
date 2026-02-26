export type HelloData = Record<string, never>

export const scenarios = {
  default: {
    label: 'Default view',
    data: {} as HelloData,
  },
}
