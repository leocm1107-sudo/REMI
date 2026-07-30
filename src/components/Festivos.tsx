// src/components/Festivos.tsx — Trabajar o no en festivos, en general
// Un interruptor global: si está prendido, el restaurante atiende también
// los festivos colombianos, con un horario propio (independiente del
// horario semanal) que se define acá mismo.
//
// Se monta dentro de Logística/Horarios:
//   import Festivos from '../components/Festivos'
//   <Festivos />
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

const DEFAULT_ABRE = '08:00'
const DEFAULT_CIERRA = '18:00'

export default function Festivos() {
  const [restId, setRestId] = useState<string | null>(null)
  const [abreFestivos, setAbreFestivos] = useState(false)
  const [apertura, setApertura] = useState(DEFAULT_ABRE)
  const [cierre, setCierre] = useState(DEFAULT_CIERRA)
  const [apertura2, setApertura2] = useState('')
  const [cierre2, setCierre2] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardandoToggle, setGuardandoToggle] = useState(false)
  const [guardandoHorario, setGuardandoHorario] = useState(false)
  const [horarioGuardado, setHorarioGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      const { data: cat } = await supabase.from('categorias')
        .select('restaurante_id').limit(1).maybeSingle()
      const rid = (cat as any)?.restaurante_id ?? null
      setRestId(rid)
      if (!rid) { setCargando(false); return }

      const { data, error: err } = await supabase.from('restaurantes')
        .select('abre_festivos, festivos_hora_apertura, festivos_hora_cierre, festivos_hora_apertura_2, festivos_hora_cierre_2')
        .eq('id', rid).single()

      if (err) { setError(err.message); setCargando(false); return }
      const d = data as any
      setAbreFestivos(d?.abre_festivos === true)
      setApertura(d?.festivos_hora_apertura || DEFAULT_ABRE)
      setCierre(d?.festivos_hora_cierre || DEFAULT_CIERRA)
      setApertura2(d?.festivos_hora_apertura_2 || '')
      setCierre2(d?.festivos_hora_cierre_2 || '')
      setCargando(false)
    }
    cargar()
  }, [])

  async function alternar() {
    if (!restId) return
    setError(null)
    setGuardandoToggle(true)
    const previo = abreFestivos
    const nuevo = !abreFestivos
    setAbreFestivos(nuevo)

    const { error: err } = await supabase.from('restaurantes')
      .update({ abre_festivos: nuevo, updated_at: new Date().toISOString() })
      .eq('id', restId)

    setGuardandoToggle(false)
    if (err) { setAbreFestivos(previo); setError(err.message) }
  }

  function toggleSegundaFranja() {
    if (apertura2 || cierre2) {
      setApertura2(''); setCierre2('')
    } else {
      setApertura2('14:00'); setCierre2('18:00')
    }
  }

  async function guardarHorario() {
    if (!restId) return
    if (!apertura || !cierre) { setError('Falta la hora de apertura o cierre'); return }
    if (cierre <= apertura) { setError('La hora de cierre debe ser mayor a la de apertura'); return }

    setError(null)
    setGuardandoHorario(true)
    const { error: err } = await supabase.from('restaurantes')
      .update({
        festivos_hora_apertura: apertura,
        festivos_hora_cierre: cierre,
        festivos_hora_apertura_2: apertura2 || null,
        festivos_hora_cierre_2: cierre2 || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restId)
    setGuardandoHorario(false)
    if (err) { setError(err.message); return }
    setHorarioGuardado(true)
    setTimeout(() => setHorarioGuardado(false), 2500)
  }

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Festivos</h2>
        <p className="text-mute text-sm mt-0.5">
          Por defecto no se atiende en festivos.
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 mb-3">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-mute">Cargando…</p>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className={cn(
            "flex items-center gap-4 px-5 py-4",
            abreFestivos ? "border-b border-line" : ""
          )}>
            <button
              onClick={alternar}
              disabled={guardandoToggle}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50",
                abreFestivos ? "bg-oso-600" : "bg-line"
              )}
              aria-label={abreFestivos ? 'Abre en festivos' : 'No abre en festivos'}
              role="switch"
              aria-checked={abreFestivos}
            >
              <span className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                abreFestivos ? "translate-x-5" : ""
              )} />
            </button>

            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Abrir en festivos</div>
              <div className={cn("text-xs", abreFestivos ? "text-oso-700" : "text-mute")}>
                {abreFestivos ? 'Se atiende todos los festivos con el horario que definas abajo' : 'No se atiende ningún festivo'}
              </div>
            </div>
          </div>

          {abreFestivos && (
            <div className="px-5 py-4">
              <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-2">
                Horario de festivos
              </label>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="time"
                    value={apertura}
                    onChange={e => setApertura(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
                  />
                  <span className="text-mute text-sm">a</span>
                  <input
                    type="time"
                    value={cierre}
                    onChange={e => setCierre(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
                  />
                </div>

                {apertura2 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="time"
                      value={apertura2}
                      onChange={e => setApertura2(e.target.value)}
                      className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
                    />
                    <span className="text-mute text-sm">a</span>
                    <input
                      type="time"
                      value={cierre2}
                      onChange={e => setCierre2(e.target.value)}
                      className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
                    />
                    <button
                      onClick={toggleSegundaFranja}
                      className="text-[11px] text-red-700 hover:underline ml-1"
                    >
                      quitar franja
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={toggleSegundaFranja}
                    className="text-[11px] text-oso-700 hover:underline text-left w-fit"
                  >
                    + segunda franja (jornada partida)
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={guardarHorario}
                  disabled={guardandoHorario}
                  className="px-4 py-2 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
                >
                  {guardandoHorario ? 'Guardando…' : 'Guardar horario de festivos'}
                </button>
                {horarioGuardado && (
                  <span className="text-sm text-green-700 font-medium">✓ Guardado</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-mute mt-3">
        Este horario aplica solo a los festivos, independiente del horario de lunes a domingo.
      </p>
    </div>
  )
}
