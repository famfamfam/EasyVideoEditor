/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#111118',
          50: '#16161f',
          100: '#1a1a25',
          200: '#22222e',
        },
        accent: {
          DEFAULT: '#7C3AED',
          light: '#A855F7',
        },
      },
    },
  },
  plugins: [],
}
