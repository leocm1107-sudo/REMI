import { useEffect, useRef } from 'react'
import { useGoogleMaps } from './useGoogleMaps'

type Rango = { max_m: number; tarifa: number }

type Props = {
  lat: number | null
  lng: number | null
  onMover: (lat: number, lng: number) => void
  rangos?: Rango[]          // para dibujar círculos concéntricos (opcional)
  alturaPx?: number
}

// Colores de los anillos (del más cercano al más lejano)
const COLORES_ANILLO = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

const CENTRO_DEFAULT = { lat: 4.0847, lng: -76.1954 } // Tuluá, por si no hay coords

export default function MapaRestaurante({ lat, lng, onMover, rangos = [], alturaPx = 320 }: Props) {
  const listo = useGoogleMaps()
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circlesRef = useRef<any[]>([])

  // Inicializar el mapa
  useEffect(() => {
    if (!listo || !divRef.current || mapRef.current) return
    const g = (window as any).google
    const centro = (lat != null && lng != null) ? { lat, lng } : CENTRO_DEFAULT

    const map = new g.maps.Map(divRef.current, {
      center: centro,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy'
    })
    mapRef.current = map

    // Chincheta arrastrable
    const marker = new g.maps.Marker({
      position: centro,
      map,
      draggable: true,
      title: 'Tu restaurante (arrástrame)'
    })
    markerRef.current = marker

    // Al arrastrar la chincheta
    marker.addListener('dragend', () => {
      const pos = marker.getPosition()
      onMover(pos.lat(), pos.lng())
    })

    // Al hacer clic en el mapa, mover la chincheta ahí
    map.addListener('click', (e: any) => {
      marker.setPosition(e.latLng)
      onMover(e.latLng.lat(), e.latLng.lng())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo])

  // Mover la chincheta si cambian las coords desde afuera (ej. al teclear)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    if (lat == null || lng == null) return
    const g = (window as any).google
    const pos = new g.maps.LatLng(lat, lng)
    markerRef.current.setPosition(pos)
    mapRef.current.panTo(pos)
  }, [lat, lng])

  // Dibujar/actualizar los círculos de rango
  useEffect(() => {
    if (!mapRef.current) return
    const g = (window as any).google

    // Limpiar círculos anteriores
    circlesRef.current.forEach(c => c.setMap(null))
    circlesRef.current = []

    if (lat == null || lng == null || rangos.length === 0) return

    const centro = { lat, lng }
    // Dibujar del más grande al más pequeño para que se vean superpuestos
    const ordenados = [...rangos].sort((a, b) => b.max_m - a.max_m)
    ordenados.forEach((r) => {
      const idx = rangos.findIndex(x => x.max_m === r.max_m)
      const color = COLORES_ANILLO[idx % COLORES_ANILLO.length]
      const circle = new g.maps.Circle({
        map: mapRef.current,
        center: centro,
        radius: r.max_m,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.08
      })
      circlesRef.current.push(circle)
    })
  }, [lat, lng, rangos])

  if (!listo) {
    return (
      <div
        style={{ height: alturaPx }}
        className="rounded-lg bg-canvas border border-line grid place-items-center text-sm text-mute"
      >
        Cargando mapa…
      </div>
    )
  }

  return (
    <div
      ref={divRef}
      style={{ height: alturaPx }}
      className="rounded-lg border border-line overflow-hidden"
    />
  )
}
