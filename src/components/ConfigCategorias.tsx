// src/components/ConfigCategorias.tsx — Reglas de cada categoría
// Acá se define lo que gobierna la agenda del bot: si algo se entrega en las
// franjas o por encargo, con cuánta anticipación, cuántas caben por día y
// hasta cuándo se puede cambiar.
//
// Montar donde tenga sentido (Configuración, o su propia pestaña):
//   import ConfigCategorias from '../components/ConfigCategorias'
//   <ConfigCategorias />
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Cat = {
  id: string
  nombre: string
  modo_entrega: 'franja' | 'encargo'
  anticipacion_dias: number
  max_por_dia: number | null
  permite_cambios: boolean
  dias_cambio: number
}

const num = 'w-16 px-2 py-1 bg-canvas border border-line rounded-md text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300'

export default function ConfigCategorias() {
  const [cats, setCats] = useState<Cat[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      const { data, error: err } = await supabase.from('categorias')
        .select('id, nombre, modo_entrega, anticipacion_dias, max_por_dia, permite_cambios, dias_cambio')
        .order('modo_entrega', { ascending: false })
        .order('nombre')
      if (err) setError(err.message)
      setCats(((data ?? []) as any[]).map(c => ({
        id: c.id,
        nombre: c.nombre,
        modo_entrega: c.modo_entrega === 'encargo' ? 'encargo' : 'franja',
        anticipacion_dias: c.anticipacion_dias ?? 0,
        max_por_dia: c.max_por_dia,
        permite_cambios: c.permite_cambios === true,
        dias_cambio: c.dias_cambio ?? 0,
      })))
      setCargando(false)
    }
    cargar()
  }, [])

  async function guardar(id: string, patch: Partial<Cat>) {
    setError(null)
    const previa = cats
    setCats(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

    const { error: err } = await supabase.from('categorias').update(patch).eq('id', id)
    if (err) { setCats(previa); setError(err.message); return }

    setGuardado(id)
    setTimeout(() => setGuardado(g => (g === id ? null : g)), 1500)
  }

  const encargos  = cats.filter(c => c.modo_entrega === 'encargo')
  const porciones = cats.filter(c => c.modo_entrega === 'franja')

  return (
    <section className="bg-surface border border-line rounded-xl p-5">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Reglas por categoría</h2>
        <p className="text-xs text-mute mt-0.5 leading-relaxed">
          Esto es lo que gobierna la agenda del bot. Los <strong>encargos</strong> se
          hornean: piden anticipación, se entregan en el horario de atención y tienen
          su propio tope diario. Las <strong>porciones</strong> se entregan en las
          franjas de siempre y consumen el cupo de cada franja.
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 mb-4">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-mute">Cargando…</p>
      ) : (
        <div className="space-y-6">
          {([['encargo', 'Encargos', encargos], ['franja', 'Porciones', porciones]] as const).map(([modo, titulo, lista]) => (
            <div key={modo}>
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-mute mb-2">
                {titulo} <span className="text-mute/70">· {lista.length}</span>
              </h3>

              {lista.length === 0 ? (
                <p className="text-xs text-mute italic">Ninguna categoría en este modo.</p>
              ) : (
                <div className="space-y-2">
                  {lista.map(c => (
                    <div key={c.id} className="border border-line rounded-lg p-3 bg-canvas/40">
                      <div className="flex items-center justify-between gap-3 mb-2.5">
                        <span className="text-sm font-medium">{c.nombre}</span>
                        <div className="flex items-center gap-2">
                          {guardado === c.id && <span className="text-[11px] text-green-700">✓</span>}
                          <select
                            value={c.modo_entrega}
                            onChange={e => guardar(c.id, { modo_entrega: e.target.value as Cat['modo_entrega'] })}
                            className="px-2 py-1 bg-white border border-line rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-oso-300"
                          >
                            <option value="franja">Se entrega en franjas</option>
                            <option value="encargo">Por encargo</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-2 items-end">
                        {c.modo_entrega === 'encargo' && (
                          <>
                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase tracking-wider text-mute">
                                Anticipación (días hábiles)
                              </span>
                              <input type="number" min={0} value={c.anticipacion_dias} className={num}
                                onChange={e => guardar(c.id, { anticipacion_dias: Math.max(0, Number(e.target.value) || 0) })} />
                            </label>

                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase tracking-wider text-mute">
                                Máximo por día
                              </span>
                              <input type="number" min={1} value={c.max_por_dia ?? ''} placeholder="—" className={num}
                                onChange={e => guardar(c.id, {
                                  max_por_dia: e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1),
                                })} />
                            </label>
                          </>
                        )}

                        <label className="flex items-center gap-1.5 text-xs cursor-pointer pb-1">
                          <input type="checkbox" checked={c.permite_cambios}
                            onChange={e => guardar(c.id, { permite_cambios: e.target.checked })} />
                          Admite cambios
                        </label>

                        {c.permite_cambios && (
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-wider text-mute">
                              Hasta N días antes
                            </span>
                            <input type="number" min={0} value={c.dias_cambio} className={num}
                              onChange={e => guardar(c.id, { dias_cambio: Math.max(0, Number(e.target.value) || 0) })} />
                          </label>
                        )}
                      </div>

                      {c.modo_entrega === 'encargo' && c.max_por_dia == null && (
                        <p className="text-[11px] text-amber-700 mt-2">
                          Sin tope diario: el bot puede aceptar todos los que le pidan para el mismo día.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-mute mt-4">
        Se guarda al instante. El bot toma los cambios en máximo un minuto.
      </p>
    </section>
  )
}
