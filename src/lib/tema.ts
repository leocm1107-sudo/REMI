// src/lib/tema.ts — Marca por restaurante (v2)
// Lee nombre, logo, colores e imagen de fondo del restaurante (VITE_RESTAURANTE_ID)
// y pisa las variables CSS de index.css.
//
// Usa la función marca_publica (security definer): funciona SIN sesión iniciada,
// así el login y la pantalla de restablecer también muestran la marca correcta.
import { supabase } from './supabase'
import { vocabDe, type Vocab } from './vocabulario'

// Se exporta porque el Layout lo necesita: un superadmin que entra a otro
// panel tiene que alinear qué negocio está mirando con el sitio en el que
// está parado. Si no, ve la marca de uno y los datos de otro.
export const RESTAURANTE_ID = import.meta.env.VITE_RESTAURANTE_ID as string

export type Marca = {
  nombre: string
  logo_emoji: string
  logo_url: string | null
  imagen_fondo_url: string | null
  features: Record<string, boolean>
  // De qué habla este panel: 'restaurante' | 'reposteria' | 'salon'
  vocabulario: string
  vocab: Vocab
}

// Default NEUTRO: si algo falla, no aparece la marca de otro cliente
export let marca: Marca = {
  nombre: 'Panel',
  logo_emoji: '🍽️',
  logo_url: null,
  imagen_fondo_url: null,
  features: {},
  vocabulario: 'restaurante',
  vocab: vocabDe('restaurante'),
}

// ── utilidades de color ──────────────────────────────────────────────
function hexARgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace('#', '')
  const h = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const mezclar = (c: [number, number, number], hacia: number, p: number): [number, number, number] =>
  [0, 1, 2].map((i) => Math.round(c[i] + (hacia - c[i]) * p)) as [number, number, number]
const triple = (c: [number, number, number]) => `${c[0]} ${c[1]} ${c[2]}`
const esOscuro = (c: [number, number, number]) => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 128

// Luminancia relativa y contraste WCAG. Se usa para que el texto secundario
// no quede fijo en un gris que funciona sobre blanco y desaparece sobre una
// foto de fondo o un color con carga.
function luminancia(c: [number, number, number]): number {
  const f = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
// Acerca el color al texto principal hasta alcanzar el contraste pedido.
// Devuelve el más suave que todavía se lee.
function legible(
  base: [number, number, number], ink: [number, number, number],
  fondo: [number, number, number], minimo: number,
): [number, number, number] {
  let c = base
  for (let i = 0; i <= 20 && contraste(c, fondo) < minimo; i++) {
    c = mezclar(c, esOscuro(fondo) ? 255 : 0, 0.08)
  }
  return contraste(c, fondo) >= minimo ? c : ink
}

function escala(base: [number, number, number]): Record<number, [number, number, number]> {
  return {
    50: mezclar(base, 255, 0.95), 100: mezclar(base, 255, 0.88), 200: mezclar(base, 255, 0.75),
    300: mezclar(base, 255, 0.55), 400: mezclar(base, 255, 0.30), 500: base,
    600: mezclar(base, 0, 0.18), 700: mezclar(base, 0, 0.34), 800: mezclar(base, 0, 0.50),
    900: mezclar(base, 0, 0.66),
  }
}

function set(nombre: string, c: [number, number, number]) {
  document.documentElement.style.setProperty(`--${nombre}`, triple(c))
}

// ── aplicar ──────────────────────────────────────────────────────────
export function aplicarTema(r: {
  nombre?: string | null
  logo_emoji?: string | null
  logo_url?: string | null
  imagen_fondo_url?: string | null
  color_primario?: string | null
  color_botones?: string | null
  color_fondo?: string | null
  vocabulario?: string | null
  features?: Record<string, boolean>
}) {
  const clave = r.vocabulario ?? 'restaurante'
  marca = {
    nombre: r.nombre ?? marca.nombre,
    logo_emoji: r.logo_emoji ?? marca.logo_emoji,
    logo_url: r.logo_url ?? null,
    imagen_fondo_url: r.imagen_fondo_url ?? null,
    features: (r as any).features ?? {},
    vocabulario: clave,
    vocab: vocabDe(clave),
  }

  const primario = r.color_primario ? hexARgb(r.color_primario) : null
  if (primario) {
    const e = escala(primario)
    for (const [tono, c] of Object.entries(e)) set(`marca-${tono}`, c as [number, number, number])
    set('boton', e[600])
  }

  const boton = r.color_botones ? hexARgb(r.color_botones) : null
  if (boton) set('boton', boton)

  const fondo = r.color_fondo ? hexARgb(r.color_fondo) : null
  if (fondo) {
    set('canvas', fondo)
    // El texto secundario se calculaba con un gris fijo (#6B7280 en claro).
    // Sobre un fondo con color —o peor, sobre la foto de fondo— ese gris
    // queda por debajo del mínimo legible y el panel se vuelve ilegible.
    // Ahora se acerca al texto principal hasta alcanzar contraste real.
    // Con foto de fondo se exige más, porque el texto compite con la imagen.
    const minMute = marca.imagen_fondo_url ? 6 : 4.8
    if (esOscuro(fondo)) {
      const ink: [number, number, number] = [242, 242, 240]
      set('surface', mezclar(fondo, 255, 0.07)); set('line', mezclar(fondo, 255, 0.16))
      set('ink', ink)
      set('mute', legible([156, 163, 175], ink, fondo, minMute))
    } else {
      const ink: [number, number, number] = [26, 26, 26]
      set('surface', mezclar(fondo, 255, 0.6)); set('line', mezclar(fondo, 0, 0.12))
      set('ink', ink)
      set('mute', legible([107, 114, 128], ink, fondo, minMute))
    }
    if (marca.imagen_fondo_url) {
    document.documentElement.style.setProperty('--fondo-foto', `url(${marca.imagen_fondo_url})`)
  }
  }

  // Favicon según la marca: logo real si hay, si no el emoji
  const icono = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icono) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${marca.logo_emoji}</text></svg>`
    icono.href = marca.logo_url ?? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  }
  document.title = `${marca.nombre} · Panel`
  window.dispatchEvent(new CustomEvent('marca'))
}

// ── cargar del servidor (funciona con o sin sesión) ──────────────────
export async function cargarTema() {
  try {
    const { data } = await supabase.rpc('marca_publica', { p_restaurante_id: RESTAURANTE_ID })
    if (data) aplicarTema(data as Record<string, string | null>)
  } catch {
    /* sin red: se queda el default neutro */
  }
}

// ── hook para componentes que muestran la marca ──────────────────────
// Uso: const m = useMarca()
import { useEffect, useState } from 'react'
export function useMarca(): Marca {
  const [m, setM] = useState<Marca>(marca)
  useEffect(() => {
    const f = () => setM({ ...marca })
    window.addEventListener('marca', f)
    return () => window.removeEventListener('marca', f)
  }, [])
  return m
}

// Atajo para los componentes que solo necesitan las palabras
export function useVocab(): Vocab {
  return useMarca().vocab
}
