import { useEffect, useState } from 'react'

// Carga el script de Google Maps una sola vez para toda la app.
// La API key se toma de la variable de entorno VITE_GOOGLE_MAPS_KEY.

let cargando = false
let cargado = false
const callbacks: (() => void)[] = []

export function useGoogleMaps() {
  const [listo, setListo] = useState(cargado)

  useEffect(() => {
    if (cargado) { setListo(true); return }

    callbacks.push(() => setListo(true))

    if (cargando) return
    cargando = true

    const key = import.meta.env.VITE_GOOGLE_MAPS_KEY
    if (!key) {
      console.error('Falta VITE_GOOGLE_MAPS_KEY en el entorno')
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry,places&language=es&region=CO`
    script.async = true
    script.defer = true
    script.onload = () => {
      cargado = true
      cargando = false
      callbacks.forEach(cb => cb())
      callbacks.length = 0
    }
    script.onerror = () => {
      cargando = false
      console.error('No se pudo cargar Google Maps')
    }
    document.head.appendChild(script)
  }, [])

  return listo
}
