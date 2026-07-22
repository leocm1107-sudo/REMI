import type { Config } from 'tailwindcss'

// La paleta ya NO es fija: cada tono lee una variable CSS (canal RGB) que
// src/lib/tema.ts pisa en runtime con los colores del restaurante.
// Los 117 usos existentes de bg-oso-*, text-oso-*, etc. siguen intactos.
const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        oso: {
          50:  v('marca-50'),
          100: v('marca-100'),
          200: v('marca-200'),
          300: v('marca-300'),
          400: v('marca-400'),
          500: v('marca-500'),
          600: v('marca-600'),
          700: v('marca-700'),
          800: v('marca-800'),
          900: v('marca-900'),
        },
        boton:   v('boton'),        // color de botones (si el cliente lo separa del primario)
        canvas:  v('canvas'),
        surface: v('surface'),
        line:    v('line'),
        ink:     v('ink'),
        mute:    v('mute'),
      },
      fontFamily: {
        display: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
