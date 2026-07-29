// src/pages/Agenda.tsx — Agenda de encargos
// Tres pestañas:
//   Citas  — las citas (revisión y entrega) agrupadas por día (lo de siempre)
//   Slots  — la planilla editable de franjas de entrega, con cupo y hora de cierre
//   Días   — calendario para bloquear días completos, franjas sueltas o tramos de horas
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

type Slot = {
  id: string
  restaurante_id?: string
  hora: string
  etiqueta: string | null
  cierre_hora: string
  aplica_domicilio: boolean
  aplica_recoge: boolean
  cupo_max: number | null
  activo: boolean
  orden: number
}

type Bloqueo = {
  id: string
  fecha: string
  slot_id: string | null
  hora_desde: string | null
  hora_hasta: string | null
  motivo: string | null
  origen: string | null
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
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
function isoDe(anio: number, mes: number, dia: number) {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}
const hhmm = (t: string | null) => (t ?? '').slice(0, 5)

const badge: Record<string, string> = {
  propuesta:  'bg-amber-100 text-amber-800',
  confirmada: 'bg-green-100 text-green-800',
  cumplida:   'bg-oso-100 text-oso-800',
  cancelada:  'bg-red-100 text-red-700',
}

const inputCls =
  'px-2 py-1.5 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300'

export default function Agenda({ session }: { session: Session }) {
  const [tab, setTab] = useState<'citas' | 'slots' | 'dias'>('citas')
  const [esDueno, setEsDueno] = useState(false)
  const [restauranteId, setRestauranteId] = useState<string>('')

  // ── Citas ──
  const [citas, setCitas] = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<'todas' | 'revision' | 'entrega'>('todas')

  // ── Slots y bloqueos ──
  const [slots, setSlots] = useState<Slot[]>([])
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [diasSemana, setDiasSemana] = useState<Record<number, boolean>>({})
  const [guardandoSlots, setGuardandoSlots] = useState(false)
  const [slotsGuardados, setSlotsGuardados] = useState(false)

  const hoy = new Date()
  const [vista, setVista] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [tramo, setTramo] = useState({ desde: '', hasta: '', motivo: '' })

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

  async function cargarConfig() {
    const [s, b, h] = await Promise.all([
      supabase.from('slots_entrega').select('*').order('orden').order('hora'),
      supabase.from('dias_bloqueados').select('id, fecha, slot_id, hora_desde, hora_hasta, motivo, origen'),
      supabase.from('horarios_restaurante').select('dia_semana, cerrado'),
    ])
    if (s.data) setSlots(s.data as Slot[])
    if (b.data) setBloqueos(b.data as Bloqueo[])
    if (h.data) {
      const m: Record<number, boolean> = {}
      for (const d of h.data as any[]) m[d.dia_semana] = !!d.cerrado
      setDiasSemana(m)
    }
  }

  useEffect(() => {
    cargar()
    ;(async () => {
      const u = await supabase.from('usuarios_panel').select('rol').eq('user_id', session.user.id).single()
      setEsDueno(u.data?.rol === 'dueno')
      const r = await supabase.from('categorias').select('restaurante_id').limit(1).maybeSingle()
      if (r.data?.restaurante_id) setRestauranteId(r.data.restaurante_id as string)
      cargarConfig()
    })()
  }, [session.user.id])

  useEffect(() => {
    const canal = supabase.channel('citas-agenda')
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

  // ── Slots ──
  function editarSlot(id: string, campo: keyof Slot, valor: any) {
    setSlots(prev => prev.map(s => (s.id === id ? { ...s, [campo]: valor } : s)))
  }
  function agregarSlot() {
    setSlots(prev => [...prev, {
      id: `nuevo-${Date.now()}`, hora: '12:00', etiqueta: '', cierre_hora: '10:00',
      aplica_domicilio: true, aplica_recoge: true, cupo_max: null, activo: true,
      orden: prev.length + 1,
    }])
  }
  async function eliminarSlot(id: string) {
    if (!confirm('¿Quitar esta franja?')) return
    if (!id.startsWith('nuevo-')) await supabase.from('slots_entrega').delete().eq('id', id)
    setSlots(prev => prev.filter(s => s.id !== id))
  }
  async function guardarSlots() {
    if (!restauranteId) return
    setGuardandoSlots(true); setSlotsGuardados(false)
    for (const s of slots) {
      const fila = {
        hora: s.hora, etiqueta: s.etiqueta || null, cierre_hora: s.cierre_hora,
        aplica_domicilio: s.aplica_domicilio, aplica_recoge: s.aplica_recoge,
        cupo_max: s.cupo_max === null || (s.cupo_max as any) === '' ? null : Number(s.cupo_max),
        activo: s.activo, orden: s.orden,
      }
      const { error } = s.id.startsWith('nuevo-')
        ? await supabase.from('slots_entrega').insert({ ...fila, restaurante_id: restauranteId })
        : await supabase.from('slots_entrega').update(fila).eq('id', s.id)
      if (error) { alert('No se pudo guardar la franja: ' + error.message); setGuardandoSlots(false); return }
    }
    await cargarConfig()
    setGuardandoSlots(false)
    setSlotsGuardados(true); setTimeout(() => setSlotsGuardados(false), 2500)
  }

  // ── Bloqueos ──
  const bloqueoDiaCompleto = (fecha: string) =>
    bloqueos.find(b => b.fecha === fecha && !b.slot_id && !b.hora_desde)
  const bloqueosDelDia = (fecha: string) => bloqueos.filter(b => b.fecha === fecha)

  async function toggleDiaCompleto(fecha: string) {
    const ex = bloqueoDiaCompleto(fecha)
    if (ex) await supabase.from('dias_bloqueados').delete().eq('id', ex.id)
    else await supabase.from('dias_bloqueados').insert({ restaurante_id: restauranteId, fecha })
    cargarConfig()
  }
  async function toggleSlotBloqueado(fecha: string, slotId: string) {
    const ex = bloqueos.find(b => b.fecha === fecha && b.slot_id === slotId)
    if (ex) await supabase.from('dias_bloqueados').delete().eq('id', ex.id)
    else await supabase.from('dias_bloqueados').insert({ restaurante_id: restauranteId, fecha, slot_id: slotId })
    cargarConfig()
  }
  async function agregarTramo(fecha: string) {
    if (!tramo.desde || !tramo.hasta) return
    await supabase.from('dias_bloqueados').insert({
      restaurante_id: restauranteId, fecha,
      hora_desde: tramo.desde, hora_hasta: tramo.hasta, motivo: tramo.motivo || null,
    })
    setTramo({ desde: '', hasta: '', motivo: '' })
    cargarConfig()
  }
  async function quitarBloqueo(id: string) {
    await supabase.from('dias_bloqueados').delete().eq('id', id)
    cargarConfig()
  }

  // Grilla del mes
  const grilla = useMemo(() => {
    const primerDia = new Date(vista.anio, vista.mes, 1).getDay()
    const total = new Date(vista.anio, vista.mes + 1, 0).getDate()
    const celdas: (string | null)[] = Array(primerDia).fill(null)
    for (let d = 1; d <= total; d++) celdas.push(isoDe(vista.anio, vista.mes, d))
    return celdas
  }, [vista])

  function moverMes(delta: number) {
    setVista(v => {
      const m = v.mes + delta
      if (m < 0) return { anio: v.anio - 1, mes: 11 }
      if (m > 11) return { anio: v.anio + 1, mes: 0 }
      return { anio: v.anio, mes: m }
    })
    setDiaSel(null)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Agenda</h1>
        <p className="text-mute text-sm">
          {pendientes > 0
            ? `${pendientes} cita${pendientes === 1 ? '' : 's'} por confirmar`
            : 'Todas las citas están confirmadas'}
        </p>
      </div>

      {esDueno && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {([['citas', 'Citas'], ['slots', 'Franjas de entrega'], ['dias', 'Días disponibles']] as const)
            .map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                  tab === v ? 'bg-oso-800 text-white' : 'bg-oso-100 text-oso-800 hover:bg-oso-200'
                }`}
              >
                {label}
              </button>
            ))}
        </div>
      )}

      {/* ══════════ CITAS ══════════ */}
      {tab === 'citas' && (
        <>
          <div className="flex gap-2 mb-6">
            {([['todas', 'Todas'], ['revision', 'Revisiones'], ['entrega', 'Entregas']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFiltro(v)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  filtro === v ? 'bg-oso-600 text-white' : 'bg-canvas text-mute hover:bg-oso-100'
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
                              {c.hora && <span className="text-xs text-mute tnum">{hhmm(c.hora)}</span>}
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
        </>
      )}

      {/* ══════════ FRANJAS DE ENTREGA ══════════ */}
      {tab === 'slots' && esDueno && (
        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="font-display text-xl font-semibold tracking-tight mb-1">Franjas de entrega</h2>
          <p className="text-xs text-mute mb-5">
            La <strong>hora de cierre</strong> es hasta qué hora se puede pedir HOY para esa franja.
            Ej: la de las 11:00 con cierre 09:00 deja de ofrecerse para hoy después de las 9am.
          </p>

          <div className="space-y-3">
            {slots.map(s => (
              <div key={s.id} className="border border-line rounded-lg p-3 bg-canvas/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-mute">
                    {s.etiqueta || hhmm(s.hora) || 'Nueva franja'}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => editarSlot(s.id, 'activo', !s.activo)}
                      className={`relative rounded-full transition-colors shrink-0 ${s.activo ? 'bg-oso-600' : 'bg-line'}`}
                      style={{ height: '20px', width: '36px' }}
                      aria-label={s.activo ? 'Franja activa' : 'Franja inactiva'}
                    >
                      <span className="absolute top-0.5 left-0.5 bg-white rounded-full transition-transform"
                        style={{ height: '16px', width: '16px', transform: s.activo ? 'translateX(16px)' : 'none' }} />
                    </button>
                    <button onClick={() => eliminarSlot(s.id)} className="text-[11px] text-red-700 hover:underline">
                      Quitar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-mute">Hora</span>
                    <input type="time" value={hhmm(s.hora)}
                      onChange={e => editarSlot(s.id, 'hora', e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-mute">Cierra a las</span>
                    <input type="time" value={hhmm(s.cierre_hora)}
                      onChange={e => editarSlot(s.id, 'cierre_hora', e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-mute">Etiqueta</span>
                    <input type="text" value={s.etiqueta ?? ''} placeholder="3:00 p.m."
                      onChange={e => editarSlot(s.id, 'etiqueta', e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-mute">Cupo (vacío = sin tope)</span>
                    <input type="number" min={1} value={s.cupo_max ?? ''} placeholder="—"
                      onChange={e => editarSlot(s.id, 'cupo_max', e.target.value === '' ? null : Number(e.target.value))}
                      className={`${inputCls} tnum`} />
                  </label>
                </div>

                <div className="flex gap-4 mt-2.5">
                  <label className="flex items-center gap-1.5 text-xs text-mute cursor-pointer">
                    <input type="checkbox" checked={s.aplica_domicilio}
                      onChange={e => editarSlot(s.id, 'aplica_domicilio', e.target.checked)} />
                    Domicilio
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-mute cursor-pointer">
                    <input type="checkbox" checked={s.aplica_recoge}
                      onChange={e => editarSlot(s.id, 'aplica_recoge', e.target.checked)} />
                    Recoge en el taller
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button onClick={agregarSlot} className="text-xs font-medium text-oso-700 hover:underline mt-3">
            + Agregar franja
          </button>

          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-line">
            <button onClick={guardarSlots} disabled={guardandoSlots}
              className="px-4 py-2 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors">
              {guardandoSlots ? 'Guardando…' : 'Guardar franjas'}
            </button>
            {slotsGuardados && <span className="text-sm text-green-700 font-medium">✓ Guardado</span>}
          </div>
        </section>
      )}

      {/* ══════════ DÍAS DISPONIBLES ══════════ */}
      {tab === 'dias' && esDueno && (
        <section className="bg-surface border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold tracking-tight capitalize">
              {MESES[vista.mes]} {vista.anio}
            </h2>
            <div className="flex gap-1">
              <button onClick={() => moverMes(-1)}
                className="px-2.5 py-1 bg-canvas border border-line rounded-lg text-sm hover:bg-oso-50">‹</button>
              <button onClick={() => moverMes(1)}
                className="px-2.5 py-1 bg-canvas border border-line rounded-lg text-sm hover:bg-oso-50">›</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_CORTOS.map((d, i) => (
              <div key={i} className="text-center text-[10px] uppercase tracking-wider text-mute py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grilla.map((fecha, i) => {
              if (!fecha) return <div key={`v${i}`} />
              const dia = Number(fecha.slice(8))
              const dow = new Date(vista.anio, vista.mes, dia).getDay()
              const cerradoSemana = diasSemana[dow] === true
              const full = !!bloqueoDiaCompleto(fecha)
              const parcial = bloqueosDelDia(fecha).some(b => b.slot_id || b.hora_desde)
              const esHoy = fecha === hoyISO()
              return (
                <button
                  key={fecha}
                  onClick={() => { setDiaSel(fecha); setTramo({ desde: '', hasta: '', motivo: '' }) }}
                  className={`relative aspect-square rounded-lg text-sm transition-colors border ${
                    diaSel === fecha ? 'border-oso-600' : 'border-transparent'
                  } ${
                    full ? 'bg-red-100 text-red-700 line-through'
                    : cerradoSemana ? 'bg-canvas text-mute'
                    : 'bg-canvas/60 text-ink hover:bg-oso-50'
                  } ${esHoy ? 'font-semibold' : ''}`}
                >
                  {dia}
                  {parcial && !full && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex gap-4 mt-3 text-[11px] text-mute flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-100 inline-block" /> día cerrado</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> bloqueo parcial</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-canvas border border-line inline-block" /> sin atención</span>
          </div>

          {diaSel && (
            <div className="mt-5 pt-4 border-t border-line">
              <h3 className="font-medium text-sm capitalize mb-3">{fechaLarga(diaSel)}</h3>

              <div className="flex items-center gap-2.5 mb-4">
                <button
                  onClick={() => toggleDiaCompleto(diaSel)}
                  className={`relative rounded-full transition-colors shrink-0 ${
                    bloqueoDiaCompleto(diaSel) ? 'bg-red-500' : 'bg-line'}`}
                  style={{ height: '22px', width: '40px' }}
                  aria-label="Cerrar el día completo"
                >
                  <span className="absolute top-0.5 left-0.5 bg-white rounded-full transition-transform"
                    style={{ height: '18px', width: '18px',
                      transform: bloqueoDiaCompleto(diaSel) ? 'translateX(18px)' : 'none' }} />
                </button>
                <span className="text-sm">Cerrar todo el día</span>
              </div>

              {!bloqueoDiaCompleto(diaSel) && (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-mute mb-2">Franjas de este día</div>
                  <div className="space-y-1.5 mb-4">
                    {slots.filter(s => s.activo).map(s => {
                      const bloq = bloqueos.some(b => b.fecha === diaSel && b.slot_id === s.id)
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 bg-canvas/50 border border-line rounded-lg px-2.5 py-1.5">
                          <button
                            onClick={() => toggleSlotBloqueado(diaSel, s.id)}
                            className={`relative rounded-full transition-colors shrink-0 ${bloq ? 'bg-line' : 'bg-oso-600'}`}
                            style={{ height: '18px', width: '32px' }}
                            aria-label={bloq ? 'Franja bloqueada' : 'Franja disponible'}
                          >
                            <span className="absolute top-0.5 left-0.5 bg-white rounded-full transition-transform"
                              style={{ height: '14px', width: '14px', transform: bloq ? 'none' : 'translateX(14px)' }} />
                          </button>
                          <span className={`text-sm ${bloq ? 'text-mute line-through' : 'text-ink'}`}>
                            {s.etiqueta || hhmm(s.hora)}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="text-[11px] uppercase tracking-wider text-mute mb-2">Bloquear un tramo de horas</div>
                  <div className="flex gap-2 flex-wrap items-end">
                    <input type="time" value={tramo.desde}
                      onChange={e => setTramo(t => ({ ...t, desde: e.target.value }))} className={inputCls} />
                    <span className="text-mute text-sm pb-1.5">a</span>
                    <input type="time" value={tramo.hasta}
                      onChange={e => setTramo(t => ({ ...t, hasta: e.target.value }))} className={inputCls} />
                    <input type="text" placeholder="Motivo (opcional)" value={tramo.motivo}
                      onChange={e => setTramo(t => ({ ...t, motivo: e.target.value }))}
                      className={`${inputCls} flex-1 min-w-[140px]`} />
                    <button onClick={() => agregarTramo(diaSel)}
                      className="px-3 py-1.5 bg-canvas border border-line rounded-lg text-sm hover:bg-oso-50 transition-colors">
                      Bloquear
                    </button>
                  </div>
                </>
              )}

              {bloqueosDelDia(diaSel).length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-wider text-mute mb-2">Bloqueos de este día</div>
                  <div className="space-y-1.5">
                    {bloqueosDelDia(diaSel).map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-2 text-xs bg-canvas/50 border border-line rounded-lg px-2.5 py-1.5">
                        <span className="text-mute">
                          {b.slot_id
                            ? `Franja ${slots.find(s => s.id === b.slot_id)?.etiqueta ?? ''}`
                            : b.hora_desde
                              ? `${hhmm(b.hora_desde)} – ${hhmm(b.hora_hasta)}`
                              : 'Día completo'}
                          {b.motivo ? ` · ${b.motivo}` : ''}
                          {b.origen === 'google' ? ' · Google Calendar' : ''}
                        </span>
                        <button onClick={() => quitarBloqueo(b.id)} className="text-mute hover:text-red-600">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
