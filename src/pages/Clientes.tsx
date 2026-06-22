import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn, formatCOP } from '../lib/utils'
import ClienteDetalle from '../components/ClienteDetalle'

type ClienteResumen = {
  id: string
  nombre: string | null
  telefono: string
  direccion: string | null
  barrio: string | null
  total_pedidos: number
  total_gastado: number
  ultimo_pedido: string | null
}

type Orden = 'recientes' | 'frecuentes' | 'gasto'

function hace(fecha: string | null): string {
  if (!fecha) return 'Sin pedidos'
  const d = new Date(fecha)
  const ahora = new Date()
  const dias = Math.floor((ahora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} sem`
  if (dias < 365) return `Hace ${Math.floor(dias / 30)} meses`
  return `Hace ${Math.floor(dias / 365)} años`
}

export default function Clientes({ session }: { session: Session }) {
  const [clientes, setClientes]     = useState<ClienteResumen[]>([])
  const [cargando, setCargando]     = useState(true)
  const [noAutorizado, setNoAutorizado] = useState(false)
  const [busqueda, setBusqueda]     = useState('')
  const [orden, setOrden]           = useState<Orden>('recientes')
  const [seleccionado, setSeleccionado] = useState<string | null>(null)

  async function cargar() {
    const { data, error } = await supabase.rpc('listar_clientes_resumen')
    if (error) {
      setNoAutorizado(true)
      setCargando(false)
      return
    }
    setClientes((data ?? []) as ClienteResumen[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    let lista = clientes
    if (q) {
      lista = clientes.filter(c =>
        (c.nombre ?? '').toLowerCase().includes(q) ||
        c.telefono.includes(q) ||
        (c.barrio ?? '').toLowerCase().includes(q)
      )
    }
    const copia = [...lista]
    if (orden === 'frecuentes') {
      copia.sort((a, b) => b.total_pedidos - a.total_pedidos)
    } else if (orden === 'gasto') {
      copia.sort((a, b) => b.total_gastado - a.total_gastado)
    } else {
      copia.sort((a, b) => {
        const ta = a.ultimo_pedido ? new Date(a.ultimo_pedido).getTime() : 0
        const tb = b.ultimo_pedido ? new Date(b.ultimo_pedido).getTime() : 0
        return tb - ta
      })
    }
    return copia
  }, [clientes, busqueda, orden])

  const stats = useMemo(() => {
    const totalClientes = clientes.length
    const recurrentes = clientes.filter(c => c.total_pedidos >= 2).length
    return { totalClientes, recurrentes }
  }, [clientes])

  if (cargando) {
    return <div className="text-center text-mute py-20 text-sm">Cargando clientes…</div>
  }

  if (noAutorizado) {
    return (
      <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-ink font-medium">Solo el dueño puede ver esta sección.</p>
      </div>
    )
  }

  const ordenes: { id: Orden; label: string }[] = [
    { id: 'recientes',  label: 'Más recientes' },
    { id: 'frecuentes', label: 'Más frecuentes' },
    { id: 'gasto',      label: 'Mayor gasto' }
  ]

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Clientes</h1>
        <p className="text-mute text-sm">
          {stats.totalClientes} {stats.totalClientes === 1 ? 'cliente' : 'clientes'}
          {stats.recurrentes > 0 && <> · {stats.recurrentes} recurrentes</>}
        </p>
      </div>

      {/* Búsqueda + orden */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, teléfono o barrio…"
            className="w-full pl-9 pr-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">🔍</span>
        </div>
        <select
          value={orden}
          onChange={e => setOrden(e.target.value as Orden)}
          className="bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-oso-300"
        >
          {ordenes.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
          <div className="text-3xl mb-3">{busqueda ? '🔍' : '👤'}</div>
          <p className="text-ink font-medium">
            {busqueda ? 'No se encontró ningún cliente.' : 'Todavía no hay clientes.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(c => (
            <button
              key={c.id}
              onClick={() => setSeleccionado(c.id)}
              className="w-full text-left bg-surface border border-line rounded-xl p-4 hover:border-oso-400 hover:shadow-sm transition-all flex items-center gap-4"
            >
              <div className="shrink-0 w-11 h-11 rounded-full bg-oso-100 text-oso-800 grid place-items-center font-display font-semibold">
                {(c.nombre || c.telefono).charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.nombre || 'Sin nombre'}</div>
                <div className="text-sm text-mute truncate">
                  <span className="tnum">{c.telefono}</span>
                  {c.barrio && <> · {c.barrio}</>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-medium tnum">{formatCOP(c.total_gastado)}</div>
                <div className="text-xs text-mute">
                  {c.total_pedidos} {c.total_pedidos === 1 ? 'pedido' : 'pedidos'} · {hace(c.ultimo_pedido)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {seleccionado && (
        <ClienteDetalle
          clienteId={seleccionado}
          onClose={() => setSeleccionado(null)}
          onGuardado={cargar}
        />
      )}
    </>
  )
}
