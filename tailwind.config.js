/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f172a', // Deep navy from the sidebar
          light: '#1e293b',
          accent: '#3b82f6',  // Blue accent for charts/buttons
        }
      }
    },
  },
  plugins: [],
}