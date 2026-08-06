// src/pages/Citas.tsx — Agenda de citas por persona
//
// Es la contraparte de Agenda.tsx para negocios de servicios (Siwapa).
// La diferencia de fondo: acá una cita no es un momento sino un BLOQUE que
// ocupa a una persona durante horas. Por eso la vista es un día con una
// columna por empleada, no un mes con franjas.
//
// Dos pestañas:
//   Día     — quién atiende a quién y a qué hora
//   Equipo  — las personas, su plantilla semanal y las excepciones por fecha
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Empleado = {
  id: string
  restaurante_id: string
  nombre: string
  telefono: string | null
  color: string | null
  orden: number | null
  activo: boolean
}

type HorarioPlantilla = {
  id: string
  empleado_id: string
  dia_semana: number
  hora_desde: string
  hora_hasta: string
  activo: boolean
}

type Excepcion = {
  id: string
  empleado_id: string
  fecha: string
  hora_desde: string | null
  hora_hasta: string | null
  trabaja: boolean
  nota: string | null
}

type Servicio = { id: string; nombre: string; duracion_minutos: number; precio_desde: number | null }

type NuevaCita = {
  empleadoId: string
  empleadoNombre: string
  hora: string          // HH:MM del bloque donde se hizo clic
  servicioId: string
  nombre: string
  telefono: string
  notas: string
}

type CitaServicio = {
  id: string
  fecha: string
  hora: string | null
  hora_fin: string | null
  duracion_minutos: number | null
  estado: string
  notas: string | null
  empleado_id: string | null
  plato_id: string | null
  pedido_id: string | null
  platos: { nombre: string } | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  origen: string | null
  pedidos: {
    numero_pedido: string
    total: number
    estado: string
    clientes: { nombre: string | null; telefono: string } | null
  } | null
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const ALTO_HORA = 64          // px por hora en la grilla
const PASO_GRILLA = 30        // minutos por línea

function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}
function aMinutos(hhmm?: string | null) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m || 0)
}
function aHHMM(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function ampm(hhmm?: string | null) {
  const min = aMinutos(hhmm)
  if (min === null) return '—'
  const h = Math.floor(min / 60), m = min % 60
  if (h === 12 && m === 0) return '12:00 m.'
  const suf = h < 12 ? 'a.m.' : 'p.m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}
function fechaLarga(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota',
  })
}
function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

