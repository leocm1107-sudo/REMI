// src/components/NuevoPedidoModal.tsx — Registrar pedido por llamada/mostrador
// Vive dentro del módulo Pedidos como panel deslizante (igual que PedidoDetalle).
// El pedido creado es idéntico a uno del bot: mismo cliente por teléfono, mismas
// tablas, mismos avisos de estado y flujo de comprobantes. La lista de Pedidos se
// refresca sola por Realtime cuando la RPC inserta.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/utils'

type PlatoMin = { id: string; nombre: string; precio: number; keywords: string | null }
type Item = { plato_id: string | null; nombre: string; precio: number; cantidad: number; notas: string }

const inputCls = 'w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-oso-300'
const btnSec   = 'px-2.5 py-1 bg-oso-100 text-oso-800 rounded-lg text-sm hover:bg-oso-200 transition-colors'

export default function NuevoPedidoModal({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [platos, setPlatos] = useState<PlatoMin[]>([])
  const [busca, setBusca] = useState('')
  const [items, setItems] = useState<Item[]>([])

  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'recoger' | 'domicilio'>('recoger')
  const [direccion, setDireccion] = useState('')
  const [domicilioValor, setDomicilioValor] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [notas, setNotas] = useState('')

  const [libreNombre, setLibreNombre] = useState('')
  const [librePrecio, setLibrePrecio] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    supabase.from('platos').select('id, nombre, precio, keywords')
      .eq('disponible', true).order('nombre')
      .then(({ data }) => setPlatos((data ?? []) as PlatoMin[]))
  }, [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 2) return []
    return platos.filter(p =>
      p.nombre.toLowerCase().includes(q) || (p.keywords ?? '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [busca, platos])

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.precio * i.cantidad, 0), [items])
  const total = subtotal + (tipo === 'domicilio' ? (parseInt(domicilioValor) || 0) : 0)

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

  function agregar(p: PlatoMin) {
    setItems(prev => {
      const i = prev.findIndex(x => x.plato_id === p.id)
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], cantidad: c[i].cantidad + 1 }; return c }
      return [...prev, { plato_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, notas: '' }]
    })
    setBusca('')
  }

  function agregarLibre() {
    const precio = parseInt(librePrecio.replace(/\D/g, '')) || 0
    if (!libreNombre.trim() || precio <= 0) return
    setItems(prev => [...prev, { plato_id: null, nombre: libreNombre.trim(), precio, cantidad: 1, notas: '' }])
    setLibreNombre(''); setLibrePrecio('')
  }

  function setItem(i: number, patch: Partial<Item>) {
    setItems(prev => prev.map((x, j) => j === i ? { ...x, ...patch } : x))
  }

  async function guardar() {
    setMsg(null)
    if (items.length === 0) { setMsg({ ok: false, texto: 'Agrega al menos un producto.' }); return }
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
            <h2 className="font-display text-xl font-semibold">Nuevo pedido</h2>
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
              <p className="text-[11px] text-mute mt-1">Usa el celular real: conecta el pedido con WhatsApp.</p>
            </div>
            <div>
              <label className="text-xs text-mute">Nombre</label>
              <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={tipo === 'recoger'} onChange={() => setTipo('recoger')} /> Recoge</label>
              <label className="flex items-center gap-2"><input type="radio" checked={tipo === 'domicilio'} onChange={() => setTipo('domicilio')} /> Domicilio</label>
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
              <input className={inputCls} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar plato… (mín. 2 letras)" />
              {resultados.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-lg shadow-lg overflow-hidden">
                  {resultados.map(p => (
                    <button key={p.id} onClick={() => agregar(p)}
                      className="w-full flex justify-between px-3 py-2 text-sm hover:bg-oso-50 text-left">
                      <span>{p.nombre}</span><span className="tnum text-mute">{formatCOP(p.precio)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.map((it, i) => (
              <div key={i} className="border border-line rounded-lg p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <button className={btnSec} onClick={() => setItem(i, { cantidad: Math.max(1, it.cantidad - 1) })}>−</button>
                  <span className="tnum w-6 text-center text-sm">{it.cantidad}</span>
                  <button className={btnSec} onClick={() => setItem(i, { cantidad: it.cantidad + 1 })}>+</button>
                  <span className="flex-1 text-sm">{it.nombre}</span>
                  <span className="tnum text-sm">{formatCOP(it.precio * it.cantidad)}</span>
                  <button className="text-mute hover:text-red-600 px-1" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
                <input className={inputCls} value={it.notas} onChange={e => setItem(i, { notas: e.target.value })}
                  placeholder="Notas (sin cebolla, término medio…)" />
              </div>
            ))}

            <details className="text-sm">
              <summary className="cursor-pointer text-mute">Producto fuera de carta</summary>
              <div className="flex gap-2 mt-2">
                <input className={inputCls} value={libreNombre} onChange={e => setLibreNombre(e.target.value)} placeholder="Nombre" />
                <input className={`${inputCls} w-28`} value={librePrecio} onChange={e => setLibrePrecio(e.target.value)} placeholder="Precio" />
                <button className={btnSec} onClick={agregarLibre}>+</button>
              </div>
            </details>
          </div>

          {/* Notas + total */}
          <div className="border-t border-line pt-4 space-y-2">
            <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas del pedido (entrega 7pm…)" />
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
            disabled={guardando} onClick={guardar}>
            {guardando ? 'Creando…' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
