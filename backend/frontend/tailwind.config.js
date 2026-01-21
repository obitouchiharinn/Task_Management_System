/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,jsx,js}'],
  theme: {
    extend: {
      colors: {
        bg: '#050816',
        accent: '#7c3aed',
        accentSoft: '#4c1d95',
        success: '#22c55e',
        warning: '#eab308',
        danger: '#ef4444',
        info: '#38bdf8',
      },
    },
  },
  plugins: [],
}

