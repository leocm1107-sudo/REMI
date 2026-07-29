// src/components/NumerosBloqueados.tsx — Números que el bot no atiende
// Sección independiente: se monta con una línea y no depende del rediseño
// en pestañas. El backend ya existía (estaBloqueado en whatsapp-in), lo que
// faltaba era esto: la forma de administrarlos.
//
// Montar así, donde quieras (Configuración, pestaña Bot, o su propia página):
//   import NumerosBloqueados from '../components/NumerosBloqueados'
//   <NumerosBloqueados />
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Bloqueado = { id: string; telefono: string; motivo: string | null; created_at: string }

const inputCls = 'w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-oso-300'

// 57 + 10 dígitos, igual que en el resto del panel
function normalizarTel(t: string) {
  const d = (t ?? '').replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('3')) return '57' + d
  return d
}

function mostrarTel(t: string) {
  const d = (t ?? '').replace(/\D/g, '')
  const local = d.startsWith('57') && d.length === 12 ? d.slice(2) : d
  return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : t
}

export default function NumerosBloqueados() {
  const [restId, setRestId] = useState<string | null>(null)
  const [lista, setLista] = useState<Bloqueado[]>([])
  const [cargando, setCargando] = useState(true)

  const [tel, setTel] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      // Mismo camino que usa Menu.tsx para saber de qué restaurante es el panel
      const { data: cat } = await supabase.from('categorias').select('restaurante_id').limit(1).maybeSingle()
      const rid = (cat as any)?.restaurante_id ?? null
      setRestId(rid)
      if (rid) {
        const { data } = await supabase.from('numeros_bloqueados')
          .select('id, telefono, motivo, created_at')
          .eq('restaurante_id', rid)
          .order('created_at', { ascending: false })
        setLista((data ?? []) as Bloqueado[])
      }
      setCargando(false)
    }
    cargar()
  }, [])

  const telNorm = useMemo(() => normalizarTel(tel), [tel])
  const telValido = telNorm.length === 12
  const yaEsta = useMemo(() => lista.some(b => b.telefono === telNorm), [lista, telNorm])

  async function bloquear() {
    setError(null)
    if (!restId) { setError('No se pudo identificar el restaurante.'); return }
    if (!telValido) { setError('El celular debe tener 10 dígitos y empezar por 3.'); return }
    if (yaEsta) { setError('Ese número ya está bloqueado.'); return }

    setGuardando(true)
    const { data, error: err } = await supabase.from('numeros_bloqueados')
      .insert({ restaurante_id: restId, telefono: telNorm, motivo: motivo.trim() || null })
      .select('id, telefono, motivo, created_at')
      .single()
    setGuardando(false)

    if (err) { setError(err.message); return }
    setLista(prev => [data as Bloqueado, ...prev])
    setTel(''); setMotivo('')
  }

  async function desbloquear(id: string) {
    setError(null)
    const previa = lista
    setLista(prev => prev.filter(b => b.id !== id))
    const { error: err } = await supabase.from('numeros_bloqueados').delete().eq('id', id)
    if (err) { setLista(previa); setError(err.message) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Números bloqueados</h3>
        <p className="text-sm text-mute mt-0.5">
          El bot no le responde a estos números. No reciben aviso: para ellos el chat
          simplemente se queda callado.
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200">{error}</div>
      )}

      {/* Agregar */}
      <div className="border border-line rounded-lg p-3 space-y-2 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
          <div>
            <label className="text-xs text-mute">Celular</label>
            <input className={inputCls} value={tel} onChange={e => setTel(e.target.value)}
              placeholder="321 759 6315" inputMode="numeric" />
          </div>
          <div>
            <label className="text-xs text-mute">Motivo (opcional)</label>
            <input className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Pedidos falsos, insultos…" />
          </div>
          <div className="flex items-end">
            <button
              className="w-full sm:w-auto px-4 py-2 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
              disabled={guardando || !telValido} onClick={bloquear}>
              {guardando ? 'Bloqueando…' : 'Bloquear'}
            </button>
          </div>
        </div>
        {tel && !telValido && (
          <p className="text-[11px] text-amber-700">Escribí los 10 dígitos del celular.</p>
        )}
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="text-sm text-mute">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="border border-dashed border-line rounded-lg p-6 text-center">
          <p className="text-sm text-mute">
            No hay números bloqueados. Si alguien está molestando por WhatsApp,
            agregá su celular arriba y el bot deja de contestarle.
          </p>
        </div>
      ) : (
        <div className="border border-line rounded-lg divide-y divide-line overflow-hidden bg-white">
          {lista.map(b => (
            <div key={b.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm tnum">{mostrarTel(b.telefono)}</p>
                <p className="text-xs text-mute truncate">
                  {b.motivo || 'Sin motivo anotado'}
                  {b.created_at ? ` · desde el ${new Date(b.created_at).toLocaleDateString('es-CO')}` : ''}
                </p>
              </div>
              <button onClick={() => desbloquear(b.id)}
                className="text-sm text-oso-700 hover:text-oso-900 underline decoration-dotted">
                Desbloquear
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-mute">
        El bot revisa esta lista cada 5 minutos, así que un cambio puede tardar
        ese rato en aplicarse.
      </p>
    </div>
  )
}
