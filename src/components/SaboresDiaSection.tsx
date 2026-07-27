import { forwardRef, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Sabor = { nombre: string; disponible: boolean }

type Props = {
  restauranteId: string
  esDueno: boolean
}

const SaboresDiaSection = forwardRef<HTMLDivElement, Props>(function SaboresDiaSection(
  { restauranteId, esDueno },
  ref
) {
  const [sabores, setSabores]   = useState<Sabor[]>([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo]       = useState('')
  const [guardando, setGuardando] = useState(false)

  // Carga inicial
  useEffect(() => {
    let activo = true
    async function cargar() {
      const { data } = await supabase
        .from('restaurantes')
        .select('sabores_dia')
        .eq('id', restauranteId)
        .single()
      if (!activo) return
      setSabores(Array.isArray(data?.sabores_dia) ? (data!.sabores_dia as Sabor[]) : [])
      setCargando(false)
    }
    if (restauranteId) cargar()
  }, [restauranteId])

  // Realtime: si alguien más edita los sabores del día, se refleja acá
  useEffect(() => {
    if (!restauranteId) return
    const channel = supabase
      .channel(`sabores-dia-${restauranteId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'restaurantes', filter: `id=eq.${restauranteId}` },
        (payload) => {
          const nuevos = (payload.new as any)?.sabores_dia
          if (Array.isArray(nuevos)) setSabores(nuevos)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restauranteId])

  async function guardarEnBD(lista: Sabor[]) {
    setGuardando(true)
    const { error } = await supabase
      .from('restaurantes')
      .update({ sabores_dia: lista })
      .eq('id', restauranteId)
    setGuardando(false)
    if (error) alert('No se pudo actualizar: ' + error.message)
  }

  function agregar() {
    const nombre = nuevo.trim()
    if (!nombre) return
    if (sabores.some(s => s.nombre.toLowerCase() === nombre.toLowerCase())) return
    const lista = [...sabores, { nombre, disponible: true }]
    setSabores(lista)
    setNuevo('')
    guardarEnBD(lista)
  }

  function quitar(nombre: string) {
    const lista = sabores.filter(s => s.nombre !== nombre)
    setSabores(lista)
    guardarEnBD(lista)
  }

  function toggle(nombre: string) {
    const lista = sabores.map(s => s.nombre === nombre ? { ...s, disponible: !s.disponible } : s)
    setSabores(lista)
    guardarEnBD(lista)
  }

  return (
    <section ref={ref} className="mb-8 bg-surface border border-line rounded-xl p-5 scroll-mt-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Sabores del día</h2>
        {guardando && <span className="text-[11px] text-mute">Guardando…</span>}
      </div>
      <p className="text-xs text-mute mb-4">
        Los productos marcados como "según sabores del día" en su editor toman automáticamente
        los sabores que dejes en "hoy sí" acá abajo.
      </p>

      {esDueno && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
            placeholder="Maracuyá"
            className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
          />
          <button
            type="button"
            onClick={agregar}
            className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm hover:bg-oso-50 transition-colors"
          >
            Agregar
          </button>
        </div>
      )}

      {cargando ? (
        <p className="text-xs text-mute">Cargando…</p>
      ) : sabores.length === 0 ? (
        <p className="text-xs text-mute">Todavía no hay sabores del día configurados.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sabores.map(s => (
            <div
              key={s.nombre}
              className="flex items-center gap-2 bg-canvas/50 border border-line rounded-full pl-1 pr-2.5 py-1"
            >
              <button
                type="button"
                onClick={() => esDueno && toggle(s.nombre)}
                disabled={!esDueno}
                className={`relative rounded-full transition-colors shrink-0 ${s.disponible ? 'bg-oso-600' : 'bg-line'}`}
                style={{ height: '18px', width: '32px' }}
                aria-label={s.disponible ? 'Disponible hoy' : 'No disponible hoy'}
              >
                <span
                  className="absolute top-0.5 left-0.5 bg-white rounded-full transition-transform"
                  style={{ height: '14px', width: '14px', transform: s.disponible ? 'translateX(14px)' : 'none' }}
                />
              </button>
              <span className={`text-sm ${s.disponible ? 'text-ink' : 'text-mute line-through'}`}>{s.nombre}</span>
              {esDueno && (
                <button
                  type="button"
                  onClick={() => quitar(s.nombre)}
                  className="text-mute hover:text-red-600 text-base leading-none"
                  aria-label={`Quitar ${s.nombre}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
})

export default SaboresDiaSection
