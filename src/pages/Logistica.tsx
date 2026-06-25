import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn, formatCOP } from '../lib/utils'
import type { PerfilUsuario } from '../lib/types'

type ColaItem = {
  id: string
  numero_pedido: string
  turno_dia: number
  estado: string
  estado_preapertura: string | null
  tipo_entrega: string
  total: number
  cliente_nombre: string | null
  cliente_telefono: string | null
  confirmado_preapertura_at: string | null
}

type RangoTiempo = {
  id: string
  tipo: string
  orden: number
  etiqueta: string
}

type ConfigRestaurante = {
  id: string
  minutos_antes_preguntar: number | null
  minutos_antes_jefe: number | null
  modo_notificacion: string | null
  rango_cocina_activo: number | null
  rango_domicilio_activo: number | null
}

// Horario por día
type DiaHorario = {
  dia_semana: number
  hora_apertura: string
  hora_cierre: string
  cerrado: boolean
}

// dia_semana: 0=domingo..6=sábado. Mostramos en orden Lun..Dom.
const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0]
const DIA_LABEL: Record<number, string> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves', 5: 'Viernes', 6: 'Sábado'
}

const PRE_INFO: Record<string, { label: string; chip: string }> = {
  pendiente_confirmacion: { label: 'Pendiente',  chip: 'bg-amber-100 text-amber-800 ring-amber-200' },
  confirmado:             { label: 'Confirmado', chip: 'bg-green-100 text-green-800 ring-green-200' },
  cancelado:              { label: 'Cancelado',  chip: 'bg-red-100 text-red-800 ring-red-200' }
}

function preInfo(estado: string | null) {
  return PRE_INFO[estado ?? ''] ?? { label: estado || '—', chip: 'bg-gray-100 text-gray-700 ring-gray-200' }
}

