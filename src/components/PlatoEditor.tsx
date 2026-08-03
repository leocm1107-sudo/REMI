import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useVocab } from '../lib/tema'
import type { Plato, Categoria } from '../lib/types'

type Props = {
  plato: Plato | null     // null = crear nuevo
  categorias: Categoria[]
  onClose: () => void
}

type FormData = {
  nombre: string
  descripcion: string
  precio: number
  categoria_id: string
  tipo: string
  disponible: boolean
  foto_url: string
  keywords: string
  ingredientes: string[]
  sabores: { nombre: string; disponible: boolean }[]
  controla_stock: boolean
  stock: number
}

type FotoGaleria = {
  id: string
  foto_url: string
  pie: string
  orden: number
  enviar_por_bot: boolean
}

const FORM_INICIAL: FormData = {
  nombre: '',
  descripcion: '',
  precio: 0,
  categoria_id: '',
  tipo: '',
  disponible: true,
  foto_url: '',
  keywords: '',
  ingredientes: [],
  sabores: [],
  controla_stock: false,
  stock: 0
}

export default function PlatoEditor({ plato, categorias, onClose }: Props) {
  const V = useVocab()
  const esNuevo = plato === null
  const [form, setForm]                       = useState<FormData>(FORM_INICIAL)
  const [nuevoIngrediente, setNuevoIngrediente] = useState('')
  const [nuevoSabor, setNuevoSabor]           = useState('')
  const [guardando, setGuardando]             = useState(false)
  const [error, setError]                     = useState('')
  const [galeria, setGaleria]                 = useState<FotoGaleria[]>([])
  const [subiendoFoto, setSubiendoFoto]       = useState(false)

  // Cargar datos del plato a editar
  useEffect(() => {
    if (plato) {
      setForm({
        nombre:       plato.nombre,
        descripcion:  plato.descripcion ?? '',
        precio:       plato.precio,
        categoria_id: plato.categoria_id,
        tipo:         plato.tipo ?? '',
        disponible:   plato.disponible,
        foto_url:     plato.foto_url ?? '',
        keywords:     plato.keywords ?? '',
        ingredientes:    Array.isArray(plato.ingredientes) ? plato.ingredientes : [],
        sabores:         Array.isArray((plato as any).sabores) ? (plato as any).sabores : [],
        controla_stock:  (plato as any).controla_stock ?? false,
        stock:           (plato as any).stock ?? 0
      })
    } else {
      setForm({ ...FORM_INICIAL, categoria_id: categorias[0]?.id ?? '' })
    }
  }, [plato, categorias])

  // Cargar galería de fotos de referencia (solo para platos ya existentes)
  useEffect(() => {
    let activo = true
    async function cargarGaleria() {
      if (!plato) { setGaleria([]); return }
      const { data, error } = await supabase
        .from('plato_fotos')
        .select('id, foto_url, pie, orden, enviar_por_bot')
        .eq('plato_id', plato.id)
        .order('orden', { ascending: true, nullsFirst: false })
      if (!activo) return
      if (!error && data) setGaleria(data as FotoGaleria[])
    }
    cargarGaleria()
    return () => { activo = false }
  }, [plato])

  // Cerrar con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function agregarIngrediente() {
    const ing = nuevoIngrediente.trim()
    if (!ing) return
    if (form.ingredientes.includes(ing)) return
    setForm(f => ({ ...f, ingredientes: [...f.ingredientes, ing] }))
    setNuevoIngrediente('')
  }

  function quitarIngrediente(ing: string) {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.filter(i => i !== ing) }))
  }

  function agregarSabor() {
    const s = nuevoSabor.trim()
    if (!s) return
    if (form.sabores.some(x => x.nombre.toLowerCase() === s.toLowerCase())) return
    setForm(f => ({ ...f, sabores: [...f.sabores, { nombre: s, disponible: true }] }))
    setNuevoSabor('')
  }

  function quitarSabor(nombre: string) {
    setForm(f => ({ ...f, sabores: f.sabores.filter(x => x.nombre !== nombre) }))
  }

  function toggleSabor(nombre: string) {
    setForm(f => ({ ...f, sabores: f.sabores.map(x => x.nombre === nombre ? { ...x, disponible: !x.disponible } : x) }))
  }

  async function subirFotoGaleria(f: File) {
    if (!plato) return // requiere plato_id, se habilita solo en edición
    setSubiendoFoto(true)
    const ruta = `galeria_${plato.id}_${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: errSubida } = await supabase.storage.from('platos').upload(ruta, f)
    if (errSubida) {
      setSubiendoFoto(false)
      alert('No se pudo subir la foto: ' + errSubida.message)
      return
    }
    const { data } = supabase.storage.from('platos').getPublicUrl(ruta)
    const orden = galeria.length
    const { data: fila, error: errInsert } = await supabase
      .from('plato_fotos')
      .insert({ plato_id: plato.id, foto_url: data.publicUrl, pie: '', orden, enviar_por_bot: true })
      .select('id, foto_url, pie, orden, enviar_por_bot')
      .single()
    setSubiendoFoto(false)
    if (errInsert) { alert('No se pudo guardar la foto en la galería: ' + errInsert.message); return }
    setGaleria(g => [...g, fila as FotoGaleria])
  }

  async function quitarFotoGaleria(id: string) {
    setGaleria(g => g.filter(f => f.id !== id)) // optimista
    const { error } = await supabase.from('plato_fotos').delete().eq('id', id)
    if (error) alert('No se pudo eliminar la foto: ' + error.message)
  }

  function actualizarPieFoto(id: string, pie: string) {
    setGaleria(g => g.map(f => f.id === id ? { ...f, pie } : f))
  }

  async function guardarPieFoto(id: string, pie: string) {
    const { error } = await supabase.from('plato_fotos').update({ pie }).eq('id', id)
    if (error) alert('No se pudo guardar el pie de foto: ' + error.message)
  }

  async function toggleEnviarPorBot(id: string, valorActual: boolean) {
    setGaleria(g => g.map(f => f.id === id ? { ...f, enviar_por_bot: !valorActual } : f)) // optimista
    const { error } = await supabase.from('plato_fotos').update({ enviar_por_bot: !valorActual }).eq('id', id)
    if (error) {
      setGaleria(g => g.map(f => f.id === id ? { ...f, enviar_por_bot: valorActual } : f)) // rollback
      alert('No se pudo actualizar: ' + error.message)
    }
  }

  async function guardar() {
    setError('')
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.categoria_id)  { setError('Selecciona una categoría'); return }
    if (form.precio <= 0)    { setError('El precio debe ser mayor a 0'); return }

    setGuardando(true)
    const payload = {
      nombre:       form.nombre.trim(),
      descripcion:  form.descripcion.trim() || null,
      precio:       form.precio,
      categoria_id: form.categoria_id,
      tipo:         form.tipo.trim() || null,
      disponible:   form.disponible,
      foto_url:     form.foto_url.trim() || null,
      keywords:     form.keywords.trim() || null,
      ingredientes:    form.ingredientes.length > 0 ? form.ingredientes : null,
      sabores:         form.sabores,
      controla_stock:  form.controla_stock,
      stock:           form.controla_stock ? form.stock : null,
      updated_at:      new Date().toISOString()
    }

    let err
    if (esNuevo) {
      // Para crear necesitamos restaurante_id — lo sacamos de cualquier categoría
      const restauranteId = categorias[0]?.restaurante_id
      if (!restauranteId) {
        setError('No se pudo determinar el restaurante')
        setGuardando(false)
        return
      }
      const r = await supabase.from('platos').insert({ ...payload, restaurante_id: restauranteId })
      err = r.error
    } else {
      const r = await supabase.from('platos').update(payload).eq('id', plato!.id)
      err = r.error
    }

    setGuardando(false)
    if (err) {
      setError(err.message)
    } else {
      onClose()
    }
  }

  async function eliminar() {
    if (!plato) return
    if (!confirm(`¿Eliminar "${plato.nombre}"? Esta acción no se puede deshacer.`)) return
    setGuardando(true)
    const { error } = await supabase.from('platos').delete().eq('id', plato.id)
    setGuardando(false)
    if (error) setError(error.message)
    else       onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40 animate-fade" onClick={onClose} />

      <div className="relative bg-surface w-full max-w-md h-full overflow-y-auto shadow-2xl animate-in-right">
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="font-display text-xl font-semibold tracking-tight">
              {esNuevo ? 'Nuevo plato' : 'Editar plato'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-mute hover:text-ink text-2xl leading-none w-8 h-8 grid place-items-center"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <Field label="Nombre" required>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              className="input"
              placeholder="Hamburguesa La Clásica del Oso"
            />
          </Field>

          <Field label="Categoría" required>
            <select
              value={form.categoria_id}
              onChange={e => setForm({ ...form, categoria_id: e.target.value })}
              className="input"
            >
              <option value="">Selecciona…</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio" required>
              <input
                type="number"
                value={form.precio || ''}
                onChange={e => setForm({ ...form, precio: parseInt(e.target.value || '0', 10) })}
                className="input tnum"
                placeholder="18000"
                min={0}
              />
            </Field>
            <Field label="Tipo">
              <input
                type="text"
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="input"
                placeholder={`${V.producto} / adición`}
              />
            </Field>
          </div>

          <Field label="Descripción">
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              className="input"
              rows={3}
              placeholder="Pan brioche, carne 150g, queso cheddar, lechuga, tomate…"
            />
          </Field>

          <Field label="Ingredientes (para que el bot reconozca 'sin X')">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={nuevoIngrediente}
                onChange={e => setNuevoIngrediente(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    agregarIngrediente()
                  }
                }}
                placeholder="cebolla caramelizada"
                className="input flex-1"
              />
              <button
                type="button"
                onClick={agregarIngrediente}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm hover:bg-oso-50 transition-colors"
              >
                Agregar
              </button>
            </div>
            {form.ingredientes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.ingredientes.map(ing => (
                  <span
                    key={ing}
                    className="inline-flex items-center gap-1 text-xs bg-oso-50 text-oso-800 px-2 py-1 rounded-full"
                  >
                    {ing}
                    <button
                      type="button"
                      onClick={() => quitarIngrediente(ing)}
                      className="hover:text-oso-900"
                      aria-label={`Quitar ${ing}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Sabores">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={nuevoSabor}
                onChange={e => setNuevoSabor(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    agregarSabor()
                  }
                }}
                placeholder="Chocolate"
                className="input flex-1"
              />
              <button
                type="button"
                onClick={agregarSabor}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm hover:bg-oso-50 transition-colors"
              >
                Agregar
              </button>
            </div>
            {form.sabores.length > 0 ? (
              <div className="space-y-1.5">
                {form.sabores.map(s => (
                  <div key={s.nombre} className="flex items-center gap-2 bg-canvas/50 border border-line rounded-lg px-2.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleSabor(s.nombre)}
                      className={`relative rounded-full transition-colors shrink-0 ${s.disponible ? 'bg-oso-600' : 'bg-line'}`}
                      style={{ height: '20px', width: '36px' }}
                      aria-label={s.disponible ? 'Disponible hoy' : 'No disponible hoy'}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 bg-white rounded-full transition-transform"
                        style={{ height: '16px', width: '16px', transform: s.disponible ? 'translateX(16px)' : 'none' }}
                      />
                    </button>
                    <span className={`text-sm flex-1 ${s.disponible ? 'text-ink' : 'text-mute line-through'}`}>{s.nombre}</span>
                    <span className="text-[11px] text-mute">{s.disponible ? 'hoy sí' : 'hoy no'}</span>
                    <button
                      type="button"
                      onClick={() => quitarSabor(s.nombre)}
                      className="text-mute hover:text-red-600 text-lg leading-none"
                      aria-label={`Quitar ${s.nombre}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-mute">Déjalo vacío si este producto no maneja sabores variables. El bot solo menciona los que estén marcados "hoy sí".</p>
            )}
          </Field>

          <Field label="Foto del plato">
            {form.foto_url && (
              <img src={form.foto_url} alt="" className="h-24 w-24 rounded-lg object-cover mb-2 border border-line" />
            )}
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={async e => {
                const f = e.target.files?.[0]
                if (!f) return
                const ruta = `${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
                const { error } = await supabase.storage.from('platos').upload(ruta, f)
                if (error) { alert('No se pudo subir la foto: ' + error.message); return }
                const { data } = supabase.storage.from('platos').getPublicUrl(ruta)
                setForm({ ...form, foto_url: data.publicUrl })
              }}
            />
            <input
              type="url"
              value={form.foto_url}
              onChange={e => setForm({ ...form, foto_url: e.target.value })}
              className="input mt-2"
              placeholder="…o pega una URL"
            />
          </Field>

          <Field label="Inventario">
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={form.controla_stock}
                onChange={e => setForm({ ...form, controla_stock: e.target.checked })}
                className="w-4 h-4 rounded border-line accent-oso-600"
              />
              <span className="text-sm">Controlar unidades disponibles</span>
            </label>
            {form.controla_stock ? (
              <>
                <input
                  type="number"
                  value={form.stock || ''}
                  onChange={e => setForm({ ...form, stock: parseInt(e.target.value || '0', 10) })}
                  className="input tnum"
                  placeholder="Unidades disponibles"
                  min={0}
                />
                <p className="text-[11px] text-mute mt-1.5">
                  El bot y el panel descuentan una unidad cuando un pedido con este producto queda confirmado y pagado. Al llegar a 0 se marca "Agotado" automáticamente.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-mute">Sin límite de unidades — el producto solo depende del toggle "Disponible para pedir".</p>
            )}
          </Field>

          <Field label="Fotos de referencia (galería)">
            {!plato ? (
              <p className="text-[11px] text-mute">Guarda {V.producto === "servicio" ? "el servicio" : "el " + V.producto} primero; luego podrás agregarle una galería de fotos de referencia.</p>
            ) : (
              <>
                {galeria.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {galeria.map(f => (
                      <div key={f.id} className="border border-line rounded-lg overflow-hidden bg-canvas/50">
                        <img src={f.foto_url} alt={f.pie || ''} className="w-full h-20 object-cover" />
                        <div className="p-1.5 space-y-1.5">
                          <input
                            type="text"
                            value={f.pie}
                            onChange={e => actualizarPieFoto(f.id, e.target.value)}
                            onBlur={e => guardarPieFoto(f.id, e.target.value)}
                            placeholder="Pie de foto…"
                            className="input text-xs py-1"
                          />
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => toggleEnviarPorBot(f.id, f.enviar_por_bot)}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                                f.enviar_por_bot
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {f.enviar_por_bot ? 'Bot: sí' : 'Bot: no'}
                            </button>
                            <button
                              type="button"
                              onClick={() => quitarFotoGaleria(f.id)}
                              className="text-mute hover:text-red-600 text-xs px-1"
                              aria-label="Quitar foto"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="input"
                  disabled={subiendoFoto}
                  onChange={async e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    await subirFotoGaleria(f)
                    e.target.value = ''
                  }}
                />
                <p className="text-[11px] text-mute mt-1.5">
                  {subiendoFoto ? 'Subiendo…' : 'Se muestran junto a la tarjeta del producto. Apaga "Bot" en las que sean solo de uso interno.'}
                </p>
              </>
            )}
          </Field>

          <Field label="Palabras clave (para búsqueda del bot)">
            <input
              type="text"
              value={form.keywords}
              onChange={e => setForm({ ...form, keywords: e.target.value })}
              className="input"
              placeholder="hamburguesa, clasica, carne, queso"
            />
          </Field>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.disponible}
              onChange={e => setForm({ ...form, disponible: e.target.checked })}
              className="w-4 h-4 rounded border-line accent-oso-600"
            />
            <span className="text-sm">Disponible para pedir</span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2 pt-3">
            <button
              onClick={guardar}
              disabled={guardando}
              className="w-full bg-oso-600 text-white py-3 rounded-lg font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
            >
              {guardando ? 'Guardando…' : esNuevo ? 'Crear plato' : 'Guardar cambios'}
            </button>
            {!esNuevo && (
              <button
                onClick={eliminar}
                disabled={guardando}
                className="w-full bg-surface text-red-700 py-2.5 rounded-lg text-sm hover:bg-red-50 transition-colors border border-line"
              >
                Eliminar plato
              </button>
            )}
          </div>
        </div>

        <style>{`
          .input {
            width: 100%;
            padding: 0.5rem 0.75rem;
            background: white;
            border: 1px solid var(--tw-prose-line, #E8E5DD);
            border-color: #E8E5DD;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
          }
          .input:focus {
            border-color: #A8794F;
            box-shadow: 0 0 0 3px rgba(168,121,79,0.15);
          }
        `}</style>
      </div>
    </div>
  )
}

function Field({
  label, required, children
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
