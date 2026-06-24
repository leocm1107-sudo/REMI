import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

type PorAgente = {
  agente: string
  modelo: string
  llamadas: number
  tokens_in: number
  tokens_out: number
  costo: number
}
type PorDia = { dia: string; costo: number }
type Resumen = {
  dias: number
  costo_claude: number
  costo_make: number
  costo_total: number
  num_llamadas: number
  num_pedidos: number
  costo_por_pedido: number
  por_agente: PorAgente[]
  por_dia: PorDia[]
}
type Precio = {
  modelo: string
  precio_input: number
  precio_output: number
  precio_operacion: number
}

const usd = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(4)}`
const usdCorto = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(2)}`

export default function Estadisticas({ session: _s }: { session: Session }) {
  const [dias, setDias]         = useState(30)
  const [resumen, setResumen]   = useState<Resumen | null>(null)
  const [precios, setPrecios]   = useState<Precio[]>([])
  const [cargando, setCargando] = useState(true)
  const [noAutorizado, setNoAutorizado] = useState(false)

  // Form Make
  const [makeOps, setMakeOps]   = useState('')
  const [makeNota, setMakeNota] = useState('')
  const [guardandoMake, setGuardandoMake] = useState(false)

  // Precios editables
  const [editandoPrecios, setEditandoPrecios] = useState(false)
  const [preciosEdit, setPreciosEdit] = useState<Precio[]>([])
  const [guardandoPrecios, setGuardandoPrecios] = useState(false)

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
    if (!p.error) {
      setPrecios((p.data ?? []) as Precio[])
      setPreciosEdit((p.data ?? []) as Precio[])
    }
    setCargando(false)
  }

  useEffect(() => {
    setCargando(true)
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  async function guardarMake() {
    const ops = parseInt(makeOps, 10)
    if (!ops || ops <= 0) { alert('Ingresa un número de operaciones válido.'); return }
    setGuardandoMake(true)
    const { error } = await supabase.rpc('guardar_consumo_make', {
      p_operaciones: ops,
      p_nota: makeNota.trim() || null
    })
    setGuardandoMake(false)
    if (error) { alert('Error: ' + error.message); return }
    setMakeOps(''); setMakeNota('')
    cargar()
  }

  async function guardarPrecios() {
    setGuardandoPrecios(true)
    for (const p of preciosEdit) {
      await supabase.rpc('guardar_precio', {
        p_modelo: p.modelo,
        p_precio_input: p.precio_input,
        p_precio_output: p.precio_output,
        p_precio_operacion: p.precio_operacion
      })
    }
    setGuardandoPrecios(false)
    setEditandoPrecios(false)
    cargar()
  }

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

  const r = resumen!
  const chartData = (r.por_dia ?? []).map(d => ({
    dia: new Date(d.dia).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
    costo: d.costo
  }))

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Estadísticas</h1>
          <p className="text-mute text-sm">Consumo de Claude y Make en USD.</p>
        </div>
        <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                dias === d ? 'bg-oso-600 text-white' : 'text-mute hover:text-ink'
              }`}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tarjeta label="Costo total" valor={usdCorto(r.costo_total)} destacada />
        <Tarjeta label="Claude" valor={usdCorto(r.costo_claude)}
          sub={`${r.num_llamadas} llamadas`} />
        <Tarjeta label="Make" valor={usdCorto(r.costo_make)} />
        <Tarjeta label="Por pedido" valor={usd(r.costo_por_pedido)}
          sub={`${r.num_pedidos} pedidos`} />
      </div>

      {/* Gráfica */}
      <section className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-4">Gasto de Claude por día</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-mute py-10 text-center">
            Sin datos todavía. Cuando el bot empiece a registrar consumo, aparecerá aquí.
          </p>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DD" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#8A8578' }} tickLine={false} axisLine={{ stroke: '#E8E5DD' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8578' }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(v) => [usd(Number(v)), 'Costo']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E8E5DD' }}
                />
                <Line type="monotone" dataKey="costo" stroke="#A8794F" strokeWidth={2}
                  dot={{ r: 3, fill: '#A8794F' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Desglose por agente */}
      <section className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-4">Desglose por agente</h2>
        {r.por_agente.length === 0 ? (
          <p className="text-sm text-mute py-6 text-center">Sin datos en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-mute border-b border-line">
                  <th className="pb-2 font-medium">Agente</th>
                  <th className="pb-2 font-medium">Modelo</th>
                  <th className="pb-2 font-medium text-right">Llamadas</th>
                  <th className="pb-2 font-medium text-right">Tokens in</th>
                  <th className="pb-2 font-medium text-right">Tokens out</th>
                  <th className="pb-2 font-medium text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {r.por_agente.map((a, i) => (
                  <tr key={i} className="border-b border-line/50 last:border-0">
                    <td className="py-2 capitalize">{a.agente}</td>
                    <td className="py-2 capitalize text-mute">{a.modelo}</td>
                    <td className="py-2 text-right tnum">{a.llamadas}</td>
                    <td className="py-2 text-right tnum text-mute">{a.tokens_in.toLocaleString()}</td>
                    <td className="py-2 text-right tnum text-mute">{a.tokens_out.toLocaleString()}</td>
                    <td className="py-2 text-right tnum font-medium">{usd(a.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Registrar Make */}
      <section className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-1">Registrar operaciones de Make</h2>
        <p className="text-xs text-mute mb-4">
          Make no reporta el costo automáticamente. Revisa cuántas operaciones llevas en tu panel de Make e ingrésalas aquí.
        </p>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-[11px] text-mute mb-1">Operaciones</label>
            <input
              type="number"
              value={makeOps}
              onChange={e => setMakeOps(e.target.value)}
              placeholder="1500"
              className="w-32 px-3 py-2 bg-white border border-line rounded-lg text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[11px] text-mute mb-1">Nota (opcional)</label>
            <input
              type="text"
              value={makeNota}
              onChange={e => setMakeNota(e.target.value)}
              placeholder="Ej. consumo de junio"
              className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300"
            />
          </div>
          <button
            onClick={guardarMake}
            disabled={guardandoMake}
            className="bg-oso-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
          >
            {guardandoMake ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </section>

      {/* Precios (colapsable) */}
      <section className="bg-surface border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">Precios</h2>
          {!editandoPrecios ? (
            <button onClick={() => setEditandoPrecios(true)}
              className="text-xs text-oso-600 hover:underline font-medium">Editar</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={guardarPrecios} disabled={guardandoPrecios}
                className="text-xs bg-oso-600 text-white px-3 py-1 rounded-md font-medium hover:bg-oso-700 disabled:opacity-50">
                {guardandoPrecios ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={() => { setEditandoPrecios(false); setPreciosEdit(precios) }}
                className="text-xs text-mute hover:text-ink px-2">Cancelar</button>
            </div>
          )}
        </div>
        <p className="text-xs text-mute mb-4">
          USD por millón de tokens (Claude) o por operación (Make). Ajusta si cambian las tarifas.
        </p>
        <div className="space-y-2">
          {(editandoPrecios ? preciosEdit : precios).map((p, i) => (
            <div key={p.modelo} className="flex items-center gap-3 text-sm">
              <span className="w-20 capitalize font-medium">{p.modelo}</span>
              {p.modelo === 'make' ? (
                <PrecioCampo
                  label="USD / operación" valor={p.precio_operacion} editando={editandoPrecios}
                  onChange={v => {
                    const copia = [...preciosEdit]; copia[i] = { ...copia[i], precio_operacion: v }; setPreciosEdit(copia)
                  }}
                />
              ) : (
                <>
                  <PrecioCampo
                    label="input" valor={p.precio_input} editando={editandoPrecios}
                    onChange={v => {
                      const copia = [...preciosEdit]; copia[i] = { ...copia[i], precio_input: v }; setPreciosEdit(copia)
                    }}
                  />
                  <PrecioCampo
                    label="output" valor={p.precio_output} editando={editandoPrecios}
                    onChange={v => {
                      const copia = [...preciosEdit]; copia[i] = { ...copia[i], precio_output: v }; setPreciosEdit(copia)
                    }}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-mute mt-5 leading-relaxed">
        El costo de Claude se calcula con los tokens reales de cada respuesta del bot.
        El de Make lo registras tú según tu plan. Los montos están en dólares (USD).
      </p>
    </>
  )
}

function Tarjeta({ label, valor, sub, destacada }: {
  label: string; valor: string; sub?: string; destacada?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 border ${
      destacada ? 'bg-oso-600 text-white border-oso-600' : 'bg-surface border-line'
    }`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${
        destacada ? 'text-white/80' : 'text-mute'
      }`}>{label}</div>
      <div className="font-display text-2xl font-semibold tnum">{valor}</div>
      {sub && <div className={`text-xs mt-0.5 ${destacada ? 'text-white/70' : 'text-mute'}`}>{sub}</div>}
    </div>
  )
}

function PrecioCampo({ label, valor, editando, onChange }: {
  label: string; valor: number; editando: boolean; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-mute">{label}</span>
      {editando ? (
        <input
          type="number"
          step="0.0001"
          value={valor}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-24 px-2 py-1 bg-white border border-line rounded text-sm tnum focus:outline-none focus:ring-2 focus:ring-oso-300"
        />
      ) : (
        <span className="tnum font-medium">${valor}</span>
      )}
    </div>
  )
}
