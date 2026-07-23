// src/lib/tema.ts — Marca por restaurante (v2)
// Lee nombre, logo, colores e imagen de fondo del restaurante (VITE_RESTAURANTE_ID)
// y pisa las variables CSS de index.css.
//
// Usa la función marca_publica (security definer): funciona SIN sesión iniciada,
// así el login y la pantalla de restablecer también muestran la marca correcta.
import { supabase } from './supabase'

const RESTAURANTE_ID = import.meta.env.VITE_RESTAURANTE_ID as string

export type Marca = {
  nombre: string
  logo_emoji: string
  logo_url: string | null
  imagen_fondo_url: string | null
}

// Default NEUTRO: si algo falla, no aparece la marca de otro cliente
export let marca: Marca = {
  nombre: 'Panel',
  logo_emoji: '🍽️',
  logo_url: null,
  imagen_fondo_url: null,
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
}) {
  marca = {
    nombre: r.nombre ?? marca.nombre,
    logo_emoji: r.logo_emoji ?? marca.logo_emoji,
    logo_url: r.logo_url ?? null,
    imagen_fondo_url: r.imagen_fondo_url ?? null,
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
    if (esOscuro(fondo)) {
      set('surface', mezclar(fondo, 255, 0.07)); set('line', mezclar(fondo, 255, 0.16))
      set('ink', [242, 242, 240]); set('mute', [156, 163, 175])
    } else {
      set('surface', mezclar(fondo, 255, 0.6)); set('line', mezclar(fondo, 0, 0.09))
      set('ink', [26, 26, 26]); set('mute', [107, 114, 128])
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
