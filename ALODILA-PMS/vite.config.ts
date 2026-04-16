import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /** Root deploy on Vercel (default); explicit for clarity. */
  base: '/',
  build: {
    /** Typical SPA on Vercel — no source maps in client bundle by default. */
    sourcemap: false,
  },
})
