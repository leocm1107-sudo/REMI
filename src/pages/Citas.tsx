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
  const [cargando, setCargando] = useState(true)
  const [citaSel, setCitaSel] = useState<CitaServicio | null>(null)
  const [guardando, setGuardando] = useState(false)

  // ── Identidad y restaurante ──────────────────────────────
  useEffect(() => {
    (async () => {
      const u = await supabase.from('usuarios_panel').select('rol').eq('user_id', session.user.id).single()
      setEsDueno(u.data?.rol === 'dueno')
      const r = await supabase.from('categorias').select('restaurante_id').limit(1).maybeSingle()
      if (r.data?.restaurante_id) setRestauranteId(r.data.restaurante_id as string)
      const e = await supabase.from('empleados').select('id').eq('usuario_id', session.user.id).maybeSingle()
      if (e.data?.id) setMiEmpleadoId(e.data.id as string)
    })()
  }, [session.user.id])

  // ── Datos del día ────────────────────────────────────────
  async function cargar() {
    setCargando(true)
    const dow = new Date(`${fecha}T12:00:00`).getDay()

    const [emp, pla, exc, cit, hor] = await Promise.all([
      supabase.from('empleados').select('*').eq('activo', true).order('orden').order('nombre'),
      supabase.from('empleado_horarios').select('*'),
      supabase.from('empleado_disponibilidad').select('*')
        .gte('fecha', sumarDias(fecha, -7)).lte('fecha', sumarDias(fecha, 21)),
      supabase.from('citas')
        .select('id, fecha, hora, hora_fin, duracion_minutos, estado, notas, empleado_id, plato_id, pedido_id, platos(nombre), pedidos(numero_pedido, total, estado, clientes(nombre, telefono))')
        .eq('fecha', fecha),
      supabase.from('horarios_restaurante').select('dia_semana, hora_apertura, hora_cierre, cerrado').eq('dia_semana', dow).maybeSingle(),
    ])

    setEmpleados((emp.data ?? []) as Empleado[])
    setPlantilla((pla.data ?? []) as HorarioPlantilla[])
    setExcepciones((exc.data ?? []) as Excepcion[])
    setCitas(((cit.data ?? []) as unknown as CitaServicio[])
      .filter(c => c.estado !== 'cancelada'))

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

  async function cancelarCita(id: string) {
    if (!confirm('¿Cancelar esta cita? El horario vuelve a quedar libre.')) return
    await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', id)
    setCitaSel(null)
    cargar()
  }

  // ── Plantilla semanal ────────────────────────────────────
  async function guardarPlantilla(empId: string, dia: number, activo: boolean, desde: string, hasta: string) {
    setGuardando(true)
    const ex = plantilla.find(p => p.empleado_id === empId && p.dia_semana === dia)
    if (ex) {
      await supabase.from('empleado_horarios')
        .update({ activo, hora_desde: desde, hora_hasta: hasta }).eq('id', ex.id)
    } else if (activo) {
      await supabase.from('empleado_horarios')
        .insert({ empleado_id: empId, dia_semana: dia, hora_desde: desde, hora_hasta: hasta, activo: true })
    }
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
                    return (
                      <div key={e.id} className="flex-1 relative border-r border-oso-100 last:border-r-0">
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
                            <button key={c.id} onClick={() => setCitaSel(c)}
                              className="absolute left-1 right-1 rounded-lg px-2 py-1 text-left text-white text-[11px] leading-tight shadow-sm overflow-hidden hover:brightness-110 transition"
                              style={{
                                top: ((ini - horarioSalon.abre) / 60) * ALTO_HORA + 1,
                                height: Math.max(((fin - ini) / 60) * ALTO_HORA - 2, 22),
                                background: e.color ?? '#8a6a6a',
                              }}>
                              <div className="font-medium truncate">
                                {c.pedidos?.clientes?.nombre ?? c.pedidos?.clientes?.telefono ?? 'Cliente'}
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
                </div>

                {/* Plantilla semanal */}
                <div className="space-y-1.5">
                  {[1, 2, 3, 4, 5, 6, 0].map(dia => {
                    const p = plantilla.find(x => x.empleado_id === e.id && x.dia_semana === dia)
                    const on = !!p?.activo
                    return (
                      <div key={dia} className="flex items-center gap-2 text-sm">
                        <label className="flex items-center gap-2 w-28 shrink-0">
                          <input type="checkbox" checked={on} disabled={!editable || guardando}
                            onChange={ev => guardarPlantilla(
                              e.id, dia, ev.target.checked,
                              p?.hora_desde ?? '08:00', p?.hora_hasta ?? '18:00')} />
                          <span className={on ? '' : 'text-mute'}>{DIAS[dia]}</span>
                        </label>
                        {on && (
                          <>
                            <input type="time" defaultValue={(p?.hora_desde ?? '08:00').slice(0, 5)}
                              disabled={!editable}
                              onBlur={ev => guardarPlantilla(e.id, dia, true, ev.target.value, p?.hora_hasta ?? '18:00')}
                              className="px-2 py-1 rounded border border-oso-200 text-sm" />
                            <span className="text-mute">a</span>
                            <input type="time" defaultValue={(p?.hora_hasta ?? '18:00').slice(0, 5)}
                              disabled={!editable}
                              onBlur={ev => guardarPlantilla(e.id, dia, true, p?.hora_desde ?? '08:00', ev.target.value)}
                              className="px-2 py-1 rounded border border-oso-200 text-sm" />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Excepciones de los próximos 14 días */}
                <div className="mt-4 pt-3 border-t border-oso-100">
                  <p className="text-[11px] text-mute mb-2">
                    Marcá los días que NO vas a venir en las próximas dos semanas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 14 }, (_, i) => sumarDias(hoyISO(), i)).map(f => {
                      const falta = excepciones.some(x => x.empleado_id === e.id && x.fecha === f && !x.trabaja)
                      const d = new Date(`${f}T12:00:00`)
                      return (
                        <button key={f} disabled={!editable}
                          onClick={() => marcarNoViene(e.id, f)}
                          className={`px-2 py-1 rounded-lg text-[11px] transition-colors ${
                            falta ? 'bg-red-100 text-red-700 line-through' : 'bg-oso-100 text-oso-800 hover:bg-oso-200'
                          } disabled:opacity-40`}
                          title={falta ? 'No viene' : 'Marcar que no viene'}>
                          {DIAS_CORTO[d.getDay()]} {d.getDate()}
                        </button>
                      )
                    })}
                  </div>
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
                {citaSel.pedidos?.clientes?.nombre ?? '—'}{' '}
                <span className="text-mute">{citaSel.pedidos?.clientes?.telefono ?? ''}</span></p>
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
