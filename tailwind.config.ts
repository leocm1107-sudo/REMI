import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        oso: {
          50:  '#FAF6F1',
          100: '#F2E8DC',
          200: '#E5D4BA',
          300: '#D2B68C',
          400: '#A8794F',
          500: '#8A5C36',
          600: '#6B4423',
          700: '#553519',
          800: '#3F2712',
          900: '#2A1A0C'
        },
        canvas:  '#FAFAF7',
        surface: '#FFFFFF',
        line:    '#E8E5DD',
        ink:     '#1A1A1A',
        mute:    '#6B7280'
      },
      fontFamily: {
        display: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config
