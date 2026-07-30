// src/components/Festivos.tsx — Trabajar o no en festivos, en general
// Un solo interruptor: si está prendido, el restaurante atiende también
// los festivos colombianos usando el horario del día de la semana que
// le toque (ej. un festivo lunes usa el horario de los lunes).
//
// Se monta dentro de Logística/Horarios:
//   import Festivos from '../components/Festivos'
//   <Festivos />
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Festivos() {
  const [restId, setRestId] = useState<string | null>(null)
  const [abreFestivos, setAbreFestivos] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      const { data: cat } = await supabase.from('categorias')
        .select('restaurante_id').limit(1).maybeSingle()
      const rid = (cat as any)?.restaurante_id ?? null
      setRestId(rid)
      if (!rid) { setCargando(false); return }

      const { data, error: err } = await supabase.from('restaurantes')
        .select('abre_festivos').eq('id', rid).single()

      if (err) { setError(err.message); setCargando(false); return }
      setAbreFestivos((data as any)?.abre_festivos === true)
      setCargando(false)
    }
    cargar()
  }, [])

  async function alternar() {
    if (!restId) return
    setError(null)
    setGuardando(true)
    const previo = abreFestivos
    const nuevo = !abreFestivos
    setAbreFestivos(nuevo)

    const { error: err } = await supabase.from('restaurantes')
      .update({ abre_festivos: nuevo, updated_at: new Date().toISOString() })
      .eq('id', restId)

    setGuardando(false)
    if (err) { setAbreFestivos(previo); setError(err.message) }
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
        <div className="bg-surface border border-line rounded-xl px-5 py-4 flex items-center gap-4">
          <button
            onClick={alternar}
            disabled={guardando}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              abreFestivos ? 'bg-oso-600' : 'bg-line'
            }`}
            aria-label={abreFestivos ? 'Abre en festivos' : 'No abre en festivos'}
            role="switch"
            aria-checked={abreFestivos}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              abreFestivos ? 'translate-x-5' : ''
            }`} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Abrir en festivos</div>
            <div className={`text-xs ${abreFestivos ? 'text-oso-700' : 'text-mute'}`}>
              {abreFestivos
                ? 'Se atiende todos los festivos con el horario del día de la semana que le toque'
                : 'No se atiende ningún festivo'}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-mute mt-3">
        Un festivo abierto usa el horario del día de la semana que le toque. Si ese
        día trabajás menos horas, apagá las franjas que no apliquen desde Agenda.
      </p>
    </div>
  )
}
