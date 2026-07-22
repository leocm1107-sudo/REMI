import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
  ingredientes: []
}

export default function PlatoEditor({ plato, categorias, onClose }: Props) {
  const esNuevo = plato === null
  const [form, setForm]                       = useState<FormData>(FORM_INICIAL)
  const [nuevoIngrediente, setNuevoIngrediente] = useState('')
  const [guardando, setGuardando]             = useState(false)
  const [error, setError]                     = useState('')

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
        ingredientes: Array.isArray(plato.ingredientes) ? plato.ingredientes : []
      })
    } else {
      setForm({ ...FORM_INICIAL, categoria_id: categorias[0]?.id ?? '' })
    }
  }, [plato, categorias])

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
      ingredientes: form.ingredientes.length > 0 ? form.ingredientes : null,
      updated_at:   new Date().toISOString()
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
                placeholder="plato / bebida / adición"
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
