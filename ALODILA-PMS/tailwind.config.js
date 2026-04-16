/**
 * Enterprise real estate palette (strict):
 * - Canvas: bg-slate-50
 * - Surfaces/cards: bg-white + shadow-sm | shadow-md
 * - Brand / primary chrome: slate-900
 * - Accent / CTAs: amber-500
 * - Borders: border-slate-200, ring-slate-200
 * - Body text: text-slate-800, secondary: text-slate-500
 * Use Tailwind default slate/amber scales — no custom brand hex tokens.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
