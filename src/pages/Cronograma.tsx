// src/pages/Cronograma.tsx — Agenda de encargos
// Muestra las citas (revisión y entrega) agrupadas por día, y permite
// confirmarlas o cancelarlas. Solo aparece en restaurantes con agendamiento.
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/utils'

type Cita = {
  id: string
  tipo: 'revision' | 'entrega'
  fecha: string
  hora: string | null
  estado: 'propuesta' | 'confirmada' | 'cumplida' | 'cancelada'
  notas: string | null
  pedido_id: string
  pedidos: {
    numero_pedido: string
    total: number
    estado: string
    tipo_entrega: string
    direccion_entrega: string | null
    clientes: { nombre: string | null; telefono: string } | null
  } | null
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fechaLarga(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, m - 1, d)
  return `${DIAS[f.getDay()]} ${d} de ${MESES[m - 1]}`
}
function hoyISO() {
  const f = new Date()
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

const badge: Record<string, string> = {
  propuesta:  'bg-amber-100 text-amber-800',
  confirmada: 'bg-green-100 text-green-800',
  cumplida:   'bg-oso-100 text-oso-800',
  cancelada:  'bg-red-100 text-red-700',
}

export default function Cronograma({ session }: { session: Session }) {
  const [citas, setCitas]   = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<'todas' | 'revision' | 'entrega'>('todas')

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('citas')
      .select('id, tipo, fecha, hora, estado, notas, pedido_id, pedidos(numero_pedido, total, estado, tipo_entrega, direccion_entrega, clientes(nombre, telefono))')
      .gte('fecha', hoyISO())
      .neq('estado', 'cancelada')
      .order('fecha')
      .order('hora', { nullsFirst: true })
    setCitas((data ?? []) as unknown as Cita[])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    const canal = supabase.channel('citas-cronograma')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, cargar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  const visibles = useMemo(
    () => (filtro === 'todas' ? citas : citas.filter(c => c.tipo === filtro)),
    [citas, filtro],
  )

  const porDia = useMemo(() => {
    const m = new Map<string, Cita[]>()
    for (const c of visibles) {
      const arr = m.get(c.fecha) ?? []
      arr.push(c)
      m.set(c.fecha, arr)
    }
    return [...m.entries()]
  }, [visibles])

  async function cambiarEstado(id: string, estado: Cita['estado']) {
    await supabase.from('citas').update({
      estado,
      confirmada_por: estado === 'confirmada' ? 'jefe' : null,
      confirmada_at:  estado === 'confirmada' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    cargar()
  }

  const pendientes = citas.filter(c => c.estado === 'propuesta').length

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Cronograma</h1>
        <p className="text-mute text-sm">
          {pendientes > 0
            ? `${pendientes} cita${pendientes === 1 ? '' : 's'} por confirmar`
            : 'Todas las citas están confirmadas'}
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        {([['todas', 'Todas'], ['revision', 'Revisiones'], ['entrega', 'Entregas']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              filtro === v ? 'bg-oso-800 text-white' : 'bg-oso-100 text-oso-800 hover:bg-oso-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-center text-mute py-20 text-sm">Cargando agenda…</p>
      ) : porDia.length === 0 ? (
        <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
          <p className="text-ink font-medium">No hay nada agendado.</p>
          <p className="text-xs text-mute mt-1">Los encargos con fecha aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {porDia.map(([fecha, delDia]) => (
            <div key={fecha}>
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="font-display text-lg font-semibold capitalize">{fechaLarga(fecha)}</h2>
                <span className="text-xs text-mute">
                  {delDia.length} {delDia.length === 1 ? 'encargo' : 'encargos'}
                </span>
              </div>

              <div className="space-y-2.5">
                {delDia.map(c => (
                  <div key={c.id} className="bg-surface border border-line rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {c.tipo === 'revision' ? '📝 Revisión' : '📦 Entrega'}
                          </span>
                          {c.hora && <span className="text-xs text-mute tnum">{c.hora.slice(0, 5)}</span>}
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge[c.estado]}`}>
                            {c.estado}
                          </span>
                        </div>

                        <p className="text-sm mt-1.5">
                          {c.pedidos?.numero_pedido ?? '—'}
                          {c.pedidos?.clientes?.nombre ? ` · ${c.pedidos.clientes.nombre}` : ''}
                        </p>
                        <p className="text-xs text-mute">
                          {c.pedidos?.clientes?.telefono ?? ''}
                          {c.pedidos?.tipo_entrega === 'domicilio' && c.pedidos?.direccion_entrega
                            ? ` · ${c.pedidos.direccion_entrega}`
                            : c.pedidos?.tipo_entrega === 'recoger' ? ' · Recoge en el taller' : ''}
                        </p>
                        {c.notas && <p className="text-xs text-mute mt-1">🕐 {c.notas}</p>}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="tnum text-sm font-medium">{formatCOP(c.pedidos?.total ?? 0)}</p>
                      </div>
                    </div>

                    {(c.estado === 'propuesta' || c.estado === 'confirmada') && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                        {c.estado === 'propuesta' && (
                          <button
                            onClick={() => cambiarEstado(c.id, 'confirmada')}
                            className="px-3 py-1.5 bg-oso-600 text-white rounded-lg text-xs font-medium hover:bg-oso-700 transition-colors"
                          >
                            Confirmar cita
                          </button>
                        )}
                        {c.estado === 'confirmada' && (
                          <button
                            onClick={() => cambiarEstado(c.id, 'cumplida')}
                            className="px-3 py-1.5 bg-oso-100 text-oso-800 rounded-lg text-xs hover:bg-oso-200 transition-colors"
                          >
                            Marcar cumplida
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('¿Cancelar esta cita?')) cambiarEstado(c.id, 'cancelada')
                          }}
                          className="px-3 py-1.5 text-xs text-mute hover:text-red-600 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
