/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    // Tailwind v4 requires this plugin to avoid legacy PostCSS crashes.
    "@tailwindcss/postcss": {},
  },
};

