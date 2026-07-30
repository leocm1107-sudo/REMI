// src/pages/Agenda.tsx — Agenda de encargos
// Dos pestañas:
//   Agenda  — todo junto (entregas, revisiones y bloqueos), en calendario o en lista
//   Franjas — la planilla editable de franjas de entrega, con cupo y hora de cierre
//
// "Citas" y "Días disponibles" dejaron de ser cosas separadas: son la misma
// agenda vista de dos formas. Los filtros de arriba encienden y apagan capas,
// como los calendarios de Google.
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

type Capa = 'entrega' | 'revision' | 'disponibilidad'

type Evento = {
  capa: Capa
  fecha: string
  hora: string | null
  etiqueta: string
  personalizado: boolean
  cita?: Cita
  bloqueo?: Bloqueo
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Una capa, un color. Se usa igual en el chip del filtro, en el evento del
// calendario y en el punto de la lista, para que la asociación sea inmediata.
const CAPAS: Record<Capa, { nombre: string; punto: string; chip: string; activo: string }> = {
  entrega:  { nombre: 'Entregas',   punto: 'bg-oso-600',    chip: 'bg-oso-50 text-oso-900 border-oso-200',          activo: 'bg-oso-600 text-white border-oso-600' },
  revision: { nombre: 'Revisiones', punto: 'bg-violet-500', chip: 'bg-violet-50 text-violet-900 border-violet-200', activo: 'bg-violet-500 text-white border-violet-500' },
  disponibilidad: { nombre: 'Disponibilidad', punto: 'bg-emerald-600', chip: 'bg-red-50 text-red-900 border-red-200', activo: 'bg-emerald-600 text-white border-emerald-600' },
}

// Estado de cada día para la capa de disponibilidad. Es lo que Angélica
// publica en su historia: ¿hay cupo, va apretado, o ya no?
type EstadoDia = 'sin_atencion' | 'cerrado' | 'sin_cupo' | 'casi' | 'disponible'

// ── Paleta de la agenda ──────────────────────────────────────────────────
// El calendario se ve como la "Agenda de Pedidos" que Angélica publica en sus
// historias: fondo vino, número del día en un cuadrito blanco, símbolos
// blancos. Que el panel y el cliente vean lo mismo evita que ella tenga que
// traducir de un lado al otro.
const VINO = {
  fondo:        '#4A2A3C',
  fondoCerrado: '#3C2131',
  linea:        'rgba(255,255,255,0.14)',
  vacio:        '#412536',
}

// Colores de cada capa sobre el vino: claros, para que se lean encima
const CAPA_COLOR: Record<Capa, { hex: string; rgb: [number, number, number] }> = {
  entrega:        { hex: '#E9C79E', rgb: [233, 199, 158] },  // crema
  revision:       { hex: '#C7ACEC', rgb: [199, 172, 236] },  // lila
  disponibilidad: { hex: '#9FDCB2', rgb: [159, 220, 178] },  // menta
}

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
function haceDias(n: number) {
  const f = new Date()
  f.setDate(f.getDate() - n)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}
const hhmm = (t: string | null) => (t ?? '').slice(0, 5)

// Hora corta para el chip del calendario: "15:00" → "3pm", "11:30" → "11:30am"
function horaCorta(t: string | null) {
  const s = hhmm(t)
  if (!s) return ''
  const [h, m] = s.split(':').map(Number)
  const suf = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suf}` : `${h12}:${String(m).padStart(2, '0')}${suf}`
}

const badge: Record<string, string> = {
  propuesta:  'bg-amber-100 text-amber-800',
  confirmada: 'bg-green-100 text-green-800',
  cumplida:   'bg-oso-100 text-oso-800',
  cancelada:  'bg-red-100 text-red-700',
}

const inputCls =
  'px-2 py-1.5 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300'

// Símbolo de "día cerrado" — solo el trazo, sin fondo, mismo grosor que
// tenía la raya diagonal anterior. Va centrado en medio de la celda.
function IconProhibido({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.1" />
      <line x1="5.6" y1="18.4" x2="18.4" y2="5.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

// Símbolo de "día saturado de pedidos" — el triángulo de alerta, en un solo
// color (sin el negro del ícono original), para usar en amarillo/ámbar.
// Triángulo con las rayitas de "atención" a los lados, como en la pieza
function IconAlerta({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 6.4 L20.6 20.4 H3.4 Z" stroke="currentColor" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      <rect x="11.1" y="11" width="1.8" height="4.6" rx="0.9" fill="currentColor" />
      <circle cx="12" cy="17.6" r="1" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <line x1="4.6" y1="6.2" x2="3.1" y2="4.7" />
        <line x1="19.4" y1="6.2" x2="20.9" y2="4.7" />
        <line x1="2.6" y1="10.4" x2="0.9" y2="10.4" />
        <line x1="21.4" y1="10.4" x2="23.1" y2="10.4" />
      </g>
    </svg>
  )
}

// Símbolo de "hay cupo" — el mismo check en círculo de la agenda que Angélica
// publica en sus historias, para que el panel y el cliente hablen igual.
function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11.4" cy="12.4" r="8.6" stroke="currentColor" strokeWidth="2.1" />
      <path d="M6.6 12.6 L10.2 16.2 L20.4 4.6" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Un color "tenue" de fondo por capa (y por combinación de dos capas), para
// teñir todo el calendario cuando el filtro deja solo una o dos cosas
// encendidas — como si fuera un calendario de Google con una sola agenda
// activa. Con 0 o 3 capas encendidas no hay tinte: el calendario vuelve al
// blanco/gris "tipo calendario" de siempre.
const TINTES: Record<string, { seccion: string; celda: string; celdaCerrada: string }> = {
  entrega:            { seccion: 'bg-oso-50/70',     celda: 'bg-oso-50/40 hover:bg-oso-100/60',         celdaCerrada: 'bg-oso-100/50' },
  revision:           { seccion: 'bg-violet-50/70',  celda: 'bg-violet-50/40 hover:bg-violet-100/60',   celdaCerrada: 'bg-violet-100/50' },
  disponibilidad:            { seccion: 'bg-emerald-50/70', celda: 'bg-emerald-50/40 hover:bg-emerald-100/60', celdaCerrada: 'bg-emerald-100/50' },
  'entrega-revision':        { seccion: 'bg-fuchsia-50/70', celda: 'bg-fuchsia-50/40 hover:bg-fuchsia-100/60', celdaCerrada: 'bg-fuchsia-100/50' },
  'entrega-disponibilidad':  { seccion: 'bg-amber-50/70',   celda: 'bg-amber-50/40 hover:bg-amber-100/60',     celdaCerrada: 'bg-amber-100/50' },
  'revision-disponibilidad': { seccion: 'bg-sky-50/70',     celda: 'bg-sky-50/40 hover:bg-sky-100/60',         celdaCerrada: 'bg-sky-100/50' },
}
// Sin tinte: el "color tipo calendario" original — blanco y gris, como Google Calendar
const SIN_TINTE = { seccion: 'bg-white', celda: 'bg-white hover:bg-slate-50', celdaCerrada: 'bg-slate-50' }

export default function Agenda({ session }: { session: Session }) {
  const [tab, setTab] = useState<'agenda' | 'slots'>('agenda')
  const [modo, setModo] = useState<'calendario' | 'lista'>('calendario')
  const [esDueno, setEsDueno] = useState(false)
  const [restauranteId, setRestauranteId] = useState<string>('')

  const [citas, setCitas] = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)
  const [capas, setCapas] = useState<Record<Capa, boolean>>({ entrega: true, revision: true, disponibilidad: true })

  // Sub-filtro de entregas: normales, personalizadas o todas. Se abre con la
  // flechita del chip "Entregas".
  const [filtroEntrega, setFiltroEntrega] = useState<'todas' | 'normales' | 'personalizados'>('todas')
  const [menuEntregaAbierto, setMenuEntregaAbierto] = useState(false)

  // Máximo de pedidos de entrega en un día antes de mostrar el ícono de
  // alerta (día saturado). Editable por el dueño desde el calendario.
  const [maxPedidosDia, setMaxPedidosDia] = useState<number>(8)

  const [slots, setSlots] = useState<Slot[]>([])
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [diasSemana, setDiasSemana] = useState<Record<number, boolean>>({})
  const [guardandoSlots, setGuardandoSlots] = useState(false)
  const [slotsGuardados, setSlotsGuardados] = useState(false)

  const hoy = new Date()
  const [vista, setVista] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() })
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [tramo, setTramo] = useState({ desde: '', hasta: '', motivo: '' })
  const [eventoModal, setEventoModal] = useState<Evento | null>(null)

  async function cargar() {
    setCargando(true)
    // Desde 90 días atrás: alcanza para navegar unos meses hacia atrás sin
    // volver a consultar cada vez que se cambia de mes.
    const { data } = await supabase
      .from('citas')
      .select('id, tipo, fecha, hora, estado, notas, pedido_id, pedidos(numero_pedido, total, estado, tipo_entrega, direccion_entrega, clientes(nombre, telefono))')
      .gte('fecha', haceDias(90))
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
    // Escuchamos citas Y bloqueos: así lo que el sync trae de Google Calendar
    // (o lo que se bloquee desde otro dispositivo) aparece sin recargar.
    const canal = supabase.channel('agenda-viva')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dias_bloqueados' }, cargarConfig)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  // Un pedido es personalizado si tiene cita de revisión: esa cita solo se crea
  // para tortas a medida y mesas dulces. No hace falta una columna nueva.
  const pedidosPersonalizados = useMemo(() => {
    const s = new Set<string>()
    for (const c of citas) if (c.tipo === 'revision') s.add(c.pedido_id)
    return s
  }, [citas])

  // Todo lo que va al calendario, ya filtrado por las capas encendidas
  const eventos = useMemo<Evento[]>(() => {
    const out: Evento[] = []

    for (const c of citas) {
      if (!capas[c.tipo]) continue
      const esPersonalizado = pedidosPersonalizados.has(c.pedido_id)
      if (c.tipo === 'entrega' && filtroEntrega !== 'todas') {
        if (filtroEntrega === 'normales' && esPersonalizado) continue
        if (filtroEntrega === 'personalizados' && !esPersonalizado) continue
      }
      out.push({
        capa: c.tipo,
        fecha: c.fecha,
        hora: c.hora,
        etiqueta: `${c.pedidos?.numero_pedido ?? 'Pedido'}${c.pedidos?.clientes?.nombre ? ` · ${c.pedidos.clientes.nombre}` : ''}`,
        personalizado: esPersonalizado,
        cita: c,
      })
    }

    if (capas.disponibilidad) {
      for (const b of bloqueos) {
        const desc = b.slot_id
          ? `Franja ${slots.find(s => s.id === b.slot_id)?.etiqueta ?? ''}`
          : b.hora_desde
            ? `${hhmm(b.hora_desde)}–${hhmm(b.hora_hasta)}`
            : 'Día cerrado'
        out.push({
          capa: 'disponibilidad',
          fecha: b.fecha,
          hora: b.hora_desde,
          etiqueta: b.motivo ? `${desc} · ${b.motivo}` : desc,
          personalizado: false,
          bloqueo: b,
        })
      }
    }

    return out.sort((a, b) =>
      a.fecha === b.fecha ? (a.hora ?? '').localeCompare(b.hora ?? '') : a.fecha.localeCompare(b.fecha))
  }, [citas, bloqueos, slots, capas, pedidosPersonalizados, filtroEntrega])

  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>()
    for (const e of eventos) {
      const arr = m.get(e.fecha) ?? []
      arr.push(e)
      m.set(e.fecha, arr)
    }
    return m
  }, [eventos])

  // Cuántas entregas hay agendadas por día, sin importar filtros — la alerta
  // de saturación mira el total real de pedidos, no lo que esté oculto.
  const entregasPorDia = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of citas) {
      if (c.tipo !== 'entrega') continue
      m.set(c.fecha, (m.get(c.fecha) ?? 0) + 1)
    }
    return m
  }, [citas])
  const grilla = useMemo(() => {
    const primerDia = new Date(vista.anio, vista.mes, 1).getDay()
    const total = new Date(vista.anio, vista.mes + 1, 0).getDate()
    const celdas: (string | null)[] = Array(primerDia).fill(null)
    for (let d = 1; d <= total; d++) celdas.push(isoDe(vista.anio, vista.mes, d))
    while (celdas.length % 7 !== 0) celdas.push(null)
    return celdas
  }, [vista])

  const diaSaturado = (fecha: string) => (entregasPorDia.get(fecha) ?? 0) >= maxPedidosDia

  // ── Disponibilidad real de cada día ──────────────────────────────────────
  // Mira todo lo que puede quitar cupo: día cerrado, día sin atención por
  // horario, franjas desactivadas en la planilla, franjas apagadas para esa
  // fecha, tramos de horas ocupados (incluidos los que llegan de Google
  // Calendar) y el cupo_max de cada franja contra las entregas ya agendadas.
  function estadoDelDia(fecha: string): EstadoDia {
    const dow = new Date(`${fecha}T12:00:00`).getDay()
    if (diasSemana[dow] === true) return 'sin_atencion'

    // Ojo: acá NO se puede usar bloqueoDiaCompleto(). Esa función se declara
    // más abajo con const, y este useMemo corre durante el render, así que
    // caeríamos en la zona muerta temporal (ReferenceError y pantalla en
    // blanco). Se calcula igual, pero en línea.
    const delDia = bloqueos.filter(b => b.fecha === fecha)
    if (delDia.some(b => !b.slot_id && !b.hora_desde)) return 'cerrado'

    // Solo las franjas encendidas en la planilla cuentan como capacidad
    const activas = slots.filter(s => s.activo)
    if (activas.length === 0) return 'sin_atencion'

    const libres = activas.filter(s => {
      if (delDia.some(b => b.slot_id === s.id)) return false
      const h = hhmm(s.hora)
      // Un tramo bloqueado se come las franjas que caen dentro
      return !delDia.some(b => b.hora_desde && h >= hhmm(b.hora_desde) && h < hhmm(b.hora_hasta))
    })
    if (libres.length === 0) return 'sin_cupo'

    const entregas = entregasPorDia.get(fecha) ?? 0

    // Si TODAS las franjas libres tienen cupo definido, se puede medir de verdad
    if (libres.every(s => s.cupo_max != null)) {
      const capacidad = libres.reduce((a, s) => a + (s.cupo_max ?? 0), 0)
      if (entregas >= capacidad) return 'sin_cupo'
      if (entregas >= capacidad * 0.7) return 'casi'
    }

    if (entregas >= maxPedidosDia) return 'casi'
    if (libres.length < activas.length) return 'casi'   // quedó alguna franja ocupada
    return 'disponible'
  }

  const estadosDia = useMemo(() => {
    const m = new Map<string, EstadoDia>()
    for (const f of grilla) if (f) m.set(f, estadoDelDia(f))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grilla, bloqueos, slots, diasSemana, entregasPorDia, maxPedidosDia])

  // La lista solo mira de hoy en adelante: es una agenda de trabajo, no un histórico
  const listaFutura = useMemo(() => {
    const h = hoyISO()
    const m = new Map<string, Evento[]>()
    for (const e of eventos) {
      if (e.fecha < h) continue
      const arr = m.get(e.fecha) ?? []
      arr.push(e)
      m.set(e.fecha, arr)
    }
    return [...m.entries()]
  }, [eventos])

  async function cambiarEstado(id: string, estado: Cita['estado']) {
    await supabase.from('citas').update({
      estado,
      confirmada_por: estado === 'confirmada' ? 'jefe' : null,
      confirmada_at:  estado === 'confirmada' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    cargar()
  }

  const porConfirmar = useMemo(
    () => citas.filter(c => c.estado === 'propuesta' && c.fecha >= hoyISO()),
    [citas],
  )

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

  // Al filtrar, el vino se tiñe con el color de la capa que quedó encendida.
  // Con todas (o ninguna) vuelve al vino puro de la marca.
  const tinte = useMemo(() => {
    const activas = (['entrega', 'revision', 'disponibilidad'] as Capa[]).filter(c => capas[c])
    if (activas.length === 0 || activas.length === 3) {
      return { celda: VINO.fondo, celdaCerrada: VINO.fondoCerrado }
    }
    const mez = (i: number) =>
      Math.round(activas.reduce((a, c) => a + CAPA_COLOR[c].rgb[i], 0) / activas.length)
    const r = mez(0), g = mez(1), b = mez(2)
    // El color de la capa se mezcla con el vino, sin taparlo
    return {
      celda:        `color-mix(in srgb, rgb(${r} ${g} ${b}) 16%, ${VINO.fondo})`,
      celdaCerrada: `color-mix(in srgb, rgb(${r} ${g} ${b}) 10%, ${VINO.fondoCerrado})`,
    }
  }, [capas])

  async function eliminarEvento(e: Evento) {
    if (e.cita) {
      if (!confirm('¿Cancelar esta cita?')) return
      await cambiarEstado(e.cita.id, 'cancelada')
    } else if (e.bloqueo) {
      if (!confirm('¿Quitar este bloqueo?')) return
      await quitarBloqueo(e.bloqueo.id)
    }
    setEventoModal(null)
  }

  function moverMes(delta: number) {
    setVista(v => {
      const m = v.mes + delta
      if (m < 0) return { anio: v.anio - 1, mes: 11 }
      if (m > 11) return { anio: v.anio + 1, mes: 0 }
      return { anio: v.anio, mes: m }
    })
    setDiaSel(null)
  }

  function irAHoy() {
    const f = new Date()
    setVista({ anio: f.getFullYear(), mes: f.getMonth() })
    setDiaSel(hoyISO())
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Agenda</h1>
        <p className="text-mute text-sm">
          {porConfirmar.length > 0
            ? `${porConfirmar.length} cita${porConfirmar.length === 1 ? '' : 's'} por confirmar`
            : 'Todas las citas están confirmadas'}
        </p>
      </div>

      {esDueno && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {([['agenda', 'Agenda'], ['slots', 'Franjas de entrega']] as const).map(([v, label]) => (
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

      {/* ══════════ AGENDA ══════════ */}
      {tab === 'agenda' && (
        <>
          {/* Capas + modo de vista */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex gap-2 flex-wrap relative">
              {(Object.keys(CAPAS) as Capa[]).map(c => {
                const on = capas[c]
                const esEntrega = c === 'entrega'
                return (
                  <div key={c} className="relative">
                    <div
                      className="flex items-center rounded-full text-[13px] font-semibold border-[1.5px] shadow-sm transition-colors"
                      style={on
                        ? { background: CAPA_COLOR[c].hex, borderColor: CAPA_COLOR[c].hex, color: VINO.fondo }
                        : { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(74,42,60,0.25)', color: '#4A2A3C' }}
                    >
                      <button
                        onClick={() => setCapas(p => ({ ...p, [c]: !p[c] }))}
                        aria-pressed={on}
                        className="flex items-center gap-1.5 pl-3.5 pr-2 py-1.5"
                      >
                        <span className="w-2.5 h-2.5 rounded-full"
                          style={{ background: on ? VINO.fondo : CAPA_COLOR[c].hex }} />
                        {CAPAS[c].nombre}
                        {esEntrega && filtroEntrega !== 'todas' && (
                          <span className="text-[10px] font-medium opacity-75">
                            · {filtroEntrega === 'normales' ? 'normales' : 'personalizadas'}
                          </span>
                        )}
                      </button>
                      {esEntrega && (
                        <button
                          onClick={() => setMenuEntregaAbierto(v => !v)}
                          aria-label="Elegir entre entregas normales y personalizadas"
                          aria-expanded={menuEntregaAbierto}
                          className="pr-3 pl-1 py-1.5 border-l"
                          style={{ borderColor: on ? 'rgba(74,42,60,0.25)' : 'rgba(74,42,60,0.18)' }}
                        >
                          <span className={`inline-block transition-transform text-[10px] ${menuEntregaAbierto ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                      )}
                    </div>

                    {esEntrega && menuEntregaAbierto && (
                      <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuEntregaAbierto(false)} />
                      <div className="absolute z-20 mt-1.5 w-44 bg-white border border-line rounded-lg shadow-lg overflow-hidden">
                        {([
                          ['todas', 'Todas las entregas', 'text-ink'],
                          ['normales', 'Normales', 'text-oso-700'],
                          ['personalizados', 'Personalizadas', 'text-violet-700'],
                        ] as const).map(([v, label, color]) => (
                          <button
                            key={v}
                            onClick={() => { setFiltroEntrega(v); setMenuEntregaAbierto(false) }}
                            className={`w-full text-left px-3 py-2 text-sm font-medium ${color} hover:bg-oso-50 ${
                              filtroEntrega === v ? 'bg-oso-50/80' : ''
                            }`}
                          >
                            {filtroEntrega === v && '✓ '}{label}
                          </button>
                        ))}
                      </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-1 bg-canvas border border-line rounded-full p-0.5">
              {([['calendario', 'Calendario'], ['lista', 'Lista']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setModo(v)}
                  className={`px-3 py-1 rounded-full text-xs transition-colors ${
                    modo === v ? 'bg-oso-800 text-white' : 'text-mute hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {cargando ? (
            <p className="text-center text-mute py-20 text-sm">Cargando agenda…</p>
          ) : modo === 'calendario' ? (
            <>
              <section className="bg-white border border-line rounded-xl p-4 sm:p-5">
                {/* Tarjeta vino: el mismo lenguaje visual de la agenda que se publica */}
                <div className="rounded-2xl p-3 sm:p-4" style={{ background: VINO.fondo }}>
                <div className="flex items-center justify-between mb-3 gap-3">
                  <h2 className="font-display text-xl font-semibold tracking-tight capitalize text-white">
                    {MESES[vista.mes]} {vista.anio}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {esDueno && (
                      <label className="flex items-center gap-1.5 text-[11px] text-white/75" title="Al llegar a este número de entregas en un día, se muestra el ícono de alerta">
                        <IconAlerta className="w-3.5 h-3.5 text-white/80 shrink-0" />
                        Máx./día
                        <input
                          type="number" min={1} value={maxPedidosDia}
                          onChange={e => setMaxPedidosDia(Math.max(1, Number(e.target.value) || 1))}
                          className="w-12 px-1.5 py-1 rounded-md text-xs tnum text-white bg-white/10 border border-white/25 focus:outline-none focus:ring-2 focus:ring-white/40"
                        />
                      </label>
                    )}
                    <div className="flex gap-1">
                      <button onClick={irAHoy}
                        className="px-3 py-1 rounded-lg text-xs text-white/90 border border-white/25 hover:bg-white/10 transition-colors">Hoy</button>
                      <button onClick={() => moverMes(-1)} aria-label="Mes anterior"
                        className="px-2.5 py-1 rounded-lg text-sm text-white/90 border border-white/25 hover:bg-white/10 transition-colors">‹</button>
                      <button onClick={() => moverMes(1)} aria-label="Mes siguiente"
                        className="px-2.5 py-1 rounded-lg text-sm text-white/90 border border-white/25 hover:bg-white/10 transition-colors">›</button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto -mx-1 px-1">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-7 gap-px mb-px">
                      {DIAS_CORTOS.map((d, i) => (
                        <div key={i} className="text-center text-[10px] uppercase tracking-[0.15em] text-white/70 py-1 font-medium">{d}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden"
                      style={{ background: VINO.linea }}>
                      {grilla.map((fecha, i) => {
                        if (!fecha) return <div key={`v${i}`} className="min-h-[104px]" style={{ background: VINO.vacio }} />
                        const dia = Number(fecha.slice(8))
                        const dow = new Date(vista.anio, vista.mes, dia).getDay()
                        const cerradoSemana = diasSemana[dow] === true
                        const full = !!bloqueoDiaCompleto(fecha)
                        const esHoy = fecha === hoyISO()
                        const delDia = porDia.get(fecha) ?? []
                        const visibles = delDia.slice(0, 3)
                        const resto = delDia.length - visibles.length

                        return (
                          <div
                            key={fecha}
                            role="button"
                            tabIndex={0}
                            onClick={() => { setDiaSel(fecha); setTramo({ desde: '', hasta: '', motivo: '' }) }}
                            onKeyDown={ev => { if (ev.key === 'Enter') { setDiaSel(fecha); setTramo({ desde: '', hasta: '', motivo: '' }) } }}
                            style={{ background: cerradoSemana ? tinte.celdaCerrada : tinte.celda }}
                            className={`group relative text-left align-top min-h-[104px] p-1.5 transition-colors cursor-pointer hover:brightness-110 ${
                              diaSel === fecha ? 'ring-2 ring-inset ring-white/70' : ''
                            }`}
                          >
                            {capas.disponibilidad && (() => {
                              const est = estadosDia.get(fecha) ?? 'disponible'
                              // El check solo de hoy en adelante: llenar el pasado
                              // de visto buenos es ruido, no información.
                              if (est === 'disponible' && fecha < hoyISO()) return null
                              if (est === 'sin_atencion') return null

                              const pinta = {
                                cerrado:    { Icono: IconProhibido, color: 'text-white/80', titulo: 'Día cerrado' },
                                sin_cupo:   { Icono: IconProhibido, color: 'text-white/80', titulo: 'Sin cupo' },
                                casi:       { Icono: IconAlerta,    color: 'text-white/80', titulo: `Cupo casi lleno — ${entregasPorDia.get(fecha) ?? 0} entrega(s)` },
                                disponible: { Icono: IconCheck,     color: 'text-white/75', titulo: 'Hay cupo' },
                              }[est]

                              return (
                                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none transition-opacity duration-150 group-hover:opacity-15"
                                  title={pinta.titulo}>
                                  <pinta.Icono className={`w-15 h-15 sm:w-16 sm:h-16 ${pinta.color}`} />
                                </div>
                              )
                            })()}

                            <div className="flex items-center justify-between mb-1 relative z-10">
                              <span
                                className="text-[11px] tnum font-semibold rounded-[3px] px-1 min-w-[18px] text-center"
                                style={esHoy
                                  ? { background: '#E9C79E', color: VINO.fondo }
                                  : { background: 'rgba(255,255,255,0.92)', color: VINO.fondo,
                                      opacity: cerradoSemana ? 0.55 : 1 }}
                              >{dia}</span>
                              {resto > 0 && <span className="text-[9px] text-white/60">+{resto}</span>}
                            </div>

                            <div className="space-y-0.5 relative z-10">
                              {visibles.map((e, k) => (
                                <div key={k}
                                  onClick={ev => { ev.stopPropagation(); setEventoModal(e) }}
                                  style={{ background: 'rgba(255,255,255,0.13)', borderColor: 'rgba(255,255,255,0.22)' }}
                                  className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight border cursor-pointer text-white hover:bg-white/25 transition-colors">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: CAPA_COLOR[e.capa].hex }} />
                                  {e.hora && <span className="tnum shrink-0">{horaCorta(e.hora)}</span>}
                                  <span className="truncate">
                                    {e.personalizado && <span title="Torta personalizada">✦ </span>}
                                    {e.etiqueta}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex gap-x-5 gap-y-2 mt-3 text-[11px] text-white/75 flex-wrap items-center">
                  <span className="flex items-center gap-1.5">
                    <IconCheck className="w-4 h-4 text-white/80" /> Disponible
                  </span>
                  <span className="flex items-center gap-1.5">
                    <IconAlerta className="w-4 h-4 text-white/80" /> Cupo casi lleno
                  </span>
                  <span className="flex items-center gap-1.5">
                    <IconProhibido className="w-4 h-4 text-white/80" /> Sin cupo
                  </span>
                  <span className="flex items-center gap-1.5">✦ personalizada</span>
                </div>
                </div>

                {/* Detalle del día */}
                {diaSel && (
                  <div className="mt-5 pt-4 border-t border-line">
                    <h3 className="font-medium text-sm capitalize mb-3">{fechaLarga(diaSel)}</h3>

                    {(porDia.get(diaSel) ?? []).length > 0 && (
                      <div className="space-y-1.5 mb-4">
                        {(porDia.get(diaSel) ?? []).map((e, k) => (
                          <div key={k}
                            onClick={() => setEventoModal(e)}
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs border cursor-pointer hover:brightness-95 transition-[filter] ${CAPAS[e.capa].chip}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${CAPAS[e.capa].punto}`} />
                            {e.hora && <span className="tnum shrink-0">{hhmm(e.hora)}</span>}
                            <span className="flex-1 truncate">
                              {e.personalizado && '✦ '}{e.etiqueta}
                            </span>
                            {e.cita && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge[e.cita.estado]}`}>
                                {e.cita.estado}
                              </span>
                            )}
                            {e.bloqueo && esDueno && (
                              <button onClick={ev => { ev.stopPropagation(); quitarBloqueo(e.bloqueo!.id) }}
                                className="text-mute hover:text-red-600" aria-label="Quitar bloqueo">×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {esDueno && (
                      <>
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
                      </>
                    )}
                  </div>
                )}
              </section>

              {/* Pendientes de confirmar, debajo del calendario */}
              {porConfirmar.length > 0 && (
                <section className="mt-6">
                  <h2 className="font-display text-lg font-semibold mb-3">
                    Por confirmar <span className="text-mute font-normal text-sm">({porConfirmar.length})</span>
                  </h2>
                  <div className="space-y-2.5">
                    {porConfirmar.map(c => (
                      <TarjetaCita key={c.id} c={c}
                        personalizado={pedidosPersonalizados.has(c.pedido_id)}
                        onEstado={cambiarEstado} />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            /* ══════════ LISTA ══════════ */
            listaFutura.length === 0 ? (
              <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
                <p className="text-ink font-medium">No hay nada agendado.</p>
                <p className="text-xs text-mute mt-1">
                  Los encargos con fecha aparecerán aquí. Si esperabas ver algo, revisá los filtros de arriba.
                </p>
              </div>
            ) : (
              <div className="space-y-7">
                {listaFutura.map(([fecha, delDia]) => (
                  <div key={fecha}>
                    <div className="flex items-baseline gap-3 mb-3">
                      <h2 className="font-display text-lg font-semibold capitalize">{fechaLarga(fecha)}</h2>
                      <span className="text-xs text-mute">
                        {delDia.length} {delDia.length === 1 ? 'evento' : 'eventos'}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {delDia.map((e, k) =>
                        e.cita ? (
                          <TarjetaCita key={e.cita.id} c={e.cita} personalizado={e.personalizado} onEstado={cambiarEstado} />
                        ) : (
                          <div key={`b${k}`} className="bg-surface border border-line rounded-xl p-3 flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${CAPAS.disponibilidad.punto}`} />
                            <span className="text-sm flex-1">{e.etiqueta}</span>
                            {e.bloqueo?.origen === 'google' && (
                              <span className="text-[10px] text-mute">Google Calendar</span>
                            )}
                            {esDueno && e.bloqueo && (
                              <button onClick={() => quitarBloqueo(e.bloqueo!.id)}
                                className="text-mute hover:text-red-600 px-1">×</button>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {eventoModal && (
            <ModalDetalleEvento
              evento={eventoModal}
              esDueno={esDueno}
              onCerrar={() => setEventoModal(null)}
              onEliminar={() => eliminarEvento(eventoModal)}
              onEstado={estado => { cambiarEstado(eventoModal.cita!.id, estado); setEventoModal(null) }}
            />
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
    </div>
  )
}

// ── Tarjeta de cita, compartida por la lista y por "Por confirmar" ──
function TarjetaCita({ c, personalizado, onEstado }: {
  c: Cita
  personalizado: boolean
  onEstado: (id: string, estado: Cita['estado']) => void
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full shrink-0 ${CAPAS[c.tipo].punto}`} />
            <span className="text-sm font-medium">
              {c.tipo === 'revision' ? 'Revisión' : 'Entrega'}
            </span>
            {personalizado && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200">
                ✦ personalizada
              </span>
            )}
            {c.hora && <span className="text-xs text-mute tnum">{hhmm(c.hora)}</span>}
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge[c.estado]}`}>{c.estado}</span>
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
              onClick={() => onEstado(c.id, 'confirmada')}
              className="px-3 py-1.5 bg-oso-600 text-white rounded-lg text-xs font-medium hover:bg-oso-700 transition-colors"
            >
              Confirmar cita
            </button>
          )}
          {c.estado === 'confirmada' && (
            <button
              onClick={() => onEstado(c.id, 'cumplida')}
              className="px-3 py-1.5 bg-oso-100 text-oso-800 rounded-lg text-xs hover:bg-oso-200 transition-colors"
            >
              Marcar cumplida
            </button>
          )}
          <button
            onClick={() => { if (confirm('¿Cancelar esta cita?')) onEstado(c.id, 'cancelada') }}
            className="px-3 py-1.5 text-xs text-mute hover:text-red-600 transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Modal de detalle de un evento del calendario, al estilo del popup de
// Google Calendar: ficha con los datos y la opción de eliminar ──
function ModalDetalleEvento({ evento, esDueno, onCerrar, onEliminar, onEstado }: {
  evento: Evento
  esDueno: boolean
  onCerrar: () => void
  onEliminar: () => void
  onEstado: (estado: Cita['estado']) => void
}) {
  const c = evento.cita
  const b = evento.bloqueo

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`h-1.5 ${CAPAS[evento.capa].punto}`} />

        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CAPAS[evento.capa].punto}`} />
              <h3 className="font-display text-lg font-semibold tracking-tight">
                {evento.capa === 'revision' ? 'Revisión' : evento.capa === 'entrega' ? 'Entrega' : 'Bloqueo'}
              </h3>
              {evento.personalizado && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200">
                  ✦ personalizada
                </span>
              )}
            </div>
            <button onClick={onCerrar} aria-label="Cerrar" className="text-mute hover:text-ink text-lg leading-none px-1">×</button>
          </div>

          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="text-mute w-5 text-center shrink-0">📅</span>
              <span className="capitalize">{fechaLarga(evento.fecha)}{evento.hora && ` · ${hhmm(evento.hora)}`}</span>
            </div>

            {c && (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="text-mute w-5 text-center shrink-0">🧾</span>
                  <span>{c.pedidos?.numero_pedido ?? '—'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge[c.estado]}`}>{c.estado}</span>
                </div>
                {c.pedidos?.clientes?.nombre && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-mute w-5 text-center shrink-0">👤</span>
                    <span>{c.pedidos.clientes.nombre}</span>
                  </div>
                )}
                {c.pedidos?.clientes?.telefono && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-mute w-5 text-center shrink-0">📞</span>
                    <span className="tnum">{c.pedidos.clientes.telefono}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <span className="text-mute w-5 text-center shrink-0">📍</span>
                  <span>
                    {c.pedidos?.tipo_entrega === 'domicilio'
                      ? (c.pedidos?.direccion_entrega || 'Domicilio')
                      : 'Recoge en el taller'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-mute w-5 text-center shrink-0">💰</span>
                  <span className="tnum font-medium">{formatCOP(c.pedidos?.total ?? 0)}</span>
                </div>
                {c.notas && (
                  <div className="flex items-start gap-2.5">
                    <span className="text-mute w-5 text-center shrink-0">🕐</span>
                    <span className="text-mute">{c.notas}</span>
                  </div>
                )}
              </>
            )}

            {b && (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="text-mute w-5 text-center shrink-0">📝</span>
                  <span>{evento.etiqueta}</span>
                </div>
                {b.origen === 'google' && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-mute w-5 text-center shrink-0">🔗</span>
                    <span className="text-mute text-xs">Sincronizado desde Google Calendar</span>
                  </div>
                )}
              </>
            )}
          </div>

          {esDueno && (
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-line">
              {c && c.estado === 'propuesta' && (
                <button onClick={() => onEstado('confirmada')}
                  className="px-3 py-1.5 bg-oso-600 text-white rounded-lg text-xs font-medium hover:bg-oso-700 transition-colors">
                  Confirmar cita
                </button>
              )}
              {c && c.estado === 'confirmada' && (
                <button onClick={() => onEstado('cumplida')}
                  className="px-3 py-1.5 bg-oso-100 text-oso-800 rounded-lg text-xs hover:bg-oso-200 transition-colors">
                  Marcar cumplida
                </button>
              )}
              <button onClick={onEliminar}
                className="px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 rounded-lg transition-colors ml-auto">
                {c ? 'Cancelar cita' : 'Eliminar bloqueo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
