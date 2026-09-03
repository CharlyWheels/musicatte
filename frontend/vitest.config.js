import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
    // Verovio's WebAssembly module takes a few seconds to come up in the
    // integration tests that check edited documents still render.
    testTimeout: 30000,
  },
})
