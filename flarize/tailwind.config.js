/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FFFDF8',
          100: '#FFF8ED',
          200: '#FFF0D6',
          300: '#FFE4B8',
          400: '#FFD48A',
          500: '#F5B94E',
        },
        navy: {
          700: '#1E3A5F',
          800: '#152D4A',
          900: '#0E1F35',
        },
        gold: {
          400: '#E8A838',
          500: '#D4922A',
          600: '#B8791E',
        },
      },
    },
  },
  plugins: [],
};
