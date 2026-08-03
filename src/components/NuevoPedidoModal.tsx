// src/components/NuevoPedidoModal.tsx — Registrar pedido por llamada/mostrador
// Vive dentro del módulo Pedidos como panel deslizante (igual que PedidoDetalle).
// El pedido creado es idéntico a uno del bot: mismo cliente por teléfono, mismas
// tablas, mismos avisos de estado y flujo de comprobantes. La lista de Pedidos se
// refresca sola por Realtime cuando la RPC inserta.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useMarca, useVocab } from '../lib/tema'
import { formatCOP } from '../lib/utils'

type Presentacion = { id: string; nombre: string; detalle: string | null; precio: number; orden: number }
type PlatoMin = {
  id: string; nombre: string; precio: number; keywords: string | null
  controla_stock: boolean; stock: number
  presentaciones: Presentacion[]
}
type Item = { plato_id: string | null; nombre: string; precio: number; cantidad: number; notas: string }

const inputCls = 'w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-oso-300'
const btnSec   = 'px-2.5 py-1 bg-oso-100 text-oso-800 rounded-lg text-sm hover:bg-oso-200 transition-colors'

export default function NuevoPedidoModal({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const V = useVocab()
  const marca = useMarca()
  const [platos, setPlatos] = useState<PlatoMin[]>([])
  const [busca, setBusca] = useState('')
  const [items, setItems] = useState<Item[]>([])

  // Plato para el cual se está eligiendo tamaño (null = ningún selector abierto)
  const [platoTamanos, setPlatoTamanos] = useState<PlatoMin | null>(null)

  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'recoge' | 'domicilio'>('recoge')
  const [direccion, setDireccion] = useState('')
  const [domicilioValor, setDomicilioValor] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [notas, setNotas] = useState('')

  const [libreNombre, setLibreNombre] = useState('')
  const [librePrecio, setLibrePrecio] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    async function cargar() {
      const [{ data: platosData }, { data: presData }] = await Promise.all([
        supabase.from('platos').select('id, nombre, precio, keywords, controla_stock, stock')
          .eq('disponible', true).order('nombre'),
        supabase.from('presentaciones').select('id, plato_id, nombre, detalle, precio, orden').eq('disponible', true).order('orden'),
      ])
      const porPlato: Record<string, Presentacion[]> = {}
      for (const pr of (presData ?? []) as any[]) {
        (porPlato[pr.plato_id] ??= []).push({ id: pr.id, nombre: pr.nombre, detalle: pr.detalle, precio: pr.precio, orden: pr.orden })
      }
      setPlatos(((platosData ?? []) as any[]).map(p => ({
        ...p,
        controla_stock: p.controla_stock === true,
        stock: Math.max(0, p.stock ?? 0),
        presentaciones: porPlato[p.id] ?? [],
      })) as PlatoMin[])
    }
    cargar()
  }, [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (platoTamanos) { setPlatoTamanos(null); return }
      onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, platoTamanos])

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 2) return []
    return platos.filter(p =>
      p.nombre.toLowerCase().includes(q) || (p.keywords ?? '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [busca, platos])

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.precio * i.cantidad, 0), [items])
  const total = subtotal + (tipo === 'domicilio' ? (parseInt(domicilioValor) || 0) : 0)

  // ── STOCK ──────────────────────────────────────────────────────────────
  // El stock vive en el PLATO, no en la presentación: dos tamaños de la misma
  // torta comen del mismo inventario. Por eso todo se cuenta por plato_id.
  const platoPorId = useMemo(() => {
    const m: Record<string, PlatoMin> = {}
    for (const p of platos) m[p.id] = p
    return m
  }, [platos])

  const usadoPorPlato = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of items) if (it.plato_id) m[it.plato_id] = (m[it.plato_id] ?? 0) + it.cantidad
    return m
  }, [items])

  // null = sin control de inventario (sin tope)
  function stockDe(plato_id: string | null) {
    if (!plato_id) return null
    const p = platoPorId[plato_id]
    if (!p || !p.controla_stock) return null
    const usado = usadoPorPlato[plato_id] ?? 0
    return { nombre: p.nombre, stock: p.stock, usado, libre: Math.max(0, p.stock - usado) }
  }

  const excesos = useMemo(() => {
    const out: { nombre: string; pedido: number; stock: number }[] = []
    for (const plato_id of Object.keys(usadoPorPlato)) {
      const usado = usadoPorPlato[plato_id] ?? 0
      const p = platoPorId[plato_id]
      if (p?.controla_stock && usado > p.stock) out.push({ nombre: p.nombre, pedido: usado, stock: p.stock })
    }
    return out
  }, [usadoPorPlato, platoPorId])

  function normalizarTel(t: string) {
    const d = t.replace(/\D/g, '')
    return d.length === 10 && d.startsWith('3') ? '57' + d : d
  }

  async function buscarCliente() {
    const tel = normalizarTel(telefono)
    if (tel.length !== 12) return
    const { data } = await supabase.from('clientes').select('nombre, direccion').eq('telefono', tel).maybeSingle()
    if (data) {
      if (data.nombre && !nombre) setNombre(data.nombre)
      if (data.direccion && !direccion) setDireccion(data.direccion)
    }
  }

  // Agrega (o suma cantidad a) una línea de pedido. Dedupe por plato_id + nombre,
  // así dos tamaños distintos del mismo plato quedan como líneas separadas.
  function agregarItem(plato_id: string | null, nombreLinea: string, precio: number) {
    const st = stockDe(plato_id)
    if (st && st.libre <= 0) {
      setMsg({ ok: false, texto: `${st.nombre}: solo quedan ${st.stock} unidad(es) y ya están en el pedido.` })
      setBusca(''); setPlatoTamanos(null)
      return
    }
    setMsg(null)
    setItems(prev => {
      const i = prev.findIndex(x => x.plato_id === plato_id && x.nombre === nombreLinea)
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], cantidad: c[i].cantidad + 1 }; return c }
      return [...prev, { plato_id, nombre: nombreLinea, precio, cantidad: 1, notas: '' }]
    })
    setBusca('')
    setPlatoTamanos(null)
  }

  // Al tocar un resultado de búsqueda: si tiene tamaños, abre el selector;
  // si no, agrega directo con el precio único del plato.
  function elegir(p: PlatoMin) {
    if (p.presentaciones.length > 0) { setPlatoTamanos(p); return }
    agregarItem(p.id, p.nombre, p.precio)
  }

  function elegirTamano(pres: Presentacion) {
    if (!platoTamanos) return
    const nombreLinea = pres.detalle
      ? `${platoTamanos.nombre} — ${pres.nombre} (${pres.detalle})`
      : `${platoTamanos.nombre} — ${pres.nombre}`
    agregarItem(platoTamanos.id, nombreLinea, pres.precio)
  }

  function agregarLibre() {
    const precio = parseInt(librePrecio.replace(/\D/g, '')) || 0
    if (!libreNombre.trim() || precio <= 0) return
    setItems(prev => [...prev, { plato_id: null, nombre: libreNombre.trim(), precio, cantidad: 1, notas: '' }])
    setLibreNombre(''); setLibrePrecio('')
  }

  function setItem(i: number, patch: Partial<Item>) {
    setItems(prev => prev.map((x, j) => {
      if (j !== i) return x
      const next = { ...x, ...patch }
      if (patch.cantidad !== undefined && x.plato_id) {
        const p = platoPorId[x.plato_id]
        if (p?.controla_stock) {
          // otras líneas del mismo plato ya consumen parte del stock
          const otras = prev.reduce((s, y, k) => s + (k !== i && y.plato_id === x.plato_id ? y.cantidad : 0), 0)
          next.cantidad = Math.max(1, Math.min(next.cantidad, Math.max(1, p.stock - otras)))
        }
      }
      return next
    }))
  }

  async function guardar() {
    setMsg(null)
    if (items.length === 0) { setMsg({ ok: false, texto: 'Agrega al menos un producto.' }); return }
    if (excesos.length > 0) {
      setMsg({ ok: false, texto: 'Sin unidades suficientes: ' + excesos.map(e => `${e.nombre} (pediste ${e.pedido}, quedan ${e.stock})`).join('; ') })
      return
    }
    setGuardando(true)
    const { data, error } = await supabase.rpc('crear_pedido_manual', {
      p_telefono: telefono,
      p_cliente_nombre: nombre || null,
      p_tipo_entrega: tipo,
      p_direccion: tipo === 'domicilio' ? direccion : null,
      p_metodo_pago: metodoPago,
      p_domicilio_valor: tipo === 'domicilio' ? (parseInt(domicilioValor) || 0) : 0,
      p_notas: notas || null,
      p_items: items.map(i => ({ plato_id: i.plato_id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, notas: i.notas || null })),
    })
    setGuardando(false)
    if (error || data?.error) {
      setMsg({ ok: false, texto: `No se pudo crear: ${data?.error ?? error?.message}${data?.detalle ? ' — ' + data.detalle : ''}` })
      return
    }
    // Éxito → cerrar; la lista se refresca sola por Realtime
    onCreado()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-canvas h-full overflow-y-auto shadow-xl animate-in-right">
        <div className="sticky top-0 bg-canvas border-b border-line px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-display text-xl font-semibold">{V.nuevoPedido}</h2>
            <p className="text-xs text-mute">Por llamada o mostrador</p>
          </div>
          <button onClick={onClose} className="text-mute hover:text-ink text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {msg && !msg.ok && (
            <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200">{msg.texto}</div>
          )}

          {/* Cliente */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-mute">Celular (WhatsApp) *</label>
              <input className={inputCls} value={telefono} onChange={e => setTelefono(e.target.value)}
                onBlur={buscarCliente} placeholder="321 759 6315" />
              <p className="text-[11px] text-mute mt-1">Usa el celular real: conecta {V.unPedido} con WhatsApp.</p>
            </div>
            <div>
              <label className="text-xs text-mute">Nombre</label>
              <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={tipo === 'recoge'} onChange={() => setTipo('recoge')} /> {V.entregaRecoge}</label>
              {marca.features?.domicilio !== false && (
                <label className="flex items-center gap-2"><input type="radio" checked={tipo === 'domicilio'} onChange={() => setTipo('domicilio')} /> {V.entregaDomicilio}</label>
              )}
            </div>
            {tipo === 'domicilio' && (
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-mute">Dirección *</label>
                  <input className={inputCls} value={direccion} onChange={e => setDireccion(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-mute">Domicilio</label>
                  <input className={inputCls} value={domicilioValor} onChange={e => setDomicilioValor(e.target.value)} placeholder="5000" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-mute">Método de pago</label>
              <select className={inputCls} value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="nequi">Nequi</option>
                <option value="contraentrega">Contraentrega</option>
              </select>
            </div>
          </div>

          {/* Productos */}
          <div className="border-t border-line pt-4 space-y-3">
            <div className="relative">
              <input className={inputCls} value={busca} onChange={e => { setBusca(e.target.value); setPlatoTamanos(null) }}
                placeholder={`${V.buscarProducto} (mín. 2 letras)`} />
              {resultados.length > 0 && !platoTamanos && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-lg shadow-lg overflow-hidden">
                  {resultados.map(p => {
                    const conTamanos = p.presentaciones.length > 0
                    const precios = conTamanos ? p.presentaciones.map(pr => pr.precio) : []
                    const min = conTamanos ? Math.min(...precios) : p.precio
                    const max = conTamanos ? Math.max(...precios) : p.precio
                    const st = stockDe(p.id)
                    const agotado = st !== null && st.libre <= 0
                    return (
                      <button key={p.id} onClick={() => elegir(p)} disabled={agotado}
                        className={`w-full flex justify-between px-3 py-2 text-sm text-left ${agotado ? 'opacity-50 cursor-not-allowed' : 'hover:bg-oso-50'}`}>
                        <span>
                          {p.nombre}
                          {st && (
                            <span className={`ml-1.5 text-[11px] ${agotado ? 'text-red-600' : 'text-amber-700'}`}>
                              {agotado ? '· sin unidades libres' : `· quedan ${st.libre}`}
                            </span>
                          )}
                        </span>
                        <span className="tnum text-mute">
                          {conTamanos && min !== max ? `${formatCOP(min)}–${formatCOP(max)}` : formatCOP(min)}
                          {conTamanos && <span className="text-oso-600 ml-1">· elegir tamaño</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Selector de tamaño */}
              {platoTamanos && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-lg shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-oso-50 border-b border-line">
                    <span className="text-sm font-medium">Elige el tamaño — {platoTamanos.nombre}</span>
                    <button className="text-mute hover:text-ink text-sm" onClick={() => setPlatoTamanos(null)}>✕</button>
                  </div>
                  {platoTamanos.presentaciones.map(pr => (
                    <button key={pr.id} onClick={() => elegirTamano(pr)}
                      className="w-full flex justify-between px-3 py-2 text-sm hover:bg-oso-50 text-left">
                      <span>{pr.nombre}{pr.detalle ? ` (${pr.detalle})` : ''}</span>
                      <span className="tnum text-mute">{formatCOP(pr.precio)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.map((it, i) => {
              const st = stockDe(it.plato_id)
              const tope = st !== null && st.libre <= 0
              return (
              <div key={i} className={`border rounded-lg p-2 space-y-2 ${st && st.usado > st.stock ? 'border-red-300 bg-red-50' : 'border-line'}`}>
                <div className="flex items-center gap-2">
                  <button className={btnSec} onClick={() => setItem(i, { cantidad: Math.max(1, it.cantidad - 1) })}>−</button>
                  <span className="tnum w-6 text-center text-sm">{it.cantidad}</span>
                  <button className={`${btnSec} ${tope ? 'opacity-40 cursor-not-allowed' : ''}`} disabled={tope}
                    onClick={() => setItem(i, { cantidad: it.cantidad + 1 })}>+</button>
                  <span className="flex-1 text-sm">{it.nombre}</span>
                  <span className="tnum text-sm">{formatCOP(it.precio * it.cantidad)}</span>
                  <button className="text-mute hover:text-red-600 px-1" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
                {st && (
                  <p className={`text-[11px] ${st.usado > st.stock ? 'text-red-700' : 'text-amber-700'}`}>
                    Inventario: {st.stock} unidad(es) en total{st.usado > it.cantidad ? ` · ${st.usado} en este pedido` : ''}
                    {tope ? ' · llegaste al tope' : ` · quedan ${st.libre}`}
                  </p>
                )}
                <input className={inputCls} value={it.notas} onChange={e => setItem(i, { notas: e.target.value })}
                  placeholder={V.notasPlaceholder} />
              </div>
            )})}

            <details className="text-sm">
              <summary className="cursor-pointer text-mute">{V.fueraDeCarta}</summary>
              <div className="flex gap-2 mt-2">
                <input className={inputCls} value={libreNombre} onChange={e => setLibreNombre(e.target.value)} placeholder="Nombre" />
                <input className={`${inputCls} w-28`} value={librePrecio} onChange={e => setLibrePrecio(e.target.value)} placeholder="Precio" />
                <button className={btnSec} onClick={agregarLibre}>+</button>
              </div>
            </details>
          </div>

          {/* Notas + total */}
          <div className="border-t border-line pt-4 space-y-2">
            <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder={V.notasPedido} />
            <div className="flex justify-between text-sm pt-1">
              <span className="text-mute">Subtotal</span><span className="tnum">{formatCOP(subtotal)}</span>
            </div>
            {tipo === 'domicilio' && (
              <div className="flex justify-between text-sm">
                <span className="text-mute">Domicilio</span><span className="tnum">{formatCOP(parseInt(domicilioValor) || 0)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg border-t border-line pt-2">
              <span>Total</span><span className="tnum">{formatCOP(total)}</span>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-canvas border-t border-line px-5 py-3">
          <button
            className="w-full px-4 py-2.5 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
            disabled={guardando || excesos.length > 0} onClick={guardar}>
            {guardando ? 'Creando…' : excesos.length > 0 ? 'Revisa las unidades' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}