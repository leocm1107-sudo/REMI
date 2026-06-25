import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type DiaHorario = { abierto: boolean; abre: string; cierra: string }

const DIAS: { key: string; label: string }[] = [
  { key: 'lunes',     label: 'Lunes' },
  { key: 'martes',    label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves',    label: 'Jueves' },
  { key: 'viernes',   label: 'Viernes' },
  { key: 'sabado',    label: 'Sábado' },
  { key: 'domingo',   label: 'Domingo' }
]

const DEFAULT_ABRE = '17:00'
const DEFAULT_CIERRA = '23:00'

export default function Horarios({ session: _s }: { session: Session }) {
  const [horarios, setHorarios] = useState<Record<string, DiaHorario>>({})
  const [cargando, setCargando] = useState(true)
  const [noAutorizado, setNoAutorizado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('obtener_horarios').then(({ data, error }) => {
      if (error) { setNoAutorizado(true); setCargando(false); return }
      const h = (data as any)?.horarios ?? {}
      // Construir el estado de los 7 días: si el día está en el jsonb → abierto
      const estado: Record<string, DiaHorario> = {}
      DIAS.forEach(({ key }) => {
        if (h[key] && h[key].abre && h[key].cierra) {
          estado[key] = { abierto: true, abre: h[key].abre, cierra: h[key].cierra }
        } else {
          estado[key] = { abierto: false, abre: DEFAULT_ABRE, cierra: DEFAULT_CIERRA }
        }
      })
      setHorarios(estado)
      setCargando(false)
    })
  }, [])

  function toggleDia(key: string) {
    setHorarios(prev => ({
      ...prev,
      [key]: { ...prev[key], abierto: !prev[key].abierto }
    }))
  }

  function cambiarHora(key: string, campo: 'abre' | 'cierra', valor: string) {
    setHorarios(prev => ({
      ...prev,
      [key]: { ...prev[key], [campo]: valor }
    }))
  }

  // Copiar el horario de un día a todos los días abiertos
  function copiarATodos(key: string) {
    const origen = horarios[key]
    setHorarios(prev => {
      const nuevo = { ...prev }
      DIAS.forEach(({ key: k }) => {
        if (nuevo[k].abierto) {
          nuevo[k] = { ...nuevo[k], abre: origen.abre, cierra: origen.cierra }
        }
      })
      return nuevo
    })
  }

  async function guardar() {
    // Construir el jsonb: solo días abiertos, con abre y cierra
    const payload: Record<string, { abre: string; cierra: string }> = {}
    let hayError = false
    for (const { key, label } of DIAS) {
      const d = horarios[key]
      if (d.abierto) {
        if (!d.abre || !d.cierra) {
          setMsg(`❌ Falta la hora en ${label}`)
          hayError = true
          break
        }
        if (d.cierra <= d.abre) {
          // Permitимos cruce de medianoche solo si el usuario lo quiere explícito;
          // por simplicidad avisamos
          setMsg(`❌ En ${label}, la hora de cierre debe ser mayor a la de apertura`)
          hayError = true
          break
        }
        payload[key] = { abre: d.abre, cierra: d.cierra }
      }
    }
    if (hayError) return

    setGuardando(true)
    setMsg(null)
    const { error } = await supabase.rpc('guardar_horarios', { p_horarios: payload })
    setGuardando(false)
    if (error) { setMsg('❌ ' + error.message); return }
    setMsg('✅ Horarios guardados')
    setTimeout(() => setMsg(null), 2500)
  }

  if (cargando) {
    return <div className="text-center text-mute py-20 text-sm">Cargando horarios…</div>
  }
  if (noAutorizado) {
    return (
      <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-ink font-medium">Solo el dueño puede ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Horarios</h1>
        <p className="text-mute text-sm">
          Define la hora de apertura y cierre de cada día. Apaga un día para marcarlo como cerrado.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {DIAS.map(({ key, label }, idx) => {
          const d = horarios[key]
          return (
            <div
              key={key}
              className={`flex items-center gap-4 px-5 py-4 ${idx < DIAS.length - 1 ? 'border-b border-line' : ''} ${
                d.abierto ? '' : 'bg-canvas/50'
              }`}
            >
              {/* Toggle abierto/cerrado */}
              <button
                onClick={() => toggleDia(key)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  d.abierto ? 'bg-oso-600' : 'bg-line'
                }`}
                aria-label={d.abierto ? 'Abierto' : 'Cerrado'}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    d.abierto ? 'translate-x-5' : ''
                  }`}
                />
              </button>

              {/* Nombre del día */}
              <div className="w-24 shrink-0">
                <div className="font-medium text-sm">{label}</div>
                <div className={`text-xs ${d.abierto ? 'text-oso-700' : 'text-mute'}`}>
                  {d.abierto ? 'Abierto' : 'Cerrado'}
                </div>
              </div>

              {/* Horas (solo si abierto) */}
              {d.abierto ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <input
                    type="time"
                    value={d.abre}
                    onChange={e => cambiarHora(key, 'abre', e.target.value)}
                    className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum"
                  />
                  <span className="text-mute text-sm">a</span>
                  <input
                    type="time"
                    value={d.cierra}
                    onChange={e => cambiarHora(key, 'cierra', e.target.value)}
                    className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum"
                  />
                  <button
                    onClick={() => copiarATodos(key)}
                    className="text-xs text-oso-700 hover:underline ml-1"
                    title="Aplicar este horario a todos los días abiertos"
                  >
                    copiar a todos
                  </button>
                </div>
              ) : (
                <div className="flex-1 text-sm text-mute">Sin atención este día</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Guardar */}
      <div className="flex items-center justify-end gap-3 mt-5">
        {msg && <span className="text-sm font-medium">{msg}</span>}
        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-oso-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
        >
          {guardando ? 'Guardando…' : 'Guardar horarios'}
        </button>
      </div>

      <p className="text-xs text-mute mt-4">
        El bot usa estos horarios para saber si está abierto o cerrado y avisar a los clientes cuando corresponda.
      </p>
    </div>
  )
}
