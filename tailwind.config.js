/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        sky:   { DEFAULT: '#4FC3F7' },
        grass: { DEFAULT: '#81C784' },
        sun:   { DEFAULT: '#FFD54F' },
        coral: { DEFAULT: '#FF8A65' },
        ink:   { DEFAULT: '#1f2937' },
        paper: { DEFAULT: '#fffdf7' },
        soft:  { DEFAULT: '#f3f8fc' },
      },
      fontFamily: {
        kid: ['Baloo 2', 'Inter', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
