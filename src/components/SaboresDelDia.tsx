// src/components/SaboresDelDia.tsx — Sabores por producto
// Los sabores NO son una lista global: cada producto tiene los suyos (los del
// Munchie no son los de una torta). El interruptor marca qué productos cambian
// de sabor según el día; esos suben al tope de la lista y abren un desplegable
// con sus sabores, que se agregan desde ahí mismo.
//
// Montar donde tenga sentido (arriba del Menú, o en su pestaña):
//   import SaboresDelDia from '../components/SaboresDelDia'
//   <SaboresDelDia />
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Sabor = { nombre: string; disponible: boolean }
type Plato = { id: string; nombre: string; usa_sabores_dia: boolean; sabores: Sabor[] }

const inputCls = 'w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-oso-300'

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

      <input className={`${inputCls} max-w-sm`} value={busca} onChange={e => setBusca(e.target.value)}
        placeholder="Buscar producto…" />

      {cargando ? (
        <p className="text-sm text-mute">Cargando…</p>
      ) : (
        <div className="space-y-2">
          {ordenados.map(p => {
            const activo = p.usa_sabores_dia
            const hoy = p.sabores.filter(s => s.disponible)
            const estaAbierto = abierto === p.id
            return (
              <div key={p.id}
                className={`border rounded-lg overflow-hidden ${activo ? 'border-oso-300 bg-white' : 'border-line bg-white/60'}`}>

                {/* Fila del producto */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    role="switch" aria-checked={activo} aria-label={`Sabor del día en ${p.nombre}`}
                    onClick={() => alternarInterruptor(p)}
                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${activo ? 'bg-oso-600' : 'bg-oso-100'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${activo ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.nombre}</p>
                    {activo && (
                      <p className="text-xs text-mute truncate">
                        {p.sabores.length === 0
                          ? 'Sin sabores cargados'
                          : hoy.length === 0
                            ? 'Hoy no hay ninguno disponible'
                            : `Hoy: ${hoy.map(s => s.nombre).join(', ')}`}
                      </p>
                    )}
                  </div>

                  {activo && (
                    <button onClick={() => setAbierto(estaAbierto ? null : p.id)}
                      className="text-sm text-oso-700 hover:text-oso-900 shrink-0">
                      {estaAbierto ? 'Cerrar ▲' : `Sabores (${p.sabores.length}) ▼`}
                    </button>
                  )}
                </div>

                {/* Desplegable de sabores */}
                {activo && estaAbierto && (
                  <div className="border-t border-line px-3 py-3 space-y-2 bg-oso-50/40">
                    {p.sabores.length === 0 ? (
                      <p className="text-xs text-mute">
                        Agregá el primer sabor abajo. Los que dejes marcados son los que el bot ofrece hoy.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {p.sabores.map((s, i) => (
                          <div key={`${s.nombre}-${i}`} className="flex items-center gap-2">
                            <label className="flex items-center gap-2 flex-1 cursor-pointer">
                              <input type="checkbox" checked={s.disponible} onChange={() => alternarSabor(p, i)} />
                              <span className={`text-sm ${s.disponible ? '' : 'text-mute line-through'}`}>{s.nombre}</span>
                            </label>
                            <button onClick={() => quitarSabor(p, i)}
                              className="text-mute hover:text-red-600 px-1 text-sm" aria-label={`Quitar ${s.nombre}`}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <input className={inputCls} value={nuevo[p.id] ?? ''}
                        onChange={e => setNuevo(n => ({ ...n, [p.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarSabor(p) } }}
                        placeholder="Agregar sabor (Maracuyá, Mora…)" />
                      <button onClick={() => agregarSabor(p)}
                        className="px-3 py-2 bg-oso-100 text-oso-800 rounded-lg text-sm hover:bg-oso-200 transition-colors shrink-0">
                        Agregar
                      </button>
                    </div>

                    {p.sabores.length > 0 && hoy.length > 0 && (
                      <button onClick={() => apagarTodos(p)}
                        className="text-xs text-mute hover:text-ink underline decoration-dotted">
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
