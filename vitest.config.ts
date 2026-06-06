import { defineConfig } from 'vitest/config'

// Unit tests run in Node (pure logic — scoring, Salesforce export). They never
// touch the database, network, or env, so no setup file is needed.
export default defineConfig({
  resolve: { tsconfigPaths: true }, // honor the "@/*" alias from tsconfig
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    globals: false,
  },
})
