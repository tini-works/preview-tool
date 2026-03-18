import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/**/__tests__/**/*.test.ts',
      '../runtime/src/**/__tests__/**/*.test.ts',
      '../runtime/src/**/__tests__/**/*.test.tsx',
    ],
  },
})
