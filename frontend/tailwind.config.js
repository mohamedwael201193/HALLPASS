/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // HALLPASS brand tokens (prompt §4) — charcoal + amber, no blue
        ink: '#121110', // page / hero / section backgrounds
        amber: '#FFB224', // THE permission glow — allowed moments, CTAs, key highlights
        cream: '#FAF6EE', // light contrast sections, cards on dark
        text: '#FFF9EF', // headlines + body on dark
      },
      fontFamily: {
        // Design standard §1: ONE heavy grotesque for display + Inter body. No serif anywhere.
        display: ['"Archivo Black"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
