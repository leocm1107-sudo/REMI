import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn, formatCOP } from '../lib/utils'
import type { Plato, Categoria, PerfilUsuario } from '../lib/types'
import PlatoEditor from '../components/PlatoEditor'

export default function Menu({ session }: { session: Session }) {
  const [platos, setPlatos]         = useState<Plato[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [perfil, setPerfil]         = useState<PerfilUsuario | null>(null)
  const [cargando, setCargando]     = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [catFiltro, setCatFiltro]   = useState<string | 'todas'>('todas')
  const [editando, setEditando]     = useState<Plato | 'nuevo' | null>(null)

  // Carga inicial
  useEffect(() => {
    let activo = true
    async function cargar() {
      const [u, c, p] = await Promise.all([
        supabase.from('usuarios_panel').select('nombre, rol').eq('user_id', session.user.id).single(),
        supabase.from('categorias').select('*').order('orden', { ascending: true, nullsFirst: false }).order('nombre'),
        supabase.from('platos').select('*').order('orden', { ascending: true, nullsFirst: false }).order('nombre')
      ])
      if (!activo) return
      if (u.data)  setPerfil(u.data as PerfilUsuario)
      if (c.data)  setCategorias(c.data as Categoria[])
      if (p.data)  setPlatos(p.data as Plato[])
      setCargando(false)
    }
    cargar()
    return () => { activo = false }
  }, [session.user.id])

  // Realtime en platos
  useEffect(() => {
    const channel = supabase
      .channel('platos-live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'platos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPlatos(prev => [...prev, payload.new as Plato])
          } else if (payload.eventType === 'UPDATE') {
            setPlatos(prev => prev.map(p =>
              p.id === (payload.new as any).id ? payload.new as Plato : p
            ))
          } else if (payload.eventType === 'DELETE') {
            setPlatos(prev => prev.filter(p => p.id !== (payload.old as any).id))
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const esDueno = perfil?.rol === 'dueno'

  // Filtrado y agrupación
  const platosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return platos.filter(p => {
      if (catFiltro !== 'todas' && p.categoria_id !== catFiltro) return false
      if (q && !p.nombre.toLowerCase().includes(q) &&
              !(p.descripcion ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [platos, busqueda, catFiltro])

  const platosPorCategoria = useMemo(() => {
    const mapa = new Map<string, Plato[]>()
    for (const cat of categorias) mapa.set(cat.id, [])
    for (const p of platosFiltrados) {
      const lista = mapa.get(p.categoria_id)
      if (lista) lista.push(p)
      else mapa.set(p.categoria_id, [p])
    }
    return mapa
  }, [platosFiltrados, categorias])

  async function toggleDisponible(plato: Plato) {
    // Optimista
    setPlatos(prev => prev.map(p =>
      p.id === plato.id ? { ...p, disponible: !p.disponible } : p
    ))
    const { error } = await supabase
      .from('platos')
      .update({ disponible: !plato.disponible, updated_at: new Date().toISOString() })
      .eq('id', plato.id)
    if (error) {
      // Rollback
      setPlatos(prev => prev.map(p =>
        p.id === plato.id ? { ...p, disponible: plato.disponible } : p
      ))
      alert('No se pudo actualizar: ' + error.message)
    }
  }

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Menú</h1>
          <p className="text-mute text-sm">
            {platos.length} platos en {categorias.length} categorías
          </p>
        </div>
        {esDueno && (
          <button
            onClick={() => setEditando('nuevo')}
            className="bg-oso-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-oso-700 transition-colors"
          >
            + Nuevo plato
          </button>
        )}
      </div>

      {/* Búsqueda y filtro */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar plato…"
            className="w-full pl-9 pr-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">🔍</span>
        </div>
        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value as any)}
          className="bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-oso-300"
        >
          <option value="todas">Todas las categorías</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {/* Lista por categoría */}
      {cargando ? (
        <div className="text-center text-mute py-20 text-sm">Cargando menú…</div>
      ) : platosFiltrados.length === 0 ? (
        <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-ink font-medium">No se encontró nada con esa búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {categorias.map(cat => {
            const platosDeCat = platosPorCategoria.get(cat.id) ?? []
            if (platosDeCat.length === 0) return null
            return (
              <section key={cat.id}>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-display text-xl font-semibold tracking-tight">{cat.nombre}</h2>
                  <span className="text-xs text-mute tnum">{platosDeCat.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {platosDeCat.map(plato => (
                    <PlatoCard
                      key={plato.id}
                      plato={plato}
                      esDueno={esDueno}
                      onToggle={() => toggleDisponible(plato)}
                      onEdit={() => setEditando(plato)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {editando && (
        <PlatoEditor
          plato={editando === 'nuevo' ? null : editando}
          categorias={categorias}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  )
}

function PlatoCard({
  plato, esDueno, onToggle, onEdit
}: {
  plato: Plato
  esDueno: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const ingredientes = Array.isArray(plato.ingredientes) ? plato.ingredientes : []
  const ingredientesVisibles = ingredientes.slice(0, 4)
  const ingredientesRestantes = ingredientes.length - ingredientesVisibles.length

  return (
    <div className={cn(
      "bg-surface border border-line rounded-xl overflow-hidden transition-all",
      !plato.disponible && "opacity-60"
    )}>
      {plato.foto_url && (
        <div className="w-full h-32 bg-canvas">
          <img
            src={plato.foto_url}
            alt={plato.nombre}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-medium text-ink leading-tight">{plato.nombre}</h3>
          <span className="font-display font-semibold tnum text-oso-700 shrink-0 text-sm">
            {formatCOP(plato.precio)}
          </span>
        </div>

        {plato.descripcion && (
          <p className="text-xs text-mute line-clamp-2 mb-3 leading-relaxed">{plato.descripcion}</p>
        )}

        {ingredientes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {ingredientesVisibles.map((ing, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-canvas rounded text-mute">
                {ing}
              </span>
            ))}
            {ingredientesRestantes > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 text-mute">+{ingredientesRestantes}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={onToggle}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors",
              plato.disponible
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            )}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              plato.disponible ? "bg-green-500" : "bg-gray-400"
            )} />
            {plato.disponible ? 'Disponible' : 'Agotado'}
          </button>
          {esDueno && (
            <button
              onClick={onEdit}
              className="text-xs text-mute hover:text-ink transition-colors px-2 py-1"
            >
              Editar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
