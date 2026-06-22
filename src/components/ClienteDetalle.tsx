import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cn, formatCOP } from '../lib/utils'

type Props = {
  clienteId: string
  onClose: () => void
  onGuardado: () => void
}

type ClienteData = {
  id: string
  nombre: string | null
  telefono: string
  direccion: string | null
  barrio: string | null
  ciudad: string | null
  notas: string | null
}

type PedidoHist = {
  id: string
  numero_pedido: string
  estado: string
  tipo_entrega: string
  total: number
  metodo_pago: string | null
  created_at: string
}

type Stats = {
  total_pedidos: number
  total_gastado: number
  ticket_promedio: number
}

const ESTADO_CHIP: Record<string, string> = {
  entregado:     'bg-green-100 text-green-800',
  cancelado:     'bg-red-100 text-red-700',
  en_camino:     'bg-blue-100 text-blue-800',
  preparando:    'bg-orange-100 text-orange-800',
  listo_recoger: 'bg-teal-100 text-teal-800',
  confirmado:    'bg-amber-100 text-amber-800',
  cotizado:      'bg-gray-100 text-gray-700'
}

export default function ClienteDetalle({ clienteId, onClose, onGuardado }: Props) {
  const [cliente, setCliente]   = useState<ClienteData | null>(null)
  const [pedidos, setPedidos]   = useState<PedidoHist[]>([])
  const [stats, setStats]       = useState<Stats | null>(null)
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Form de edición
  const [form, setForm] = useState({ nombre: '', direccion: '', barrio: '', ciudad: '', notas: '' })

  useEffect(() => {
    let activo = true
    async function cargar() {
      const { data, error } = await supabase.rpc('obtener_historial_cliente', {
        p_cliente_id: clienteId
      })
      if (!activo) return
      if (error || !data) {
        setCargando(false)
        return
      }
      const c = (data as any).cliente as ClienteData
      setCliente(c)
      setPedidos((data as any).pedidos as PedidoHist[])
      setStats((data as any).stats as Stats)
      setForm({
        nombre:    c.nombre ?? '',
        direccion: c.direccion ?? '',
        barrio:    c.barrio ?? '',
        ciudad:    c.ciudad ?? '',
        notas:     c.notas ?? ''
      })
      setCargando(false)
    }
    cargar()
    return () => { activo = false }
  }, [clienteId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function guardar() {
    if (!cliente) return
    setGuardando(true)
    const { error } = await supabase
      .from('clientes')
      .update({
        nombre:    form.nombre.trim() || null,
        direccion: form.direccion.trim() || null,
        barrio:    form.barrio.trim() || null,
        ciudad:    form.ciudad.trim() || null,
        notas:     form.notas.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', cliente.id)
    setGuardando(false)
    if (error) {
      alert('No se pudo guardar: ' + error.message)
      return
    }
    setCliente({ ...cliente, ...form })
    setEditando(false)
    onGuardado()  // refrescar la lista
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40 animate-fade" onClick={onClose} />

      <div className="relative bg-surface w-full max-w-md h-full overflow-y-auto shadow-2xl animate-in-right">
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div className="font-display text-xl font-semibold tracking-tight">
            {cargando ? 'Cargando…' : (cliente?.nombre || 'Cliente')}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-mute hover:text-ink text-2xl leading-none w-8 h-8 grid place-items-center"
          >
            ×
          </button>
        </div>

        {cargando ? (
          <div className="px-6 py-10 text-center text-mute text-sm">Cargando datos…</div>
        ) : !cliente ? (
          <div className="px-6 py-10 text-center text-mute text-sm">No se pudo cargar el cliente.</div>
        ) : (
          <div className="px-6 py-6 space-y-7">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Pedidos" value={stats.total_pedidos.toString()} />
                <MiniStat label="Gastado" value={formatCOP(stats.total_gastado)} />
                <MiniStat label="Promedio" value={formatCOP(stats.ticket_promedio)} />
              </div>
            )}

            {/* Datos (vista o edición) */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <Label>Datos</Label>
                {!editando && (
                  <button
                    onClick={() => setEditando(true)}
                    className="text-xs text-oso-600 hover:underline font-medium"
                  >
                    Editar
                  </button>
                )}
              </div>

              {editando ? (
                <div className="space-y-3">
                  <CampoEdit label="Nombre" value={form.nombre}
                    onChange={v => setForm({ ...form, nombre: v })} />
                  <CampoEdit label="Dirección" value={form.direccion}
                    onChange={v => setForm({ ...form, direccion: v })} />
                  <div className="grid grid-cols-2 gap-3">
                    <CampoEdit label="Barrio" value={form.barrio}
                      onChange={v => setForm({ ...form, barrio: v })} />
                    <CampoEdit label="Ciudad" value={form.ciudad}
                      onChange={v => setForm({ ...form, ciudad: v })} />
                  </div>
                  <div>
                    <span className="block text-[11px] text-mute mb-1">Notas</span>
                    <textarea
                      value={form.notas}
                      onChange={e => setForm({ ...form, notas: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={guardar}
                      disabled={guardando}
                      className="flex-1 bg-oso-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
                    >
                      {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => {
                        setEditando(false)
                        setForm({
                          nombre: cliente.nombre ?? '', direccion: cliente.direccion ?? '',
                          barrio: cliente.barrio ?? '', ciudad: cliente.ciudad ?? '',
                          notas: cliente.notas ?? ''
                        })
                      }}
                      className="px-4 py-2 border border-line rounded-lg text-sm text-mute hover:text-ink transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 text-sm">
                  <Dato etiqueta="Teléfono">
                    <a
                      href={`https://wa.me/${cliente.telefono.replace(/\D/g, '')}`}
                      target="_blank" rel="noreferrer"
                      className="text-oso-600 hover:underline tnum"
                    >
                      {cliente.telefono} ↗
                    </a>
                  </Dato>
                  <Dato etiqueta="Dirección">{cliente.direccion || '—'}</Dato>
                  <Dato etiqueta="Barrio">{cliente.barrio || '—'}</Dato>
                  <Dato etiqueta="Ciudad">{cliente.ciudad || '—'}</Dato>
                  {cliente.notas && (
                    <div className="pt-1">
                      <div className="text-mute text-xs mb-1">Notas</div>
                      <div className="bg-canvas rounded-lg p-3 text-ink whitespace-pre-wrap leading-relaxed">
                        {cliente.notas}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Historial */}
            <section>
              <Label>Historial de pedidos</Label>
              {pedidos.length === 0 ? (
                <p className="text-sm text-mute mt-2">Sin pedidos todavía.</p>
              ) : (
                <div className="space-y-2 mt-2">
                  {pedidos.map(p => (
                    <div key={p.id} className="bg-canvas rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium tnum text-sm">{p.numero_pedido}</span>
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                            ESTADO_CHIP[p.estado] ?? 'bg-gray-100 text-gray-700'
                          )}>
                            {p.estado}
                          </span>
                        </div>
                        <div className="text-xs text-mute mt-0.5">
                          {new Date(p.created_at).toLocaleDateString('es-CO', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                          {p.metodo_pago && <> · {p.metodo_pago}</>}
                        </div>
                      </div>
                      <div className="text-sm font-medium tnum shrink-0">{formatCOP(p.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider font-semibold text-mute">
      {children}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-canvas rounded-lg px-3 py-2.5 text-center">
      <div className="text-[10px] text-mute uppercase tracking-wider font-semibold mb-0.5">{label}</div>
      <div className="font-display font-semibold tnum text-sm">{value}</div>
    </div>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-mute">{etiqueta}</span>
      <span className="text-ink text-right">{children}</span>
    </div>
  )
}

function CampoEdit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="block text-[11px] text-mute mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
      />
    </div>
  )
}