export default function Citas({ session }: { session: Session }) {
  const [tab, setTab] = useState<'dia' | 'equipo'>('dia')
  const [esDueno, setEsDueno] = useState(false)
  const [restauranteId, setRestauranteId] = useState<string | null>(null)
  const [miEmpleadoId, setMiEmpleadoId] = useState<string | null>(null)

  const [fecha, setFecha] = useState(hoyISO())
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [plantilla, setPlantilla] = useState<HorarioPlantilla[]>([])
  const [excepciones, setExcepciones] = useState<Excepcion[]>([])
  const [citas, setCitas] = useState<CitaServicio[]>([])
  const [horarioSalon, setHorarioSalon] = useState<{ abre: number; cierra: number }>({ abre: 8 * 60, cierra: 18 * 60 })
  // El salón cierra domingos y festivos; eso no depende de cada persona.
  // Sin mostrarlo, la dueña marcaba "no vengo" en días donde igual no se abre.
  const [festivos, setFestivos] = useState<Record<string, string>>({})
  const [diasCerrados, setDiasCerrados] = useState<Set<number>>(new Set())
  const [abreFestivos, setAbreFestivos] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [citaSel, setCitaSel] = useState<CitaServicio | null>(null)
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [nueva, setNueva] = useState<NuevaCita | null>(null)
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // ── Identidad y restaurante ──────────────────────────────
  useEffect(() => {
    (async () => {
      const u = await supabase.from('usuarios_panel').select('rol').eq('user_id', session.user.id).single()
      setEsDueno(u.data?.rol === 'dueno')
      // Antes se deducía leyendo cualquier categoría y confiando en que RLS
      // devolviera la del negocio correcto. Funciona, pero es indirecto y se
      // rompe si el negocio no tiene categorías. mi_restaurante_id() lo dice
      // directo, y es la misma fuente que aplican las políticas.
      const r = await supabase.rpc('mi_restaurante_id')
      if (r.data) setRestauranteId(r.data as string)
      const e = await supabase.from('empleados').select('id').eq('usuario_id', session.user.id).maybeSingle()
      if (e.data?.id) setMiEmpleadoId(e.data.id as string)
      const sv = await supabase.rpc('servicios_agendables')
      setServicios((sv.data ?? []) as Servicio[])
    })()
  }, [session.user.id])

  // ── Datos del día ────────────────────────────────────────
  async function cargar() {
    setCargando(true)
    const dow = new Date(`${fecha}T12:00:00`).getDay()

    const [emp, pla, exc, cit, hor, fes, sem, cfg] = await Promise.all([
      supabase.from('empleados').select('*').eq('activo', true).order('orden').order('nombre'),
      supabase.from('empleado_horarios').select('*'),
      supabase.from('empleado_disponibilidad').select('*')
        .gte('fecha', sumarDias(fecha, -7)).lte('fecha', sumarDias(fecha, 21)),
      supabase.from('citas')
        .select('id, fecha, hora, hora_fin, duracion_minutos, estado, notas, empleado_id, plato_id, pedido_id, cliente_nombre, cliente_telefono, origen, platos(nombre), pedidos(numero_pedido, total, estado, clientes(nombre, telefono))')
        .eq('fecha', fecha),
      supabase.from('horarios_restaurante').select('dia_semana, hora_apertura, hora_cierre, cerrado').eq('dia_semana', dow).maybeSingle(),
      supabase.from('festivos_colombia').select('fecha, nombre')
        .gte('fecha', hoyISO()).lte('fecha', sumarDias(hoyISO(), 120)).order('fecha'),
      supabase.from('horarios_restaurante').select('dia_semana, cerrado'),
      supabase.from('restaurantes').select('abre_festivos').maybeSingle(),
    ])

    setEmpleados((emp.data ?? []) as Empleado[])
    setPlantilla((pla.data ?? []) as HorarioPlantilla[])
    setExcepciones((exc.data ?? []) as Excepcion[])
    setCitas(((cit.data ?? []) as unknown as CitaServicio[])
      .filter(c => c.estado !== 'cancelada'))

    setFestivos(Object.fromEntries(((fes.data ?? []) as any[]).map(f => [f.fecha, f.nombre])))
    setDiasCerrados(new Set(((sem.data ?? []) as any[]).filter(d => d.cerrado).map(d => d.dia_semana)))
    setAbreFestivos((cfg.data as any)?.abre_festivos === true)

    const h = hor.data as any
    if (h && !h.cerrado) {
      setHorarioSalon({
        abre: aMinutos(h.hora_apertura) ?? 8 * 60,
        cierra: aMinutos(h.hora_cierre) ?? 18 * 60,
      })
    }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [fecha])

  // ── Ventanas reales de cada persona en la fecha vista ────
  // Misma regla que empleado_ventanas en la base: si declaró algo para esa
  // fecha, manda eso; si no, la plantilla semanal.
  const ventanasDelDia = useMemo(() => {
    const dow = new Date(`${fecha}T12:00:00`).getDay()
    const mapa: Record<string, { desde: number; hasta: number }[]> = {}
    for (const e of empleados) {
      const decl = excepciones.filter(x => x.empleado_id === e.id && x.fecha === fecha)
      if (decl.length > 0) {
        mapa[e.id] = decl
          .filter(x => x.trabaja && x.hora_desde && x.hora_hasta)
          .map(x => ({ desde: aMinutos(x.hora_desde)!, hasta: aMinutos(x.hora_hasta)! }))
      } else {
        mapa[e.id] = plantilla
          .filter(x => x.empleado_id === e.id && x.dia_semana === dow && x.activo)
          .map(x => ({ desde: aMinutos(x.hora_desde)!, hasta: aMinutos(x.hora_hasta)! }))
      }
    }
    return mapa
  }, [empleados, plantilla, excepciones, fecha])

  const lineas = useMemo(() => {
    const out: number[] = []
    for (let m = horarioSalon.abre; m <= horarioSalon.cierra; m += PASO_GRILLA) out.push(m)
    return out
  }, [horarioSalon])

  const altoTotal = ((horarioSalon.cierra - horarioSalon.abre) / 60) * ALTO_HORA

  // Agendar a mano: la clienta que llamó, la que llegó al salón, la de
  // Instagram. La RPC respeta el choque de horarios pero NO la anticipación
  // de 24 h ni el margen de walk-ins: esos son frenos para el bot, no para
  // quien conoce su salón.
  async function guardarNueva() {
    if (!nueva) return
    if (!nueva.servicioId) { alert('Elegí el servicio.'); return }
    setCreando(true)
    const { data, error } = await supabase.rpc('crear_cita_manual', {
      p_empleado_id: nueva.empleadoId,
      p_plato_id: nueva.servicioId,
      p_fecha: fecha,
      p_hora: nueva.hora,
      p_cliente_nombre: nueva.nombre || null,
      p_cliente_telefono: nueva.telefono || null,
      p_notas: nueva.notas || null,
    })
    setCreando(false)
    if (error) { alert('Error: ' + error.message); return }
    const r = data as any
    if (r?.ok !== true) { alert(r?.mensaje ?? 'No se pudo agendar.'); return }
    setNueva(null)
    cargar()
  }

  async function cancelarCita(id: string) {
    if (!confirm('¿Cancelar esta cita? El horario vuelve a quedar libre.')) return
    await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', id)
    setCitaSel(null)
    cargar()
  }

  // ── Plantilla semanal ────────────────────────────────────
  // Un día puede tener VARIAS franjas: mañana y tarde, o el que entra a
  // mediodía. La tabla siempre lo soportó (una fila por franja); era la
  // pantalla la que asumía una sola.
  function franjasDe(empId: string, dia: number) {
    return plantilla
      .filter(p => p.empleado_id === empId && p.dia_semana === dia && p.activo)
      .sort((a, b) => a.hora_desde.localeCompare(b.hora_desde))
  }

  async function agregarFranja(empId: string, dia: number) {
    setGuardando(true)
    const previas = franjasDe(empId, dia)
    // La segunda franja arranca donde suele arrancar la tarde
    const desde = previas.length === 0 ? '08:00' : '14:00'
    const hasta = previas.length === 0 ? '12:00' : '18:00'
    await supabase.from('empleado_horarios')
      .insert({ empleado_id: empId, dia_semana: dia, hora_desde: desde, hora_hasta: hasta, activo: true })
    setGuardando(false)
    cargar()
  }

  async function actualizarFranja(id: string, campo: 'hora_desde' | 'hora_hasta', valor: string) {
    if (!valor) return
    setGuardando(true)
    await supabase.from('empleado_horarios').update({ [campo]: valor }).eq('id', id)
    setGuardando(false)
    cargar()
  }

  async function quitarFranja(id: string) {
    setGuardando(true)
    await supabase.from('empleado_horarios').delete().eq('id', id)
    setGuardando(false)
    cargar()
  }

  // Los días en que el salón abre. Copiar a un domingo cerrado no sirve
  // de nada, así que las copias solo alcanzan a estos.
  const diasAbiertos = [1, 2, 3, 4, 5, 6, 0].filter(d => !diasCerrados.has(d))

  // Copiar el horario de un día a los demás días de esa persona.
  async function copiarDiaATodos(empId: string, dia: number) {
    const origen = franjasDe(empId, dia)
    if (origen.length === 0) return
    if (!confirm(`¿Poner este mismo horario en los demás días? Reemplaza lo que tengan.`)) return

    setGuardando(true)
    const otros = diasAbiertos.filter(d => d !== dia)
    await supabase.from('empleado_horarios')
      .delete().eq('empleado_id', empId).in('dia_semana', otros)
    await supabase.from('empleado_horarios').insert(
      otros.flatMap(d => origen.map(f => ({
        empleado_id: empId, dia_semana: d,
        hora_desde: f.hora_desde, hora_hasta: f.hora_hasta, activo: true,
      }))))
    setGuardando(false)
    cargar()
  }

  // Copiar la semana completa de una persona al resto del equipo. Es el que
  // más tiempo ahorra: cuatro personas con el mismo horario base son cuatro
  // veces el mismo trabajo hecho a mano.
  async function copiarPersonaATodos(empId: string) {
    const mias = plantilla.filter(p => p.empleado_id === empId && p.activo)
    const otros = empleados.filter(e => e.id !== empId)
    if (otros.length === 0) return
    const nombre = empleados.find(e => e.id === empId)?.nombre ?? ''
    if (!confirm(
      `¿Copiar el horario de ${nombre} a las otras ${otros.length} personas?\n\n` +
      `Se reemplaza el horario que tengan. Las excepciones por fecha no se tocan.`)) return

    setGuardando(true)
    const ids = otros.map(e => e.id)
    await supabase.from('empleado_horarios').delete().in('empleado_id', ids)
    if (mias.length > 0) {
      await supabase.from('empleado_horarios').insert(
        ids.flatMap(id => mias.map(f => ({
          empleado_id: id, dia_semana: f.dia_semana,
          hora_desde: f.hora_desde, hora_hasta: f.hora_hasta, activo: true,
        }))))
    }
    setGuardando(false)
    cargar()
  }

  // Prender el día crea la primera franja; apagarlo borra todas las suyas.
  async function alternarDia(empId: string, dia: number, prender: boolean) {
    if (prender) return agregarFranja(empId, dia)
    setGuardando(true)
    await supabase.from('empleado_horarios')
      .delete().eq('empleado_id', empId).eq('dia_semana', dia)
    setGuardando(false)
    cargar()
  }

  async function marcarNoViene(empId: string, f: string) {
    const ex = excepciones.find(x => x.empleado_id === empId && x.fecha === f)
    if (ex) await supabase.from('empleado_disponibilidad').delete().eq('id', ex.id)
    else await supabase.from('empleado_disponibilidad')
      .insert({ empleado_id: empId, fecha: f, trabaja: false })
    cargar()
  }

  const puedeEditarA = (empId: string) => esDueno || miEmpleadoId === empId

  // ══════════════════════════════════════════════════════════
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Citas</h1>
        <p className="text-mute text-sm">
          {citas.length === 0
            ? 'No hay citas agendadas para este día'
            : `${citas.length} cita${citas.length === 1 ? '' : 's'} el ${fechaLarga(fecha)}`}
        </p>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {([['dia', 'Día'], ['equipo', 'Equipo']] as const).map(([v, label]) => (
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

      {/* ══════════ DÍA ══════════ */}
      {tab === 'dia' && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button onClick={() => setFecha(sumarDias(fecha, -1))}
              className="px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm">←</button>
            <button onClick={() => setFecha(hoyISO())}
              className="px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm">Hoy</button>
            <button onClick={() => setFecha(sumarDias(fecha, 1))}
              className="px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm">→</button>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-oso-200 text-sm" />
            <span className="text-mute text-sm capitalize ml-1">{fechaLarga(fecha)}</span>
            {esDueno && (
              <span className="text-[11px] text-mute ml-auto">
                Clic en un hueco para agendar
              </span>
            )}
          </div>

          {cargando ? (
            <p className="text-mute text-sm">Cargando…</p>
          ) : empleados.length === 0 ? (
            <div className="rounded-xl border border-oso-200 p-8 text-center">
              <p className="text-sm text-mute mb-3">Todavía no hay nadie en el equipo.</p>
              <button onClick={() => setTab('equipo')}
                className="px-4 py-1.5 rounded-full bg-oso-800 text-white text-sm">Agregar personas</button>
            </div>
          ) : (
            <div className="rounded-xl border border-oso-200 overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Cabecera con las personas */}
                <div className="flex border-b border-oso-200 bg-oso-50">
                  <div className="w-16 shrink-0" />
                  {empleados.map(e => (
                    <div key={e.id} className="flex-1 px-2 py-2 text-center">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                        <span className="w-2.5 h-2.5 rounded-full"
                          style={{ background: e.color ?? '#999' }} />
                        {e.nombre}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Grilla */}
                <div className="flex relative" style={{ height: altoTotal }}>
                  {/* Horas */}
                  <div className="w-16 shrink-0 relative border-r border-oso-200">
                    {lineas.map(m => (
                      <div key={m} className="absolute left-0 right-0 text-[11px] text-mute pr-2 text-right -translate-y-1/2"
                        style={{ top: ((m - horarioSalon.abre) / 60) * ALTO_HORA }}>
                        {m % 60 === 0 ? ampm(aHHMM(m)) : ''}
                      </div>
                    ))}
                  </div>

                  {/* Una columna por persona */}
                  {empleados.map(e => {
                    const vents = ventanasDelDia[e.id] ?? []
                    const suyas = citas.filter(c => c.empleado_id === e.id)
                    // Clic en un hueco de la columna: agenda a esa persona a
                    // esa hora. Redondea a la media hora más cercana hacia
                    // abajo, que es como piensa quien mira el calendario.
                    const clicEnHueco = (ev: React.MouseEvent<HTMLDivElement>) => {
                      if (!esDueno) return
                      const caja = ev.currentTarget.getBoundingClientRect()
                      const min = horarioSalon.abre
                        + Math.floor(((ev.clientY - caja.top) / ALTO_HORA) * 60 / PASO_GRILLA) * PASO_GRILLA
                      if (min < horarioSalon.abre || min >= horarioSalon.cierra) return
                      setNueva({
                        empleadoId: e.id, empleadoNombre: e.nombre,
                        hora: aHHMM(min),
                        servicioId: servicios[0]?.id ?? '',
                        nombre: '', telefono: '', notas: '',
                      })
                    }
                    return (
                      <div key={e.id}
                        onClick={clicEnHueco}
                        title={esDueno ? `Clic para agendar a ${e.nombre}` : undefined}
                        className={`flex-1 relative border-r border-oso-100 last:border-r-0 ${esDueno ? 'cursor-copy' : ''}`}>
                        {/* Fuera de su horario: rayado suave */}
                        {vents.length === 0 ? (
                          <div className="absolute inset-0 bg-oso-50/70 grid place-items-center">
                            <span className="text-[11px] text-mute">No trabaja</span>
                          </div>
                        ) : (
                          <>
                            <div className="absolute inset-0 bg-oso-50/70" />
                            {vents.map((v, i) => (
                              <div key={i} className="absolute left-0 right-0 bg-white"
                                style={{
                                  top: ((v.desde - horarioSalon.abre) / 60) * ALTO_HORA,
                                  height: ((v.hasta - v.desde) / 60) * ALTO_HORA,
                                }} />
                            ))}
                          </>
                        )}

                        {/* Líneas de media hora */}
                        {lineas.map(m => (
                          <div key={m} className="absolute left-0 right-0 border-t border-oso-100"
                            style={{ top: ((m - horarioSalon.abre) / 60) * ALTO_HORA }} />
                        ))}

                        {/* Las citas */}
                        {suyas.map(c => {
                          const ini = aMinutos(c.hora)
                          if (ini === null) return null
                          const fin = aMinutos(c.hora_fin) ?? ini + (c.duracion_minutos ?? 60)
                          return (
                            <button key={c.id} onClick={ev => { ev.stopPropagation(); setCitaSel(c) }}
                              className="absolute left-1 right-1 rounded-lg px-2 py-1 text-left text-white text-[11px] leading-tight shadow-sm overflow-hidden hover:brightness-110 transition"
                              style={{
                                top: ((ini - horarioSalon.abre) / 60) * ALTO_HORA + 1,
                                height: Math.max(((fin - ini) / 60) * ALTO_HORA - 2, 22),
                                background: e.color ?? '#8a6a6a',
                              }}>
                              <div className="font-medium truncate">
                                {c.cliente_nombre ?? c.pedidos?.clientes?.nombre
                                  ?? c.cliente_telefono ?? c.pedidos?.clientes?.telefono ?? 'Clienta'}
                              </div>
                              <div className="opacity-90 truncate">{c.platos?.nombre ?? 'Servicio'}</div>
                              <div className="opacity-75">{ampm(c.hora)} – {ampm(c.hora_fin)}</div>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ EQUIPO ══════════ */}
      {tab === 'equipo' && (
        <div className="space-y-4">
          <p className="text-mute text-sm">
            La plantilla es el horario de siempre. Lo que se marque en una fecha puntual
            manda sobre ella ese día.
          </p>

          {empleados.map(e => {
            const editable = puedeEditarA(e.id)
            return (
              <div key={e.id} className="rounded-xl border border-oso-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full" style={{ background: e.color ?? '#999' }} />
                  <h3 className="font-medium">{e.nombre}</h3>
                  {!editable && <span className="text-[11px] text-mute">(solo lectura)</span>}
                  {esDueno && empleados.length > 1 && (
                    <button onClick={() => copiarPersonaATodos(e.id)}
                      disabled={guardando}
                      className="ml-auto text-[11px] px-2 py-1 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 transition-colors">
                      Copiar esta semana a todo el equipo
                    </button>
                  )}
                </div>

                {/* Plantilla semanal */}
                <div className="space-y-1.5">
                  {[1, 2, 3, 4, 5, 6, 0].map(dia => {
                    const franjas = franjasDe(e.id, dia)
                    const on = franjas.length > 0
                    return (
                      <div key={dia} className="flex items-start gap-2 text-sm">
                        <label className="flex items-center gap-2 w-28 shrink-0 pt-1">
                          <input type="checkbox" checked={on} disabled={!editable || guardando}
                            onChange={ev => alternarDia(e.id, dia, ev.target.checked)} />
                          <span className={on ? '' : 'text-mute'}>{DIAS[dia]}</span>
                        </label>

                        <div className="flex-1 min-w-0 space-y-1">
                          {franjas.map(f => (
                            <div key={f.id} className="flex items-center gap-1.5">
                              <input type="time" defaultValue={f.hora_desde.slice(0, 5)}
                                disabled={!editable}
                                onBlur={ev => actualizarFranja(f.id, 'hora_desde', ev.target.value)}
                                className="px-2 py-1 rounded border border-oso-200 text-sm" />
                              <span className="text-mute">a</span>
                              <input type="time" defaultValue={f.hora_hasta.slice(0, 5)}
                                disabled={!editable}
                                onBlur={ev => actualizarFranja(f.id, 'hora_hasta', ev.target.value)}
                                className="px-2 py-1 rounded border border-oso-200 text-sm" />
                              {editable && franjas.length > 1 && (
                                <button onClick={() => quitarFranja(f.id)}
                                  className="text-mute hover:text-red-600 text-xs px-1"
                                  aria-label="Quitar franja">✕</button>
                              )}
                            </div>
                          ))}

                          {/* Doble jornada: la que corta a mediodía, o la que
                              entra en la tarde. Cada franja es una fila propia. */}
                          {on && editable && (
                            <div className="flex gap-3">
                              {franjas.length < 3 && (
                                <button onClick={() => agregarFranja(e.id, dia)}
                                  disabled={guardando}
                                  className="text-[11px] text-oso-700 hover:text-oso-900 underline decoration-dotted">
                                  + otra franja
                                </button>
                              )}
                              <button onClick={() => copiarDiaATodos(e.id, dia)}
                                disabled={guardando}
                                className="text-[11px] text-mute hover:text-ink underline decoration-dotted">
                                copiar a los demás días
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Excepciones de las próximas 3 semanas */}
                <div className="mt-4 pt-3 border-t border-oso-100">
                  <p className="text-[11px] text-mute mb-2">
                    Marcá los días que NO vas a venir. Los días en que el salón
                    no abre ya vienen bloqueados.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 21 }, (_, i) => sumarDias(hoyISO(), i)).map(f => {
                      const falta = excepciones.some(x => x.empleado_id === e.id && x.fecha === f && !x.trabaja)
                      const d = new Date(`${f}T12:00:00`)
                      const esFestivo = !!festivos[f]
                      // El salón manda: si ese día no abre, no tiene sentido
                      // que alguien marque si viene o no.
                      const salonCerrado = diasCerrados.has(d.getDay()) || (esFestivo && !abreFestivos)
                      const sinFranjas = franjasDe(e.id, d.getDay()).length === 0

                      const clase = salonCerrado
                        ? 'bg-canvas text-mute/60 border border-dashed border-line cursor-not-allowed'
                        : falta
                          ? 'bg-red-100 text-red-700 line-through'
                          : sinFranjas
                            ? 'bg-canvas text-mute border border-line'
                            : esFestivo
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-oso-100 text-oso-800 hover:bg-oso-200'

                      const titulo = salonCerrado
                        ? (esFestivo ? `${festivos[f]} — el salón no abre` : 'El salón no abre este día')
                        : esFestivo
                          ? `${festivos[f]} — el salón sí abre${falta ? ' · no viene' : ''}`
                          : sinFranjas
                            ? 'No trabaja este día según la plantilla'
                            : falta ? 'No viene' : 'Marcar que no viene'

                      return (
                        <button key={f}
                          disabled={!editable || salonCerrado}
                          onClick={() => marcarNoViene(e.id, f)}
                          className={`px-2 py-1 rounded-lg text-[11px] transition-colors disabled:opacity-60 ${clase}`}
                          title={titulo}>
                          {DIAS_CORTO[d.getDay()]} {d.getDate()}
                          {esFestivo && <span className="ml-0.5">★</span>}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-mute mt-2">
                    ★ festivo · punteado = el salón no abre · rojo = no viene
                  </p>
                </div>

                {/* ── Festivos ──────────────────────────────────────
                    Van aparte de la tira porque llegan más lejos: el
                    próximo puede caer en dos meses y ahí no se ve. Y
                    porque en un festivo la pregunta es otra: no "¿venís
                    ese día?" sino "¿de los que abrimos, en cuáles estás?". */}
                <div className="mt-4 pt-3 border-t border-oso-100">
                  <p className="text-[11px] text-mute mb-2">
                    Festivos de los próximos meses
                  </p>
                  {!abreFestivos ? (
                    <p className="text-[11px] text-mute">
                      El salón no abre los festivos. Se cambia en Logística → Horarios.
                    </p>
                  ) : Object.keys(festivos).length === 0 ? (
                    <p className="text-[11px] text-mute">No hay festivos próximos.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(festivos).slice(0, 8).map(([f, nombreFestivo]) => {
                        const falta = excepciones.some(x => x.empleado_id === e.id && x.fecha === f && !x.trabaja)
                        const d = new Date(`${f}T12:00:00`)
                        return (
                          <button key={f} disabled={!editable}
                            onClick={() => marcarNoViene(e.id, f)}
                            title={`${nombreFestivo}${falta ? ' — no viene' : ' — sí viene'}`}
                            className={`px-2 py-1 rounded-lg text-[11px] transition-colors disabled:opacity-60 ${
                              falta
                                ? 'bg-red-100 text-red-700 line-through'
                                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            }`}>
                            ★ {DIAS_CORTO[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {esDueno && (
            <p className="text-[11px] text-mute">
              Para agregar o desactivar personas, andá a Usuarios.
            </p>
          )}
        </div>
      )}

      {/* ══════════ Agendar a mano ══════════ */}
      {nueva && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"
          onClick={() => setNueva(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3"
            onClick={ev => ev.stopPropagation()}>
            <div>
              <h3 className="font-display text-xl font-semibold">Agendar cita</h3>
              <p className="text-sm text-mute capitalize">
                {nueva.empleadoNombre} · {fechaLarga(fecha)} · {ampm(nueva.hora)}
              </p>
            </div>

            {servicios.length === 0 ? (
              <p className="text-sm text-mute">
                No hay servicios con duración cargada. Ponéles la duración en Servicios
                para poder agendarlos.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-mute">Servicio</span>
                  <select value={nueva.servicioId}
                    onChange={ev => setNueva({ ...nueva, servicioId: ev.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg border border-oso-200 text-sm">
                    {servicios.map(sv => (
                      <option key={sv.id} value={sv.id}>
                        {sv.nombre} ({Math.round(sv.duracion_minutos / 6) / 10} h)
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex gap-2">
                  <label className="flex-1">
                    <span className="text-[11px] uppercase tracking-wide text-mute">Hora</span>
                    <input type="time" value={nueva.hora}
                      onChange={ev => setNueva({ ...nueva, hora: ev.target.value })}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg border border-oso-200 text-sm" />
                  </label>
                  <label className="flex-1">
                    <span className="text-[11px] uppercase tracking-wide text-mute">Clienta</span>
                    <input value={nueva.nombre} placeholder="Nombre"
                      onChange={ev => setNueva({ ...nueva, nombre: ev.target.value })}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg border border-oso-200 text-sm" />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-mute">
                    Teléfono (opcional)
                  </span>
                  <input value={nueva.telefono} placeholder="3001234567"
                    onChange={ev => setNueva({ ...nueva, telefono: ev.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg border border-oso-200 text-sm" />
                </label>

                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-mute">Notas</span>
                  <input value={nueva.notas} placeholder="cabello largo, teñido…"
                    onChange={ev => setNueva({ ...nueva, notas: ev.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg border border-oso-200 text-sm" />
                </label>
              </>
            )}

            <div className="flex gap-2 pt-1">
              {servicios.length > 0 && (
                <button onClick={guardarNueva} disabled={creando}
                  className="px-4 py-1.5 rounded-lg bg-oso-800 text-white text-sm disabled:opacity-50">
                  {creando ? 'Agendando…' : 'Agendar'}
                </button>
              )}
              <button onClick={() => setNueva(null)}
                className="px-4 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm ml-auto">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ Detalle de una cita ══════════ */}
      {citaSel && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"
          onClick={() => setCitaSel(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3"
            onClick={ev => ev.stopPropagation()}>
            <h3 className="font-display text-xl font-semibold">
              {citaSel.platos?.nombre ?? 'Servicio'}
            </h3>
            <div className="text-sm space-y-1">
              <p><span className="text-mute">Cliente:</span>{' '}
                {citaSel.cliente_nombre ?? citaSel.pedidos?.clientes?.nombre ?? '—'}{' '}
                <span className="text-mute">
                  {citaSel.cliente_telefono ?? citaSel.pedidos?.clientes?.telefono ?? ''}
                </span>
                {citaSel.origen === 'panel' && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-oso-100 text-oso-800">
                    agendada a mano
                  </span>
                )}</p>
              <p><span className="text-mute">Horario:</span>{' '}
                {ampm(citaSel.hora)} – {ampm(citaSel.hora_fin)}
                {citaSel.duracion_minutos ? ` (${Math.round(citaSel.duracion_minutos / 6) / 10} h)` : ''}</p>
              <p><span className="text-mute">Atiende:</span>{' '}
                {empleados.find(e => e.id === citaSel.empleado_id)?.nombre ?? '—'}</p>
              {citaSel.pedidos?.numero_pedido && (
                <p><span className="text-mute">Pedido:</span> {citaSel.pedidos.numero_pedido}</p>
              )}
              {citaSel.notas && (
                <p><span className="text-mute">Notas:</span> {citaSel.notas}</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              {esDueno && (
                <button onClick={() => cancelarCita(citaSel.id)}
                  className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-sm">
                  Cancelar cita
                </button>
              )}
              <button onClick={() => setCitaSel(null)}
                className="px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm ml-auto">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
