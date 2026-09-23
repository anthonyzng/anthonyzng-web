/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // A cold full-suite run renders every section of the real page: 5s is too tight on a slow CI box.
    testTimeout: 15_000,
    // Stylesheets stay out of jsdom; only ?raw imports keep their text, so a test can check a CSS rule.
    css: { include: [/\.css\?raw$/] },
  },
})
