// src/components/SaboresDelDia.tsx — Sabores por producto (vista en tarjetas)
// Los sabores NO son una lista global: cada producto tiene los suyos (los del
// Munchie no son los de una torta). El interruptor marca qué productos cambian
// de sabor según el día; esos suben al tope y su tarjeta se abre para cargar
// los sabores de hoy.
//
// Montar donde tenga sentido (arriba del Menú, o en su pestaña):
//   import SaboresDelDia from '../components/SaboresDelDia'
//   <SaboresDelDia />
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Sabor = { nombre: string; disponible: boolean }
type Plato = { id: string; nombre: string; usa_sabores_dia: boolean; sabores: Sabor[] }

const inputCls = 'w-full border border-line rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-oso-300'

function normalizarSabores(raw: unknown): Sabor[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s: any) =>
      typeof s === 'string'
        ? { nombre: s, disponible: true }
        : { nombre: String(s?.nombre ?? '').trim(), disponible: s?.disponible !== false })
    .filter(s => s.nombre)
}

export default function SaboresDelDia() {
  const [platos, setPlatos] = useState<Plato[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [nuevo, setNuevo] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      const { data: cat } = await supabase.from('categorias').select('restaurante_id').limit(1).maybeSingle()
      const rid = (cat as any)?.restaurante_id
      if (rid) {
        const { data } = await supabase.from('platos')
          .select('id, nombre, usa_sabores_dia, sabores')
          .eq('restaurante_id', rid)
          .order('nombre')
        setPlatos(((data ?? []) as any[]).map(p => ({
          id: p.id,
          nombre: p.nombre,
          usa_sabores_dia: p.usa_sabores_dia === true,
          sabores: normalizarSabores(p.sabores),
        })))
      }
      setCargando(false)
    }
    cargar()
  }, [])

  // Los que dependen del sabor del día van arriba — es lo que Angélica toca cada mañana
  const ordenados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return [...platos]
      .filter(p => !q || p.nombre.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.usa_sabores_dia !== b.usa_sabores_dia) return a.usa_sabores_dia ? -1 : 1
        return a.nombre.localeCompare(b.nombre, 'es')
      })
  }, [platos, busca])

  const conSabores = useMemo(() => platos.filter(p => p.usa_sabores_dia), [platos])

  async function guardar(id: string, patch: Partial<Plato>) {
    setError(null)
    const previa = platos
    setPlatos(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))

    const payload: Record<string, unknown> = {}
    if (patch.usa_sabores_dia !== undefined) payload.usa_sabores_dia = patch.usa_sabores_dia
    if (patch.sabores !== undefined) payload.sabores = patch.sabores

    const { error: err } = await supabase.from('platos').update(payload).eq('id', id)
    if (err) { setPlatos(previa); setError(err.message) }
  }

  function alternarInterruptor(p: Plato) {
    const activando = !p.usa_sabores_dia
    guardar(p.id, { usa_sabores_dia: activando })
    setAbierto(activando ? p.id : null)
  }

  function agregarSabor(p: Plato) {
    const nombre = (nuevo[p.id] ?? '').trim()
    if (!nombre) return
    if (p.sabores.some(s => s.nombre.toLowerCase() === nombre.toLowerCase())) {
      setNuevo(n => ({ ...n, [p.id]: '' }))
      return
    }
    guardar(p.id, { sabores: [...p.sabores, { nombre, disponible: true }] })
    setNuevo(n => ({ ...n, [p.id]: '' }))
  }

  function alternarSabor(p: Plato, i: number) {
    const sabores = p.sabores.map((s, j) => j === i ? { ...s, disponible: !s.disponible } : s)
    guardar(p.id, { sabores })
  }

  function quitarSabor(p: Plato, i: number) {
    guardar(p.id, { sabores: p.sabores.filter((_, j) => j !== i) })
  }

  function apagarTodos(p: Plato) {
    guardar(p.id, { sabores: p.sabores.map(s => ({ ...s, disponible: false })) })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Sabores del día</h3>
        <p className="text-sm text-mute mt-0.5">
          Cada producto tiene sus propios sabores. Prendé el interruptor en los que
          cambian según el día y marcá cuáles hay hoy — el bot solo ofrece los marcados.
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200">{error}</div>
      )}

      {conSabores.length === 0 && !cargando && (
        <div className="border border-dashed border-line rounded-lg p-5 text-center">
          <p className="text-sm text-mute">
            Todavía ningún producto depende del sabor del día. Prendé el interruptor
            en el producto que cambie —el Munchie, por ejemplo— y cargale sus sabores.
          </p>
        </div>
      )}

      <input className={`${inputCls} max-w-sm !py-2 !text-sm`} value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="Buscar producto…" />

      {cargando ? (
        <p className="text-sm text-mute">Cargando…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 items-start">
          {ordenados.map(p => {
            const activo = p.usa_sabores_dia
            const hoy = p.sabores.filter(s => s.disponible)
            const estaAbierto = abierto === p.id

            return (
              <div key={p.id}
                className={`border rounded-lg p-2.5 transition-colors ${
                  activo ? 'border-oso-300 bg-white shadow-sm' : 'border-line bg-white/60'
                }`}>

                {/* Cabecera de la tarjeta: toggle + nombre */}
                <div className="flex items-center gap-2">
                  <button
                    role="switch" aria-checked={activo} aria-label={`Sabor del día en ${p.nombre}`}
                    onClick={() => alternarInterruptor(p)}
                    className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${activo ? 'bg-oso-600' : 'bg-oso-100'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${activo ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <p className="text-xs font-medium truncate flex-1 min-w-0" title={p.nombre}>{p.nombre}</p>
                </div>

                {activo && (
                  <>
                    <p className="text-[11px] text-mute mt-1 leading-tight line-clamp-2">
                      {p.sabores.length === 0
                        ? 'Sin sabores cargados'
                        : hoy.length === 0
                          ? 'Hoy no hay ninguno'
                          : hoy.map(s => s.nombre).join(', ')}
                    </p>
                    <button onClick={() => setAbierto(estaAbierto ? null : p.id)}
                      className="text-[11px] text-oso-700 hover:text-oso-900 mt-1">
                      {estaAbierto ? 'Cerrar ▲' : `Editar (${p.sabores.length}) ▼`}
                    </button>
                  </>
                )}

                {/* Desplegable compacto: chips en vez de lista larga */}
                {activo && estaAbierto && (
                  <div className="mt-2 pt-2 border-t border-line space-y-1.5">
                    {p.sabores.length === 0 ? (
                      <p className="text-[11px] text-mute">Agregá el primer sabor abajo.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {p.sabores.map((s, i) => (
                          <span key={`${s.nombre}-${i}`}
                            className={`inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full border ${
                              s.disponible ? 'bg-oso-50 border-oso-200 text-oso-800' : 'bg-canvas border-line text-mute line-through'
                            }`}>
                            <span onClick={() => alternarSabor(p, i)} className="cursor-pointer">{s.nombre}</span>
                            <button onClick={() => quitarSabor(p, i)}
                              className="hover:text-red-600 leading-none px-0.5" aria-label={`Quitar ${s.nombre}`}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-1">
                      <input className={inputCls} value={nuevo[p.id] ?? ''}
                        onChange={e => setNuevo(n => ({ ...n, [p.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarSabor(p) } }}
                        placeholder="Nuevo sabor…" />
                      <button onClick={() => agregarSabor(p)}
                        className="px-2 py-1 bg-oso-100 text-oso-800 rounded-md text-[11px] font-medium hover:bg-oso-200 transition-colors shrink-0">
                        +
                      </button>
                    </div>

                    {p.sabores.length > 0 && hoy.length > 0 && (
                      <button onClick={() => apagarTodos(p)}
                        className="text-[10px] text-mute hover:text-ink underline decoration-dotted">
                        Hoy no hay ninguno
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-mute">
        Los cambios se guardan al instante. El bot los toma en máximo 5 minutos.
      </p>
    </div>
  )
}
