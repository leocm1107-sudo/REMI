// src/pages/Personalizados.tsx — Armador de tortas personalizadas
// Cumple el brief: dropdown de variaciones, botonera (elige 1), checkboxes
// (elige varios), notas y carga/visualización de fotos de referencia.
// El total se recalcula en vivo: precio del tamaño + extras elegidos.
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/utils'

type Opcion = {
  id: string; nombre: string; descripcion: string | null
  precio_extra: number; orden: number; disponible: boolean
}
type Grupo = {
  id: string; nombre: string; descripcion: string | null
  tipo: 'unica' | 'multiple'; obligatorio: boolean; orden: number
  opciones_variacion: Opcion[]
}
type Presentacion = { id: string; nombre: string; detalle: string | null; precio: number }
type Plato = { id: string; nombre: string; presentaciones: Presentacion[] }

const input = 'w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-oso-300'

export default function Personalizados({ session }: { session: Session }) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [platos, setPlatos] = useState<Plato[]>([])
  const [cargando, setCargando] = useState(true)

  const [platoId, setPlatoId] = useState('')
  const [presId, setPresId] = useState('')
  const [unicas, setUnicas] = useState<Record<string, string>>({})     // grupo → opción
  const [multis, setMultis] = useState<Record<string, string[]>>({})   // grupo → opciones
  const [abierto, setAbierto] = useState<Record<string, boolean>>({})
  const [notas, setNotas] = useState('')

  const [fotos, setFotos] = useState<{ url: string; nombre: string }[]>([])
  const [subiendo, setSubiendo] = useState(false)

  // Datos del cliente
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [fechaRev, setFechaRev] = useState('')
  const [horaRev, setHoraRev]   = useState('')
  const [fechaEnt, setFechaEnt] = useState('')
  const [horaEnt, setHoraEnt]   = useState('')
  const [tipoEntrega, setTipoEntrega] = useState<'recoger' | 'domicilio'>('recoger')
  const [direccion, setDireccion] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('grupos_variacion')
        .select('id, nombre, descripcion, tipo, obligatorio, orden, opciones_variacion(id, nombre, descripcion, precio_extra, orden, disponible)')
        .eq('activo', true).order('orden'),
      supabase.from('platos')
        .select('id, nombre, presentaciones(id, nombre, detalle, precio)')
        .eq('disponible', true).order('nombre'),
    ]).then(([g, p]) => {
      const gs = ((g.data ?? []) as unknown as Grupo[])
      gs.forEach(x => x.opciones_variacion.sort((a, b) => a.orden - b.orden))
      setGrupos(gs)
      setPlatos(((p.data ?? []) as unknown as Plato[]).filter(x => x.presentaciones?.length))
      // El primer grupo arranca abierto; el resto plegado
      if (gs[0]) setAbierto({ [gs[0].id]: true })
      setCargando(false)
    })
  }, [])

  const plato = platos.find(p => p.id === platoId)
  const pres  = plato?.presentaciones.find(x => x.id === presId)

  const extras = useMemo(() => {
    let suma = 0
    const elegidas: { grupo: string; opcion: string; precio: number }[] = []
    for (const g of grupos) {
      if (g.tipo === 'unica') {
        const o = g.opciones_variacion.find(x => x.id === unicas[g.id])
        if (o) { suma += o.precio_extra; elegidas.push({ grupo: g.nombre, opcion: o.nombre, precio: o.precio_extra }) }
      } else {
        for (const id of multis[g.id] ?? []) {
          const o = g.opciones_variacion.find(x => x.id === id)
          if (o) { suma += o.precio_extra; elegidas.push({ grupo: g.nombre, opcion: o.nombre, precio: o.precio_extra }) }
        }
      }
    }
    return { suma, elegidas }
  }, [grupos, unicas, multis])

  const total = (pres?.precio ?? 0) + extras.suma

  const faltantes = grupos.filter(g => g.obligatorio && g.tipo === 'unica' && !unicas[g.id])

  async function subirFoto(f: File) {
    setSubiendo(true)
    const ruta = `manual/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('referencias').upload(ruta, f)
    if (!error) {
      const { data } = supabase.storage.from('referencias').getPublicUrl(ruta)
      setFotos(prev => [...prev, { url: data.publicUrl, nombre: f.name }])
    } else {
      setMsg({ ok: false, texto: 'No se pudo subir la foto: ' + error.message })
    }
    setSubiendo(false)
  }

  async function crear() {
    setMsg(null)
    if (!pres)               { setMsg({ ok: false, texto: 'Elige el producto y el tamaño.' }); return }
    if (faltantes.length)    { setMsg({ ok: false, texto: `Falta elegir: ${faltantes.map(g => g.nombre).join(', ')}` }); return }
    if (!telefono.trim())    { setMsg({ ok: false, texto: 'Falta el celular del cliente.' }); return }

    setGuardando(true)
    const detalle = extras.elegidas.map(e => `${e.grupo}: ${e.opcion}`).join(' · ')
    // Verificar que no haya ya una cita en esa fecha/hora
    async function hayChoque(tipo: 'revision' | 'entrega', fecha: string, hora: string | null) {
      if (!hora) return false
      const { data } = await supabase.from('citas')
        .select('id').eq('tipo', tipo).eq('fecha', fecha).eq('hora', hora)
        .neq('estado', 'cancelada').limit(1)
      return (data?.length ?? 0) > 0
    }

    if (fechaRev && horaRev && await hayChoque('revision', fechaRev, horaRev)) {
      setMsg({ ok: false, texto: 'Ya hay una revisión agendada a esa hora. Elegí otra.' }); return
    }
    if (fechaEnt && horaEnt && await hayChoque('entrega', fechaEnt, horaEnt)) {
      setMsg({ ok: false, texto: 'Ya hay una entrega agendada a esa hora. Elegí otra.' }); return
    }
    const { data, error } = await supabase.rpc('crear_pedido_manual', {
      p_telefono: telefono,
      p_cliente_nombre: nombre || null,
      p_tipo_entrega: tipoEntrega,
      p_direccion: tipoEntrega === 'domicilio' ? direccion : null,
      p_metodo_pago: 'transferencia',
      p_domicilio_valor: 0,
      p_notas: [`🎂 PERSONALIZADA — ${detalle}`, notas,
                fechaRev ? `Revisión: ${fechaRev} ${horaRev}` : '',
                fechaEnt ? `Entrega: ${fechaEnt} ${horaEnt}` : '']
                 .filter(Boolean).join(' | '),
      p_items: [{
        plato_id: platoId,
        nombre: `${plato?.nombre} (${pres.nombre}) — personalizada`,
        cantidad: 1,
        precio: total,
        notas: detalle,
      }],
    })
    setGuardando(false)

    if (error || data?.error) {
      setMsg({ ok: false, texto: `No se pudo crear: ${data?.error ?? error?.message}` })
      return
    }

    // Guardar las fotos de referencia contra el pedido recién creado
    if (fotos.length && data.pedido_id) {
      await supabase.from('pedido_adjuntos').insert(
        fotos.map(f => ({
          restaurante_id: import.meta.env.VITE_RESTAURANTE_ID,
          pedido_id: data.pedido_id, tipo: 'referencia',
          url: f.url, notas: f.nombre,
        })),
      )
    }

    // Doble agendamiento: revisión y entrega
    const citas = []
    if (fechaRev) citas.push({ restaurante_id: import.meta.env.VITE_RESTAURANTE_ID, pedido_id: data.pedido_id, tipo: 'revision', fecha: fechaRev, hora: horaRev || null, estado: 'propuesta' })
    if (fechaEnt) citas.push({ restaurante_id: import.meta.env.VITE_RESTAURANTE_ID, pedido_id: data.pedido_id, tipo: 'entrega',  fecha: fechaEnt, hora: horaEnt || null, estado: 'propuesta' })
    if (citas.length) await supabase.from('citas').insert(citas)

    setMsg({ ok: true, texto: `Pedido ${data.numero_pedido} creado · ${formatCOP(data.total)}` })
    setUnicas({}); setMultis({}); setNotas(''); setFotos([])
    setTelefono(''); setNombre(''); setDireccion(''); setFechaRev(''); setHoraRev(''); setFechaEnt(''); setHoraEnt('')
  }

  if (cargando) return <p className="text-center text-mute py-20 text-sm">Cargando opciones…</p>

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Torta personalizada</h1>
        <p className="text-mute text-sm">Arma el pedido con el cliente y el precio se calcula solo.</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${
          msg.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>{msg.texto}</div>
      )}

      {/* ── Producto y tamaño ── */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Producto</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-mute">Torta</label>
            <select className={input} value={platoId}
              onChange={e => { setPlatoId(e.target.value); setPresId('') }}>
              <option value="">— elige —</option>
              {platos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-mute">Tamaño</label>
            <select className={input} value={presId} onChange={e => setPresId(e.target.value)} disabled={!plato}>
              <option value="">— elige —</option>
              {plato?.presentaciones.map(x => (
                <option key={x.id} value={x.id}>
                  {x.nombre}{x.detalle ? ` · ${x.detalle}` : ''} — {formatCOP(x.precio)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Variaciones: dropdown por grupo ── */}
      {grupos.map(g => {
        const abiertoG = abierto[g.id] ?? false
        const resumen = g.tipo === 'unica'
          ? g.opciones_variacion.find(o => o.id === unicas[g.id])?.nombre
          : (multis[g.id] ?? []).length ? `${(multis[g.id] ?? []).length} elegidos` : undefined

        return (
          <div key={g.id} className="bg-surface border border-line rounded-xl overflow-hidden">
            <button
              onClick={() => setAbierto(p => ({ ...p, [g.id]: !abiertoG }))}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-oso-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{g.nombre}</span>
                {g.obligatorio && !resumen && <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">obligatorio</span>}
                {resumen && <span className="text-xs text-mute">· {resumen}</span>}
              </span>
              <span className="text-mute text-sm">{abiertoG ? '▲' : '▼'}</span>
            </button>

            {abiertoG && (
              <div className="px-4 pb-4">
                {g.descripcion && <p className="text-xs text-mute mb-3">{g.descripcion}</p>}

                {g.tipo === 'unica' ? (
                  // Botonera: elige 1
                  <div className="flex flex-wrap gap-2">
                    {g.opciones_variacion.filter(o => o.disponible).map(o => {
                      const sel = unicas[g.id] === o.id
                      return (
                        <button key={o.id}
                          onClick={() => setUnicas(p => ({ ...p, [g.id]: sel ? '' : o.id }))}
                          className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                            sel ? 'bg-oso-600 text-white border-oso-600' : 'bg-white border-line hover:border-oso-400'
                          }`}
                          title={o.descripcion ?? ''}
                        >
                          {o.nombre}
                          {o.precio_extra > 0 && (
                            <span className={sel ? 'opacity-80' : 'text-mute'}> +{formatCOP(o.precio_extra)}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  // Checkboxes: elige varios
                  <div className="space-y-1.5">
                    {g.opciones_variacion.filter(o => o.disponible).map(o => {
                      const sel = (multis[g.id] ?? []).includes(o.id)
                      return (
                        <label key={o.id} className="flex items-start gap-2.5 py-1 cursor-pointer">
                          <input type="checkbox" checked={sel} className="mt-1"
                            onChange={() => setMultis(p => {
                              const act = p[g.id] ?? []
                              return { ...p, [g.id]: sel ? act.filter(x => x !== o.id) : [...act, o.id] }
                            })} />
                          <span className="text-sm">
                            {o.nombre}
                            {o.precio_extra > 0 && <span className="text-mute"> +{formatCOP(o.precio_extra)}</span>}
                            {o.descripcion && <span className="block text-xs text-mute">{o.descripcion}</span>}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Notas y fotos ── */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Diseño</h2>
        <div>
          <label className="text-xs text-mute">Especificaciones (colores, temática, texto…)</label>
          <textarea className={`${input} min-h-[80px]`} value={notas} onChange={e => setNotas(e.target.value)}
            placeholder='Ej: tema unicornio, tonos pastel, que diga "Feliz cumple Sofía"' />
        </div>

        <div>
          <label className="text-xs text-mute">Fotos de referencia</label>
          <input type="file" accept="image/*" className={input} disabled={subiendo}
            onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f); e.currentTarget.value = '' }} />
          {subiendo && <p className="text-xs text-mute mt-1">Subiendo…</p>}
          {fotos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={f.url} alt="" className="h-20 w-20 object-cover rounded-lg border border-line" />
                  <button onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-white border border-line rounded-full w-5 h-5 text-xs leading-none hover:text-red-600">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Cliente y entrega ── */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Cliente y entrega</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-mute">Celular (WhatsApp) *</label>
            <input className={input} value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="321 759 6315" />
          </div>
          <div>
            <label className="text-xs text-mute">Nombre</label>
            <input className={input} value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3 pt-2 border-t border-line">
            <div>
              <label className="text-xs text-mute">📝 Fecha de revisión</label>
              <input type="date" className={input} value={fechaRev} onChange={e => setFechaRev(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-mute">Hora de revisión</label>
              <input type="time" className={input} value={horaRev} onChange={e => setHoraRev(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-mute">📦 Fecha de entrega *</label>
              <input type="date" className={input} value={fechaEnt} onChange={e => setFechaEnt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-mute">Hora de entrega</label>
              <input type="time" className={input} value={horaEnt} onChange={e => setHoraEnt(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={tipoEntrega === 'recoger'} onChange={() => setTipoEntrega('recoger')} /> Recoge en el taller</label>
          <label className="flex items-center gap-2"><input type="radio" checked={tipoEntrega === 'domicilio'} onChange={() => setTipoEntrega('domicilio')} /> Domicilio</label>
        </div>
        {tipoEntrega === 'domicilio' && (
          <input className={input} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección de entrega" />
        )}
      </div>

      {/* ── Resumen ── */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-2 sticky bottom-4 shadow-sm">
        {pres && (
          <div className="flex justify-between text-sm">
            <span className="text-mute">{plato?.nombre} · {pres.nombre}</span>
            <span className="tnum">{formatCOP(pres.precio)}</span>
          </div>
        )}
        {extras.elegidas.filter(e => e.precio > 0).map((e, i) => (
          <div key={i} className="flex justify-between text-xs text-mute">
            <span>{e.opcion}</span><span className="tnum">+{formatCOP(e.precio)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-lg border-t border-line pt-2">
          <span>Total</span><span className="tnum">{formatCOP(total)}</span>
        </div>
        <button onClick={crear} disabled={guardando}
          className="w-full px-4 py-2.5 bg-oso-600 text-white rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors">
          {guardando ? 'Creando…' : 'Crear pedido personalizado'}
        </button>
      </div>
    </div>
  )
}