export default function Logistica({ session }: { session: Session }) {
  const [perfil, setPerfil]     = useState<PerfilUsuario | null>(null)
  const [cola, setCola]         = useState<ColaItem[]>([])
  const [rangos, setRangos]     = useState<RangoTiempo[]>([])
  const [config, setConfig]     = useState<ConfigRestaurante | null>(null)
  const [dias, setDias]         = useState<Record<number, DiaHorario>>({})
  const [guardandoHorario, setGuardandoHorario] = useState(false)
  const [horarioGuardado, setHorarioGuardado]   = useState(false)
  const [cargando, setCargando] = useState(true)
  const [restauranteId, setRestauranteId] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    async function cargar() {
      const u = await supabase
        .from('usuarios_panel')
        .select('nombre, rol, restaurante_id')
        .eq('user_id', session.user.id)
        .single()
      if (!activo) return
      if (u.data) {
        setPerfil({ nombre: (u.data as any).nombre, rol: (u.data as any).rol })
        const rid = (u.data as any).restaurante_id
        setRestauranteId(rid)

        const [cola, rangos, cfg, horario] = await Promise.all([
          supabase.from('v_cola_hoy').select('*'),
          supabase.from('config_tiempos').select('id, tipo, orden, etiqueta')
            .eq('restaurante_id', rid).order('tipo').order('orden'),
          supabase.from('restaurantes')
            .select('id, minutos_antes_preguntar, minutos_antes_jefe, modo_notificacion, rango_cocina_activo, rango_domicilio_activo')
            .eq('id', rid).single(),
          supabase.rpc('obtener_horarios_dia')
        ])
        if (!activo) return
        if (cola.data)   setCola(cola.data as ColaItem[])
        if (rangos.data) setRangos(rangos.data as RangoTiempo[])
        if (cfg.data)    setConfig(cfg.data as ConfigRestaurante)
        if (horario.data && (horario.data as any).dias) {
          const map: Record<number, DiaHorario> = {}
          ;((horario.data as any).dias as DiaHorario[]).forEach(d => {
            map[d.dia_semana] = {
              dia_semana: d.dia_semana,
              hora_apertura: d.hora_apertura ?? '17:00',
              hora_cierre: d.hora_cierre ?? '23:00',
              cerrado: d.cerrado
            }
          })
          setDias(map)
        }
      }
      setCargando(false)
    }
    cargar()
    return () => { activo = false }
  }, [session.user.id])

  useEffect(() => {
    const channel = supabase
      .channel('cola-live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        async () => {
          const { data } = await supabase.from('v_cola_hoy').select('*')
          if (data) setCola(data as ColaItem[])
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const esDueno = perfil?.rol === 'dueno'

  const rangosCocina    = useMemo(() => rangos.filter(r => r.tipo === 'cocina'), [rangos])
  const rangosDomicilio = useMemo(() => rangos.filter(r => r.tipo === 'domicilio'), [rangos])

  const pendientes = useMemo(
    () => cola.filter(c => c.estado_preapertura === 'pendiente_confirmacion'),
    [cola]
  )

  async function cambiarRango(tipo: 'cocina' | 'domicilio', orden: number) {
    if (!restauranteId) return
    setConfig(prev => prev ? {
      ...prev,
      ...(tipo === 'cocina'
        ? { rango_cocina_activo: orden }
        : { rango_domicilio_activo: orden })
    } : prev)

    const { error } = await supabase.rpc('cambiar_rango_tiempo', {
      p_restaurante_id: restauranteId,
      p_tipo: tipo,
      p_orden: orden
    })
    if (error) alert('No se pudo cambiar el rango: ' + error.message)
  }

  // ── Horario por día ──
  function toggleCerrado(dia: number) {
    setDias(prev => ({
      ...prev,
      [dia]: { ...prev[dia], cerrado: !prev[dia].cerrado }
    }))
  }
  function cambiarHora(dia: number, campo: 'hora_apertura' | 'hora_cierre', valor: string) {
    setDias(prev => ({
      ...prev,
      [dia]: { ...prev[dia], [campo]: valor }
    }))
  }
  function copiarATodos(dia: number) {
    const origen = dias[dia]
    setDias(prev => {
      const nuevo = { ...prev }
      DIAS_ORDEN.forEach(d => {
        if (!nuevo[d].cerrado) {
          nuevo[d] = { ...nuevo[d], hora_apertura: origen.hora_apertura, hora_cierre: origen.hora_cierre }
        }
      })
      return nuevo
    })
  }

  async function guardarHorario() {
    if (!restauranteId) return
    // Validar
    for (const d of DIAS_ORDEN) {
      const dia = dias[d]
      if (!dia.cerrado) {
        if (!dia.hora_apertura || !dia.hora_cierre) {
          alert(`Falta la hora en ${DIA_LABEL[d]}`)
          return
        }
        if (dia.hora_cierre <= dia.hora_apertura) {
          alert(`En ${DIA_LABEL[d]}, la hora de cierre debe ser mayor a la de apertura`)
          return
        }
      }
    }
    setGuardandoHorario(true)
    setHorarioGuardado(false)
    const payload = DIAS_ORDEN.map(d => ({
      dia_semana: d,
      hora_apertura: dias[d].hora_apertura,
      hora_cierre: dias[d].hora_cierre,
      cerrado: dias[d].cerrado
    }))
    const { error } = await supabase.rpc('guardar_horarios_dia', { p_dias: payload })
    setGuardandoHorario(false)
    if (error) {
      alert('No se pudo guardar el horario: ' + error.message)
    } else {
      setHorarioGuardado(true)
      setTimeout(() => setHorarioGuardado(false), 2500)
    }
  }

  async function resolverPedido(item: ColaItem, accion: 'confirmar' | 'cancelar') {
    const verbo = accion === 'confirmar' ? 'confirmar' : 'cancelar'
    if (!confirm(`¿${verbo} el pedido ${item.numero_pedido} (turno #${item.turno_dia})?`)) return

    const { error } = await supabase.rpc('confirmar_pedido_preapertura', {
      p_pedido_id: item.id,
      p_accion: accion
    })
    if (error) alert('Error: ' + error.message)
  }

  async function guardarConfig(campos: Partial<ConfigRestaurante>) {
    if (!restauranteId) return
    setConfig(prev => prev ? { ...prev, ...campos } : prev)
    const { error } = await supabase
      .from('restaurantes')
      .update(campos)
      .eq('id', restauranteId)
    if (error) alert('No se pudo guardar: ' + error.message)
  }

  if (cargando) {
    return <div className="text-center text-mute py-20 text-sm">Cargando logística…</div>
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Logística</h1>
        <p className="text-mute text-sm">
          Cola del día, tiempos de espera y configuración
        </p>
      </div>

      {/* ───────── ZONA 2: Tiempos estimados ───────── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-3">Tiempos de espera</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RangoGrupo
            titulo="🍳 Cocina"
            rangos={rangosCocina}
            activo={config?.rango_cocina_activo ?? null}
            editable={esDueno}
            onSelect={(orden) => cambiarRango('cocina', orden)}
          />
          <RangoGrupo
            titulo="🛵 Domicilio"
            rangos={rangosDomicilio}
            activo={config?.rango_domicilio_activo ?? null}
            editable={esDueno}
            onSelect={(orden) => cambiarRango('domicilio', orden)}
          />
        </div>
        {!esDueno && (
          <p className="text-xs text-mute mt-2">Solo el dueño puede cambiar los tiempos.</p>
        )}
      </section>

      {/* ───────── ZONA 1: Cola de hoy ───────── */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Cola de hoy</h2>
          <span className="text-xs text-mute tnum">
            {cola.length} en cola · {pendientes.length} pendientes
          </span>
        </div>

        {cola.length === 0 ? (
          <div className="text-center py-14 bg-surface border border-dashed border-line rounded-xl">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-ink font-medium">La cola está vacía.</p>
            <p className="text-xs text-mute mt-1">
              Los pedidos que entren mientras está cerrado aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cola.map(item => {
              const info = preInfo(item.estado_preapertura)
              const pendiente = item.estado_preapertura === 'pendiente_confirmacion'
              return (
                <div
                  key={item.id}
                  className="bg-surface border border-line rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-oso-100 text-oso-800 grid place-items-center">
                    <span className="font-display font-bold text-lg tnum">{item.turno_dia}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold tnum text-sm">{item.numero_pedido}</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full ring-1 ring-inset font-medium",
                        info.chip
                      )}>
                        {info.label}
                      </span>
                    </div>
                    <div className="text-sm text-mute truncate">
                      {item.cliente_nombre || 'Sin nombre'} · {formatCOP(item.total)} ·{' '}
                      <span className="capitalize">{item.tipo_entrega}</span>
                    </div>
                  </div>

                  {pendiente && (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => resolverPedido(item, 'confirmar')}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => resolverPedido(item, 'cancelar')}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-surface text-red-700 border border-line hover:bg-red-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ───────── ZONA 3: Configuración (solo dueño) ───────── */}
      {esDueno && config && (
        <section>
          <h2 className="font-display text-lg font-semibold tracking-tight mb-3">Configuración</h2>
          <div className="bg-surface border border-line rounded-xl p-5 space-y-5">

            {/* Horario por día de la semana */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-3">
                Horario de atención
              </label>
              <div className="border border-line rounded-lg overflow-hidden">
                {DIAS_ORDEN.map((d, idx) => {
                  const dia = dias[d]
                  if (!dia) return null
                  return (
                    <div
                      key={d}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        idx < DIAS_ORDEN.length - 1 ? "border-b border-line" : "",
                        dia.cerrado ? "bg-canvas/50" : ""
                      )}
                    >
                      {/* Toggle */}
                      <button
                        onClick={() => toggleCerrado(d)}
                        className={cn(
                          "relative w-10 h-5.5 rounded-full transition-colors shrink-0",
                          !dia.cerrado ? "bg-oso-600" : "bg-line"
                        )}
                        style={{ height: '22px', width: '40px' }}
                        aria-label={dia.cerrado ? 'Cerrado' : 'Abierto'}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 left-0.5 bg-white rounded-full transition-transform",
                            !dia.cerrado ? "translate-x-[18px]" : ""
                          )}
                          style={{ height: '18px', width: '18px' }}
                        />
                      </button>

                      {/* Día */}
                      <div className="w-20 shrink-0">
                        <div className="font-medium text-sm">{DIA_LABEL[d]}</div>
                        <div className={cn("text-[11px]", dia.cerrado ? "text-mute" : "text-oso-700")}>
                          {dia.cerrado ? 'Cerrado' : 'Abierto'}
                        </div>
                      </div>

                      {/* Horas */}
                      {!dia.cerrado ? (
                        <div className="flex items-center gap-2 flex-1 flex-wrap">
                          <input
                            type="time"
                            value={dia.hora_apertura}
                            onChange={e => cambiarHora(d, 'hora_apertura', e.target.value)}
                            className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
                          />
                          <span className="text-mute text-sm">a</span>
                          <input
                            type="time"
                            value={dia.hora_cierre}
                            onChange={e => cambiarHora(d, 'hora_cierre', e.target.value)}
                            className="px-2 py-1.5 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
                          />
                          <button
                            onClick={() => copiarATodos(d)}
                            className="text-[11px] text-oso-700 hover:underline ml-1"
                            title="Aplicar a todos los días abiertos"
                          >
                            copiar a todos
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 text-sm text-mute">Sin atención este día</div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={guardarHorario}
                  disabled={guardandoHorario}
                  className="px-4 py-2 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
                >
                  {guardandoHorario ? 'Guardando…' : 'Guardar horario'}
                </button>
                {horarioGuardado && (
                  <span className="text-sm text-green-700 font-medium">✓ Guardado</span>
                )}
              </div>
              <p className="text-xs text-mute mt-2">
                Este horario controla cuándo el bot toma pedidos normales vs los pone en cola, y si avisa que está cerrado.
              </p>
            </div>

            <div className="border-t border-line pt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                  Min. antes (preguntar cliente)
                </label>
                <input
                  type="number"
                  value={config.minutos_antes_preguntar ?? 60}
                  onChange={e => guardarConfig({ minutos_antes_preguntar: parseInt(e.target.value || '60', 10) })}
                  min={0}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                  Min. antes (avisar jefe)
                </label>
                <input
                  type="number"
                  value={config.minutos_antes_jefe ?? 20}
                  onChange={e => guardarConfig({ minutos_antes_jefe: parseInt(e.target.value || '20', 10) })}
                  min={0}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
                />
              </div>
            </div>

            <div className="border-t border-line pt-5">
              <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-2">
                Cómo recibe los pedidos el jefe
              </label>
              <div className="flex gap-2">
                <ModoBtn
                  activo={config.modo_notificacion === 'instantanea'}
                  onClick={() => guardarConfig({ modo_notificacion: 'instantanea' })}
                >
                  Instantánea
                </ModoBtn>
                <ModoBtn
                  activo={config.modo_notificacion === 'acumulada'}
                  onClick={() => guardarConfig({ modo_notificacion: 'acumulada' })}
                >
                  Acumulada
                </ModoBtn>
              </div>
              <p className="text-xs text-mute mt-2">
                Instantánea: cada pedido le llega al jefe al confirmarse, a cualquier hora.
                Acumulada: los pedidos hechos fuera de horario se le mandan todos juntos un rato antes de abrir.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function RangoGrupo({
  titulo, rangos, activo, editable, onSelect
}: {
  titulo: string
  rangos: RangoTiempo[]
  activo: number | null
  editable: boolean
  onSelect: (orden: number) => void
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="font-medium text-sm mb-3">{titulo}</div>
      <div className="flex flex-wrap gap-2">
        {rangos.map(r => {
          const esActivo = r.orden === activo
          return (
            <button
              key={r.id}
              disabled={!editable}
              onClick={() => editable && onSelect(r.orden)}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium border transition-colors tnum",
                esActivo
                  ? "bg-oso-600 text-white border-oso-600"
                  : "bg-canvas text-ink border-line",
                editable && !esActivo && "hover:border-oso-400 cursor-pointer",
                !editable && "cursor-default opacity-90"
              )}
            >
              {r.etiqueta}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ModoBtn({
  activo, onClick, children
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors",
        activo
          ? "bg-oso-600 text-white border-oso-600"
          : "bg-canvas text-ink border-line hover:border-oso-400"
      )}
    >
      {children}
    </button>
  )
}
