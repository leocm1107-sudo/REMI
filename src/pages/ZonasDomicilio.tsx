import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import MapaRestaurante from '../components/MapaRestaurante'

type Rango = { max_m: number; tarifa: number }
type BarrioVetado = {
  id: string
  nombre_barrio: string | null
  lat: number | null
  lng: number | null
  radio_m: number | null
  motivo: string | null
  activo: boolean
}

export default function ZonasDomicilio({ session: _s }: { session: Session }) {
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [rangos, setRangos] = useState<Rango[]>([])
  const [vetados, setVetados] = useState<BarrioVetado[]>([])
  const [cargando, setCargando] = useState(true)
  const [noAutorizado, setNoAutorizado] = useState(false)

  const [guardandoUbic, setGuardandoUbic] = useState(false)
  const [guardandoRangos, setGuardandoRangos] = useState(false)
  const [msgUbic, setMsgUbic] = useState<string | null>(null)
  const [msgRangos, setMsgRangos] = useState<string | null>(null)

  // Form nuevo barrio vetado
  const [nuevoBarrio, setNuevoBarrio] = useState('')
  const [nuevoMotivo, setNuevoMotivo] = useState('')

  async function cargarTodo() {
    const [cfg, rng, vet] = await Promise.all([
      supabase.rpc('obtener_config_general'),
      supabase.rpc('listar_rangos_domicilio'),
      supabase.rpc('listar_barrios_vetados')
    ])
    if (cfg.error) { setNoAutorizado(true); setCargando(false); return }

    const d = cfg.data as any
    setLat(d.lat != null ? Number(d.lat) : null)
    setLng(d.lng != null ? Number(d.lng) : null)

    if (!rng.error && rng.data) {
      setRangos((rng.data as any[]).map(r => ({
        max_m: r.distancia_max_m,
        tarifa: Number(r.tarifa)
      })))
    }
    if (!vet.error && vet.data) setVetados(vet.data as BarrioVetado[])
    setCargando(false)
  }

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ───── Ubicación ─────
  async function guardarUbicacion() {
    if (lat == null || lng == null) { alert('Marca la ubicación en el mapa.'); return }
    setGuardandoUbic(true)
    setMsgUbic(null)
    // Reusar guardar_config_general: necesitamos traer la config actual y solo cambiar lat/lng.
    // Para simplificar, hacemos un update directo a través de un RPC dedicado:
    const { error } = await supabase.rpc('guardar_ubicacion_restaurante', {
      p_lat: lat, p_lng: lng
    })
    setGuardandoUbic(false)
    if (error) { setMsgUbic('❌ ' + error.message); return }
    setMsgUbic('✅ Ubicación guardada')
    setTimeout(() => setMsgUbic(null), 2500)
  }

  // ───── Rangos ─────
  function agregarRango() {
    const ultimoMax = rangos.length > 0 ? Math.max(...rangos.map(r => r.max_m)) : 0
    setRangos([...rangos, { max_m: ultimoMax + 2000, tarifa: 0 }])
  }
  function actualizarRango(i: number, campo: keyof Rango, valor: number) {
    const copia = [...rangos]
    copia[i] = { ...copia[i], [campo]: valor }
    setRangos(copia)
  }
  function eliminarRango(i: number) {
    setRangos(rangos.filter((_, idx) => idx !== i))
  }
  async function guardarRangos() {
    // Validar que los rangos sean crecientes
    const ordenados = [...rangos].sort((a, b) => a.max_m - b.max_m)
    const payload = ordenados.map((r, i) => ({
      min_m: i === 0 ? 0 : ordenados[i - 1].max_m,
      max_m: r.max_m,
      tarifa: r.tarifa
    }))
    setGuardandoRangos(true)
    setMsgRangos(null)
    const { error } = await supabase.rpc('guardar_rangos_domicilio', { p_rangos: payload })
    setGuardandoRangos(false)
    if (error) { setMsgRangos('❌ ' + error.message); return }
    setMsgRangos('✅ Rangos guardados')
    setTimeout(() => setMsgRangos(null), 2500)
  }

  // ───── Barrios vetados ─────
  async function agregarVetado() {
    if (!nuevoBarrio.trim()) { alert('Escribe el nombre del barrio.'); return }
    const { error } = await supabase.rpc('agregar_barrio_vetado', {
      p_nombre_barrio: nuevoBarrio.trim(),
      p_motivo: nuevoMotivo.trim() || null
    })
    if (error) { alert('Error: ' + error.message); return }
    setNuevoBarrio(''); setNuevoMotivo('')
    const vet = await supabase.rpc('listar_barrios_vetados')
    if (!vet.error) setVetados(vet.data as BarrioVetado[])
  }
  async function eliminarVetado(id: string) {
    if (!confirm('¿Quitar este barrio de la lista de vetados?')) return
    await supabase.rpc('eliminar_barrio_vetado', { p_id: id })
    setVetados(vetados.filter(v => v.id !== id))
  }

  if (cargando) {
    return <div className="text-center text-mute py-20 text-sm">Cargando zonas…</div>
  }
  if (noAutorizado) {
    return (
      <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-ink font-medium">Solo el dueño puede ver esta sección.</p>
      </div>
    )
  }

  const COLORES = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']
  const rangosOrdenados = [...rangos].sort((a, b) => a.max_m - b.max_m)

  return (
    <div className="max-w-3xl">
      <div className="mb-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Zonas de domicilio</h1>
        <p className="text-mute text-sm">
          Ubica tu restaurante, define los rangos de cobro y los barrios a los que no envías.
        </p>
      </div>

      {/* ── Mapa con chincheta y círculos ── */}
      <section className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-1">Ubicación del restaurante</h2>
        <p className="text-xs text-mute mb-4">
          Arrastra la chincheta o haz clic en el mapa para marcar dónde está tu restaurante. Los círculos muestran tus rangos de domicilio.
        </p>

        <MapaRestaurante
          lat={lat}
          lng={lng}
          onMover={(la, ln) => { setLat(la); setLng(ln) }}
          rangos={rangosOrdenados}
          alturaPx={340}
        />

        <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
          <div className="text-xs text-mute tnum">
            {lat != null && lng != null
              ? <>Lat: {lat.toFixed(6)} · Lng: {lng.toFixed(6)}</>
              : 'Sin ubicación marcada'}
          </div>
          <div className="flex items-center gap-3">
            {msgUbic && <span className="text-xs font-medium">{msgUbic}</span>}
            <button
              onClick={guardarUbicacion}
              disabled={guardandoUbic || lat == null}
              className="text-sm bg-oso-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
            >
              {guardandoUbic ? 'Guardando…' : 'Guardar ubicación'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Rangos de domicilio ── */}
      <section className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-1">Rangos de cobro</h2>
        <p className="text-xs text-mute mb-4">
          Cada rango cubre desde el anterior hasta el radio que definas. Asígnale un precio a cada anillo. Se ven como círculos de colores en el mapa.
        </p>

        <div className="space-y-2 mb-4">
          {rangosOrdenados.length === 0 ? (
            <p className="text-sm text-mute py-3 text-center">
              Aún no hay rangos. Agrega el primero abajo.
            </p>
          ) : (
            rangosOrdenados.map((r, i) => {
              const desde = i === 0 ? 0 : rangosOrdenados[i - 1].max_m
              return (
                <div key={i} className="flex items-center gap-3 bg-canvas rounded-lg p-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: COLORES[i % COLORES.length] }}
                  />
                  <div className="text-sm text-mute shrink-0 w-28 tnum">
                    {(desde / 1000).toFixed(1)} – {(r.max_m / 1000).toFixed(1)} km
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-xs text-mute">Hasta (km):</label>
                    <input
                      type="number" step="0.1"
                      value={(r.max_m / 1000).toString()}
                      onChange={e => actualizarRango(rangos.indexOf(r), 'max_m', Math.round(parseFloat(e.target.value || '0') * 1000))}
                      className="w-16 px-2 py-1 bg-white border border-line rounded text-sm tnum"
                    />
                    <label className="text-xs text-mute ml-2">Precio:</label>
                    <input
                      type="number"
                      value={r.tarifa.toString()}
                      onChange={e => actualizarRango(rangos.indexOf(r), 'tarifa', parseInt(e.target.value || '0', 10))}
                      className="w-24 px-2 py-1 bg-white border border-line rounded text-sm tnum"
                      placeholder="4000"
                    />
                  </div>
                  <button
                    onClick={() => eliminarRango(rangos.indexOf(r))}
                    className="text-mute hover:text-red-600 text-lg shrink-0"
                    aria-label="Eliminar rango"
                  >×</button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={agregarRango}
            className="text-sm bg-canvas border border-line px-4 py-2 rounded-lg font-medium hover:border-oso-400 transition-colors"
          >
            + Agregar rango
          </button>
          <div className="flex items-center gap-3">
            {msgRangos && <span className="text-xs font-medium">{msgRangos}</span>}
            <button
              onClick={guardarRangos}
              disabled={guardandoRangos || rangos.length === 0}
              className="text-sm bg-oso-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
            >
              {guardandoRangos ? 'Guardando…' : 'Guardar rangos'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Barrios vetados ── */}
      <section className="bg-surface border border-line rounded-xl p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-1">Barrios vetados</h2>
        <p className="text-xs text-mute mb-4">
          Barrios a los que NO haces domicilios. Si un cliente pide a uno de estos, el bot le avisa que no hay cobertura.
        </p>

        {/* Lista */}
        <div className="space-y-2 mb-4">
          {vetados.length === 0 ? (
            <p className="text-sm text-mute py-3 text-center">No hay barrios vetados.</p>
          ) : (
            vetados.map(v => (
              <div key={v.id} className="flex items-center gap-3 bg-canvas rounded-lg p-3">
                <span className="text-base">🚫</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{v.nombre_barrio || 'Zona GPS'}</div>
                  {v.motivo && <div className="text-xs text-mute">{v.motivo}</div>}
                </div>
                <button
                  onClick={() => eliminarVetado(v.id)}
                  className="text-xs text-red-600 hover:underline shrink-0"
                >
                  Quitar
                </button>
              </div>
            ))
          )}
        </div>

        {/* Agregar */}
        <div className="flex gap-2 flex-wrap items-end border-t border-line pt-4">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] text-mute mb-1">Nombre del barrio</label>
            <input
              type="text"
              value={nuevoBarrio}
              onChange={e => setNuevoBarrio(e.target.value)}
              placeholder="Ej. La Inmaculada"
              className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] text-mute mb-1">Motivo (opcional)</label>
            <input
              type="text"
              value={nuevoMotivo}
              onChange={e => setNuevoMotivo(e.target.value)}
              placeholder="Ej. muy lejos"
              className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm"
            />
          </div>
          <button
            onClick={agregarVetado}
            className="bg-oso-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-oso-700 transition-colors"
          >
            Agregar
          </button>
        </div>
      </section>
    </div>
  )
}
