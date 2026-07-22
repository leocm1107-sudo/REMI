import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn, formatCOP, hace } from '../lib/utils'
import { ESTADOS_INFO, type EstadoPedido, type Pedido } from '../lib/types'
import PedidoCard from '../components/PedidoCard'
import PedidoDetalle from '../components/PedidoDetalle'
import NuevoPedidoModal from '../components/NuevoPedidoModal'

type Filtro = 'activos' | 'todos' | EstadoPedido

const PEDIDO_SELECT = `
  id, numero_pedido, estado, tipo_entrega, direccion_entrega,
  subtotal, domicilio_valor, total, metodo_pago, distancia_km,
  domicilio_requiere_revision, created_at, updated_at, cliente_id,
  clientes!pedidos_cliente_id_fkey (telefono, nombre)
`

export default function Pedidos({ session }: { session: Session }) {
  const [pedidos, setPedidos]           = useState<Pedido[]>([])
  const [filtro, setFiltro]             = useState<Filtro>('activos')
  const [seleccionado, setSeleccionado] = useState<Pedido | null>(null)
  const [creando, setCreando] = useState(false)
  const [cargando, setCargando]         = useState(true)
  const [restauranteId, setRestauranteId] = useState<string | null>(null)

  // 1) Restaurante del usuario logueado (multi-tenant)
  useEffect(() => {
    let activo = true
    supabase
      .from('usuarios_panel')
      .select('restaurante_id')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => {
        if (activo && data) setRestauranteId((data as any).restaurante_id)
        if (activo && !data) setCargando(false)
      })
    return () => { activo = false }
  }, [session.user.id])

  // 2) Carga inicial — SOLO pedidos de este restaurante
  useEffect(() => {
    if (!restauranteId) return
    let activo = true
    async function cargar() {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_SELECT)
        .eq('restaurante_id', restauranteId)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })

      if (activo) {
        if (error) console.error('Cargar pedidos:', error.message)
        setPedidos((data ?? []) as unknown as Pedido[])
        setCargando(false)
      }
    }
    cargar()
    return () => { activo = false }
  }, [restauranteId])

  // 3) Realtime — filtrado por restaurante
  useEffect(() => {
    if (!restauranteId) return
    const channel = supabase
      .channel('pedidos-live')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
          filter: `restaurante_id=eq.${restauranteId}`
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const { data } = await supabase
              .from('pedidos')
              .select(PEDIDO_SELECT)
              .eq('id', (payload.new as any).id)
              .single()
            if (data) {
              setPedidos(prev =>
                prev.some(p => p.id === (data as any).id)
                  ? prev
                  : [data as unknown as Pedido, ...prev]
              )
            }
          } else if (payload.eventType === 'UPDATE') {
            setPedidos(prev => prev.map(p =>
              p.id === (payload.new as any).id
                ? { ...p, ...(payload.new as any) }
                : p
            ))
            setSeleccionado(prev =>
              prev && prev.id === (payload.new as any).id
                ? { ...prev, ...(payload.new as any) }
                : prev
            )
          }
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [restauranteId])

  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const filtrados = useMemo(() => {
    if (filtro === 'todos')   return pedidos
    if (filtro === 'activos') return pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado')
    return pedidos.filter(p => p.estado === filtro)
  }, [pedidos, filtro])

  const stats = useMemo(() => {
    const activos = pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length
    const entregadosHoy = pedidos.filter(p => p.estado === 'entregado').length
    const totalHoy = pedidos
      .filter(p => p.estado === 'entregado')
      .reduce((s, p) => s + (p.total || 0), 0)
    return { activos, entregadosHoy, totalHoy }
  }, [pedidos])

  // Fix "Cargando items…": siempre resuelve (con error → lista vacía y aviso)
  async function abrirPedido(p: Pedido) {
    setSeleccionado(p)
    const { data, error } = await supabase
      .from('pedido_items')
      .select('*')
      .eq('pedido_id', p.id)
    if (error) console.error('Cargar items:', error.message)
    setSeleccionado(prev =>
      prev && prev.id === p.id
        ? { ...prev, pedido_items: (data ?? []) as any }
        : prev
    )
  }

  async function cambiarEstado(p: Pedido, nuevoEstado: EstadoPedido) {
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .select()

    if (error) {
      alert('Error al cambiar estado: ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('El cambio no afectó ningún registro (revisa permisos/RLS).')
      return
    }

    setSeleccionado(prev => prev && prev.id === p.id ? { ...prev, estado: nuevoEstado } : prev)
  }

  const filtros: { id: Filtro; label: string }[] = [
    { id: 'activos',       label: 'Activos' },
    { id: 'cotizado',      label: 'Cotizados' },
    { id: 'confirmado',    label: 'Confirmados' },
    { id: 'preparando',    label: 'En cocina' },
    { id: 'en_camino',     label: 'En camino' },
    { id: 'listo_recoger', label: 'Para recoger' },
    { id: 'entregado',     label: 'Entregados' },
    { id: 'todos',         label: 'Todos' }
  ]

  const hoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  return (
    <>
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Pedidos</h1>
          <p className="text-mute text-sm capitalize">{hoy}</p>
        </div>
        <button
          onClick={() => setCreando(true)}
          className="shrink-0 px-4 py-2 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 transition-colors"
        >
          + Nuevo pedido
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="Activos"      value={stats.activos.toString()} />
        <Stat label="Entregados"   value={stats.entregadosHoy.toString()} />
        <Stat label="Vendido hoy"  value={formatCOP(stats.totalHoy)} />
      </div>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
        {filtros.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors font-medium",
              filtro === f.id
                ? "bg-ink text-white border-ink"
                : "bg-surface text-mute border-line hover:border-oso-400 hover:text-ink"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="text-center text-mute py-20 text-sm">Cargando pedidos…</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
          <div className="text-3xl mb-3">🍔</div>
          <p className="text-ink font-medium">No hay pedidos aquí.</p>
          <p className="text-xs text-mute mt-1">
            Cuando entren por WhatsApp aparecerán solos.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtrados.map(p => (
            <PedidoCard key={p.id} pedido={p} onClick={() => abrirPedido(p)} tiempo={hace(p.created_at)} />
          ))}
        </div>
      )}

      {seleccionado && (
        <PedidoDetalle
          pedido={seleccionado}
          onClose={() => setSeleccionado(null)}
          onCambiarEstado={cambiarEstado}
        />
      )}
      {creando && (
        <NuevoPedidoModal
          onClose={() => setCreando(false)}
          onCreado={() => setCreando(false)}
        />
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-xl px-4 py-3.5">
      <div className="text-[10px] text-mute uppercase tracking-wider font-semibold mb-1">
        {label}
      </div>
      <div className="text-2xl font-display font-semibold tnum tracking-tight">
        {value}
      </div>
    </div>
  )
}
