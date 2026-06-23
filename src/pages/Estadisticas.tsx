import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type Resumen = {
  dias: number
  claude: { total_llamadas: number; total_input: number; total_output: number; costo_usd: number }
  por_agente: { agente: string; llamadas: number; costo_usd: number }[]
  por_dia: { dia: string; costo_usd: number }[]
  make: { operaciones: number; costo_usd: number }
  pedidos_con_datos: number
  costo_total_usd: number
}

type Precio = {
  clave: string
  descripcion: string
  precio_usd: number
  unidad: string
}

const USD = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`
const num = (n: number) => n.toLocaleString('es-CO')

export default function Estadisticas({ session: _session }: { session: Session }) {
  const [resumen, setResumen]   = useState<Resumen | null>(null)
  const [precios, setPrecios]   = useState<Precio[]>([])
  const [dias, setDias]         = useState(30)
  const [cargando, setCargando] = useState(true)
  const [noAutorizado, setNoAutorizado] = useState(false)
  const [mostrarPrecios, setMostrarPrecios] = useState(false)

  // Form de Make
  const [makeMes, setMakeMes]   = useState(() => new Date().toISOString().slice(0, 7))
  const [makeOps, setMakeOps]   = useState('')
  const [makeCosto, setMakeCosto] = useState('')

  async function cargar() {
    const [r, p] = await Promise.all([
      supabase.rpc('resumen_consumo', { p_dias: dias }),
      supabase.rpc('listar_precios')
    ])
    if (r.error) {
      setNoAutorizado(true)
      setCargando(false)
      return
    }
    setResumen(r.data as Resumen)
    if (!p.error && p.data) setPrecios(p.data as Precio[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  async function guardarPrecio(clave: string, valor: string) {
    const precio = parseFloat(valor)
    if (isNaN(precio)) return
    await supabase.rpc('guardar_precio', { p_clave: clave, p_precio: precio })
    setPrecios(prev => prev.map(p => p.clave === clave ? { ...p, precio_usd: precio } : p))
  }

  async function guardarMake() {
    if (!makeOps && !makeCosto) return
    await supabase.rpc('guardar_consumo_make', {
      p_periodo: makeMes + '-01',
      p_operaciones: parseInt(makeOps || '0', 10),
      p_costo_usd: parseFloat(makeCosto || '0')
    })
    setMakeOps('')
    setMakeCosto('')
    cargar()
  }

  const datosGrafica = useMemo(() => {
    if (!resumen) return []
    return resumen.por_dia.map(d => ({
      dia: d.dia.slice(5),  // MM-DD
      costo: Number(d.costo_usd)
    }))
  }, [resumen])

  if (cargando) {
    return <div className="text-center text-mute py-20 text-sm">Cargando estadísticas…</div>
  }
  if (noAutorizado) {
    return (
      <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-ink font-medium">Solo el dueño puede ver esta sección.</p>
      </div>
    )
  }
  if (!resumen) return null

  const costoPromedioPedido = resumen.pedidos_con_datos > 0
    ? resumen.claude.costo_usd / resumen.pedidos_con_datos
    : 0

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Estadísticas</h1>
          <p className="text-mute text-sm">Consumo de Claude y Make</p>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                dias === d ? "bg-ink text-white border-ink" : "bg-surface text-mute border-line hover:border-oso-400"
              )}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Tarjeta label="Costo total" valor={USD(resumen.costo_total_usd)} destacado />
        <Tarjeta label="Claude" valor={USD(resumen.claude.costo_usd)}
          sub={`${num(resumen.claude.total_llamadas)} llamadas`} />
        <Tarjeta label="Make" valor={USD(resumen.make.costo_usd)}
          sub={`${num(resumen.make.operaciones)} ops`} />
        <Tarjeta label="Promedio / pedido" valor={USD(costoPromedioPedido)}
          sub={`${resumen.pedidos_con_datos} pedidos`} />
      </div>

      {/* Gráfica de gasto por día */}
      {datosGrafica.length > 0 && (
        <section className="bg-surface border border-line rounded-xl p-5 mb-8">
          <h2 className="font-display text-lg font-semibold tracking-tight mb-4">Gasto de Claude por día</h2>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={datosGrafica} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DD" />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#8A8576' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8576' }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Costo'] as [string, string]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E8E5DD' }}
                />
                <Line type="monotone" dataKey="costo" stroke="#A8794F" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Desglose por agente */}
      {resumen.por_agente.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold tracking-tight mb-3">Gasto por agente</h2>
          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            {resumen.por_agente.map((a, i) => (
              <div key={a.agente} className={cn(
                "flex items-center justify-between px-4 py-3",
                i > 0 && "border-t border-line"
              )}>
                <div>
                  <div className="font-medium text-sm capitalize">{a.agente}</div>
                  <div className="text-xs text-mute">{num(a.llamadas)} llamadas</div>
                </div>
                <div className="font-display font-semibold tnum text-sm">{USD(a.costo_usd)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Registrar consumo de Make */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-3">Registrar consumo de Make</h2>
        <div className="bg-surface border border-line rounded-xl p-5">
          <p className="text-xs text-mute mb-4">
            Make no expone el costo por API. Ingresa manualmente las operaciones y el costo de cada mes
            (lo ves en tu panel de Make → Profile → Usage).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-mute mb-1">Mes</label>
              <input type="month" value={makeMes} onChange={e => setMakeMes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300" />
            </div>
            <div>
              <label className="block text-[11px] text-mute mb-1">Operaciones</label>
              <input type="number" value={makeOps} onChange={e => setMakeOps(e.target.value)} placeholder="8500"
                className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300" />
            </div>
            <div>
              <label className="block text-[11px] text-mute mb-1">Costo (USD)</label>
              <div className="flex gap-2">
                <input type="number" step="0.01" value={makeCosto} onChange={e => setMakeCosto(e.target.value)} placeholder="10.59"
                  className="flex-1 min-w-0 px-3 py-2 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300" />
                <button onClick={guardarMake}
                  className="px-4 py-2 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 transition-colors shrink-0">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Precios configurables (colapsable) */}
      <section>
        <button
          onClick={() => setMostrarPrecios(v => !v)}
          className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight mb-3"
        >
          Precios
          <span className="text-mute text-sm">{mostrarPrecios ? '▲' : '▼'}</span>
        </button>
        {mostrarPrecios && (
          <div className="bg-surface border border-line rounded-xl p-5 space-y-3">
            <p className="text-xs text-mute">
              Precios en USD usados para calcular los costos. Ajusta si cambian las tarifas.
            </p>
            {precios.map(p => (
              <div key={p.clave} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{p.descripcion}</div>
                  <div className="text-[11px] text-mute">{p.unidad.replace(/_/g, ' ')}</div>
                </div>
                <input
                  type="number"
                  step="0.000001"
                  defaultValue={p.precio_usd}
                  onBlur={e => guardarPrecio(p.clave, e.target.value)}
                  className="w-28 px-3 py-1.5 bg-white border border-line rounded-lg text-sm tnum text-right focus:outline-none focus:ring-2 focus:ring-oso-300"
                />
              </div>
            ))}
            <p className="text-[11px] text-mute pt-1">Se guarda al salir de cada campo.</p>
          </div>
        )}
      </section>
    </>
  )
}

function Tarjeta({ label, valor, sub, destacado }: {
  label: string; valor: string; sub?: string; destacado?: boolean
}) {
  return (
    <div className={cn(
      "border rounded-xl px-4 py-3.5",
      destacado ? "bg-oso-600 border-oso-600 text-white" : "bg-surface border-line"
    )}>
      <div className={cn(
        "text-[10px] uppercase tracking-wider font-semibold mb-1",
        destacado ? "text-oso-100" : "text-mute"
      )}>
        {label}
      </div>
      <div className="text-2xl font-display font-semibold tnum tracking-tight">{valor}</div>
      {sub && (
        <div className={cn("text-xs mt-0.5", destacado ? "text-oso-100" : "text-mute")}>{sub}</div>
      )}
    </div>
  )
}
