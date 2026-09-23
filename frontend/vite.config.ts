/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The public contact address is never committed (CLAUDE.md 4.4): it is injected at build time
 * through VITE_CONTACT_EMAIL, and the Contact section omits the email row while it is unset.
 * A production build that forgets the variable would therefore ship a site with no email channel
 * and no other sign of it, so the build says so loudly.
 */
function contactEmailCheck(): Plugin {
  return {
    name: 'contact-email-check',
    apply: 'build',
    configResolved(config) {
      if (config.mode !== 'production' || config.env.VITE_CONTACT_EMAIL?.trim()) return
      config.logger.warn(
        '[contact] VITE_CONTACT_EMAIL is empty: this build ships a Contact section without its email row.',
        { timestamp: true },
      )
      config.logger.warn(
        '[contact] Set it in frontend/.env (see frontend/.env.example) or as a deploy build arg / CI secret.',
        { timestamp: true },
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), contactEmailCheck()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // A cold full-suite run renders every section of the real page: 5s is too tight on a slow CI box.
    testTimeout: 15_000,
    // Stylesheets stay out of jsdom; only ?raw imports keep their text, so a test can check a CSS rule.
    css: { include: [/\.css\?raw$/] },
  },
})
