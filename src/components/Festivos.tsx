// src/components/Festivos.tsx — Trabajar o no cada festivo
// Funciona igual que el domingo en Horarios: un interruptor por fecha.
// Por defecto todos los festivos están cerrados; acá se abren los que sí
// se trabajan, uno por uno.
//
// Se monta dentro de Horarios:
//   import Festivos from '../components/Festivos'
//   <Festivos />
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Festivo = { fecha: string; abierto: boolean; nota: string | null }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function fechaLarga(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, m - 1, d)
  return `${DIAS[f.getDay()]} ${d} de ${MESES[m - 1]}`
}

export default function Festivos() {
  const [restId, setRestId] = useState<string | null>(null)
  const [lista, setLista] = useState<Festivo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      const { data: cat } = await supabase.from('categorias')
        .select('restaurante_id').limit(1).maybeSingle()
      const rid = (cat as any)?.restaurante_id ?? null
      setRestId(rid)
      if (!rid) { setCargando(false); return }

      const hoy = new Date().toISOString().slice(0, 10)
      const dentroDeUnAnio = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)

      const [fest, exc] = await Promise.all([
        supabase.from('festivos_colombia').select('fecha')
          .gte('fecha', hoy).lte('fecha', dentroDeUnAnio).order('fecha'),
        supabase.from('festivos_restaurante').select('fecha, abierto, nota')
          .eq('restaurante_id', rid),
      ])

      if (fest.error) { setError(fest.error.message); setCargando(false); return }

      const abiertos = new Map<string, { abierto: boolean; nota: string | null }>()
      for (const e of (exc.data ?? []) as any[]) abiertos.set(e.fecha, { abierto: e.abierto, nota: e.nota })

      setLista(((fest.data ?? []) as any[]).map(f => ({
        fecha: f.fecha,
        abierto: abiertos.get(f.fecha)?.abierto === true,
        nota: abiertos.get(f.fecha)?.nota ?? null,
      })))
      setCargando(false)
    }
    cargar()
  }, [])

  async function alternar(fecha: string) {
    if (!restId) return
    setError(null)
    const previa = lista
    const abierto = !lista.find(f => f.fecha === fecha)?.abierto
    setLista(prev => prev.map(f => f.fecha === fecha ? { ...f, abierto } : f))

    const { error: err } = await supabase.from('festivos_restaurante')
      .upsert({ restaurante_id: restId, fecha, abierto, updated_at: new Date().toISOString() },
              { onConflict: 'restaurante_id,fecha' })
    if (err) { setLista(previa); setError(err.message) }
  }

  const abiertos = lista.filter(f => f.abierto).length

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Festivos</h2>
        <p className="text-mute text-sm mt-0.5">
          Por defecto no se atiende en festivos. Prendé los que sí trabajás.
          {abiertos > 0 && <> Hoy tenés <strong>{abiertos}</strong> marcado(s) como abierto(s).</>}
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 mb-3">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-mute">Cargando festivos…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-mute">No hay festivos cargados para el próximo año.</p>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          {lista.map((f, idx) => (
            <div
              key={f.fecha}
              className={`flex items-center gap-4 px-5 py-3.5 ${
                idx < lista.length - 1 ? 'border-b border-line' : ''
              } ${f.abierto ? '' : 'bg-canvas/50'}`}
            >
              <button
                onClick={() => alternar(f.fecha)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  f.abierto ? 'bg-oso-600' : 'bg-line'
                }`}
                aria-label={f.abierto ? 'Abierto este festivo' : 'Cerrado este festivo'}
                role="switch"
                aria-checked={f.abierto}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  f.abierto ? 'translate-x-5' : ''
                }`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm capitalize">{fechaLarga(f.fecha)}</div>
                <div className={`text-xs ${f.abierto ? 'text-oso-700' : 'text-mute'}`}>
                  {f.abierto ? 'Se trabaja con el horario de ese día' : 'Sin atención'}
                </div>
              </div>

              <span className="text-xs text-mute tnum shrink-0">{f.fecha}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-mute mt-3">
        Un festivo abierto usa el horario del día de la semana que le toque. Si ese
        día trabajás menos horas, apagá las franjas que no apliquen desde Agenda.
      </p>
    </div>
  )
}
