// src/pages/NuevoPedido.tsx — Registrar pedidos por llamada o mostrador
// El pedido queda idéntico a uno del bot: mismo cliente (por teléfono),
// mismas tablas, mismos avisos de estado y flujo de comprobantes.
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/utils'

type PlatoMin = { id: string; nombre: string; precio: number; keywords: string | null; disponible: boolean }
type Item = { plato_id: string | null; nombre: string; precio: number; cantidad: number; notas: string }

const inputCls = 'w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-oso-300'
const btnPrim  = 'px-4 py-2 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors'
const btnSec   = 'px-3 py-1.5 bg-oso-100 text-oso-800 rounded-lg text-sm hover:bg-oso-200 transition-colors'

export default function NuevoPedido({ session }: { session: Session }) {
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
    supabase.from('platos')
      .select('id, nombre, precio, keywords, disponible')
      .eq('disponible', true).order('nombre')
      .then(({ data }) => setPlatos((data ?? []) as PlatoMin[]))
  }, [])

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
    const { data } = await supabase.from('clientes')
      .select('nombre, direccion').eq('telefono', tel).maybeSingle()
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
    setMsg({ ok: true, texto: `Pedido ${data.numero_pedido} creado ✓ · Total ${formatCOP(data.total)} · Cliente ${data.cliente_nuevo ? 'nuevo' : 'existente'} (${data.telefono_normalizado})` })
    setItems([]); setNotas(''); setBusca('')
    setTelefono(''); setNombre(''); setDireccion(''); setDomicilioValor('')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-display font-semibold">Nuevo pedido</h1>
        <p className="text-sm text-mute">Para pedidos por llamada o en el local. El teléfono conecta este pedido con WhatsApp: usa el celular real del cliente.</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.texto}
        </div>
      )}

      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Cliente</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-mute">Celular (WhatsApp) *</label>
            <input className={inputCls} value={telefono} onChange={e => setTelefono(e.target.value)}
              onBlur={buscarCliente} placeholder="321 759 6315" />
          </div>
          <div>
            <label className="text-xs text-mute">Nombre</label>
            <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={tipo === 'recoger'} onChange={() => setTipo('recoger')} /> Recoge en el local</label>
          <label className="flex items-center gap-2"><input type="radio" checked={tipo === 'domicilio'} onChange={() => setTipo('domicilio')} /> Domicilio</label>
        </div>
        {tipo === 'domicilio' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-mute">Dirección *</label>
              <input className={inputCls} value={direccion} onChange={e => setDireccion(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-mute">Valor domicilio</label>
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

      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Productos</h2>
        <div className="relative">
          <input className={inputCls} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar plato… (mín. 2 letras)" />
          {resultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-line rounded-lg shadow-lg overflow-hidden">
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
              <span className="tnum w-6 text-center">{it.cantidad}</span>
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
            <input className={`${inputCls} w-32`} value={librePrecio} onChange={e => setLibrePrecio(e.target.value)} placeholder="Precio" />
            <button className={btnSec} onClick={agregarLibre}>Agregar</button>
          </div>
        </details>
      </div>

      <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
        <label className="text-xs text-mute">Notas del pedido</label>
        <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Cliente llamó al fijo, entrega a las 7pm…" />
        <div className="flex justify-between text-sm pt-2">
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
        <button className={`${btnPrim} w-full`} disabled={guardando} onClick={guardar}>
          {guardando ? 'Creando…' : 'Crear pedido'}
        </button>
      </div>
    </div>
  )
}
