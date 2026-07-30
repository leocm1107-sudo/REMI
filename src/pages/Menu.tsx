import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn, formatCOP } from '../lib/utils'
import type { Plato, Categoria, PerfilUsuario } from '../lib/types'
import PlatoEditor from '../components/PlatoEditor'
import SaboresDelDia from '../components/SaboresDelDia'

type Sabor = { nombre: string; disponible: boolean }

// Los sabores pueden venir como strings sueltos (formato viejo) o como
// objetos. Se normaliza para que la tarjeta no tenga que preocuparse.
function normalizarSabores(raw: unknown): Sabor[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s: any) => typeof s === 'string'
      ? { nombre: s, disponible: true }
      : { nombre: String(s?.nombre ?? '').trim(), disponible: s?.disponible !== false })
    .filter(s => s.nombre)
}

type FotoGaleria = {
  id: string
  plato_id: string
  foto_url: string
  pie: string
  orden: number
  enviar_por_bot: boolean
}

export default function Menu({ session }: { session: Session }) {
  const [platos, setPlatos]         = useState<Plato[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [perfil, setPerfil]         = useState<PerfilUsuario | null>(null)
  const [fotos, setFotos]           = useState<FotoGaleria[]>([])
  const [cargando, setCargando]     = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [catFiltro, setCatFiltro]   = useState<string | 'todas'>('todas')
  const [editando, setEditando]     = useState<Plato | 'nuevo' | null>(null)

  // Carga inicial
  useEffect(() => {
    let activo = true
    async function cargar() {
      const [u, c, p, f] = await Promise.all([
        supabase.from('usuarios_panel').select('nombre, rol').eq('user_id', session.user.id).single(),
        supabase.from('categorias').select('*').order('orden', { ascending: true, nullsFirst: false }).order('nombre'),
        supabase.from('platos').select('*').order('orden', { ascending: true, nullsFirst: false }).order('nombre'),
        supabase.from('plato_fotos').select('*').order('orden', { ascending: true, nullsFirst: false })
      ])
      if (!activo) return
      if (u.data)  setPerfil(u.data as PerfilUsuario)
      if (c.data)  setCategorias(c.data as Categoria[])
      if (p.data)  setPlatos(p.data as Plato[])
      if (f.data)  setFotos(f.data as FotoGaleria[])
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

  // Realtime en plato_fotos (galería)
  useEffect(() => {
    const channel = supabase
      .channel('plato-fotos-live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'plato_fotos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setFotos(prev => [...prev, payload.new as FotoGaleria])
          } else if (payload.eventType === 'UPDATE') {
            setFotos(prev => prev.map(f =>
              f.id === (payload.new as any).id ? payload.new as FotoGaleria : f
            ))
          } else if (payload.eventType === 'DELETE') {
            setFotos(prev => prev.filter(f => f.id !== (payload.old as any).id))
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

  const fotosPorPlato = useMemo(() => {
    const mapa = new Map<string, FotoGaleria[]>()
    for (const f of fotos) {
      const lista = mapa.get(f.plato_id)
      if (lista) lista.push(f)
      else mapa.set(f.plato_id, [f])
    }
    return mapa
  }, [fotos])

  // Refresca la lista de platos y su galería (tras editar/crear/eliminar).
  // Respaldo por si realtime no está habilitado para 'platos' o 'plato_fotos'.
  async function recargarPlatos() {
    const [p, f] = await Promise.all([
      supabase.from('platos').select('*')
        .order('orden', { ascending: true, nullsFirst: false })
        .order('nombre'),
      supabase.from('plato_fotos').select('*')
        .order('orden', { ascending: true, nullsFirst: false })
    ])
    if (p.data) setPlatos(p.data as Plato[])
    if (f.data) setFotos(f.data as FotoGaleria[])
  }

  // Sabor del día desde la tarjeta: mismo comportamiento que la sección de
  // arriba, pero sin tener que subir a buscar el producto.
  async function guardarSabores(plato: Plato, patch: { usa_sabores_dia?: boolean; sabores?: Sabor[] }) {
    const previo = platos
    setPlatos(prev => prev.map(p => p.id === plato.id ? { ...p, ...patch } as Plato : p))
    const { error } = await supabase.from('platos')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', plato.id)
    if (error) {
      setPlatos(previo)
      alert('No se pudo guardar el sabor: ' + error.message)
    }
  }

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
      <SaboresDelDia />

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
                      fotos={fotosPorPlato.get(plato.id) ?? []}
                      esDueno={esDueno}
                      onToggle={() => toggleDisponible(plato)}
                      onEdit={() => setEditando(plato)}
                      onSabores={patch => guardarSabores(plato, patch)}
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
          onClose={() => { setEditando(null); recargarPlatos() }}
        />
      )}
    </>
  )
}

function PlatoCard({
  plato, fotos, esDueno, onToggle, onEdit, onSabores
}: {
  plato: Plato
  fotos: FotoGaleria[]
  esDueno: boolean
  onToggle: () => void
  onEdit: () => void
  onSabores: (patch: { usa_sabores_dia?: boolean; sabores?: Sabor[] }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [nuevoSabor, setNuevoSabor] = useState('')
  const usaSabores = (plato as any).usa_sabores_dia === true
  const sabores = normalizarSabores((plato as any).sabores)
  const hoy = sabores.filter(s => s.disponible)

  function agregarSabor() {
    const nombre = nuevoSabor.trim()
    if (!nombre) return
    if (sabores.some(s => s.nombre.toLowerCase() === nombre.toLowerCase())) { setNuevoSabor(''); return }
    onSabores({ sabores: [...sabores, { nombre, disponible: true }] })
    setNuevoSabor('')
  }

  const ingredientes = Array.isArray(plato.ingredientes) ? plato.ingredientes : []
  const ingredientesVisibles = ingredientes.slice(0, 4)
  const ingredientesRestantes = ingredientes.length - ingredientesVisibles.length
  const controlaStock = (plato as any).controla_stock as boolean | undefined
  const stock = (plato as any).stock as number | null | undefined

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

        {controlaStock && (
          <div className="mb-1.5">
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full tnum",
              (stock ?? 0) <= 0
                ? "bg-red-100 text-red-800"
                : (stock ?? 0) <= 3
                ? "bg-amber-100 text-amber-800"
                : "bg-canvas text-mute"
            )}>
              {(stock ?? 0) <= 0 ? 'Sin unidades' : `Quedan ${stock}`}
            </span>
          </div>
        )}

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

        {fotos.length > 0 && (
          <div className="flex gap-1.5 mb-3 overflow-x-auto">
            {fotos.map(f => (
              <div key={f.id} className="shrink-0 w-12 h-12 rounded-md overflow-hidden border border-line bg-canvas" title={f.pie || undefined}>
                <img src={f.foto_url} alt={f.pie || plato.nombre} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {esDueno && (
          <div className="border-t border-line pt-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <button
                role="switch" aria-checked={usaSabores}
                aria-label={`Sabor del día en ${plato.nombre}`}
                onClick={() => { onSabores({ usa_sabores_dia: !usaSabores }); setAbierto(!usaSabores) }}
                className={cn(
                  "relative w-9 h-5 rounded-full transition-colors shrink-0",
                  usaSabores ? "bg-oso-600" : "bg-oso-100"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                  usaSabores ? "left-[18px]" : "left-0.5"
                )} />
              </button>
              <span className="text-xs text-mute flex-1">Sabor del día</span>
              {usaSabores && (
                <button onClick={() => setAbierto(a => !a)}
                  className="text-[11px] text-oso-700 hover:text-oso-900">
                  {abierto ? 'Cerrar ▲' : `${sabores.length} ▼`}
                </button>
              )}
            </div>

            {usaSabores && !abierto && (
              <p className="text-[10px] text-mute mt-1 truncate">
                {sabores.length === 0
                  ? 'Sin sabores cargados'
                  : hoy.length === 0
                    ? 'Hoy no hay ninguno'
                    : `Hoy: ${hoy.map(s => s.nombre).join(', ')}`}
              </p>
            )}

            {usaSabores && abierto && (
              <div className="mt-2 space-y-1.5">
                {sabores.map((sab, i) => (
                  <div key={`${sab.nombre}-${i}`} className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1.5 flex-1 cursor-pointer min-w-0">
                      <input
                        type="checkbox" checked={sab.disponible}
                        onChange={() => onSabores({
                          sabores: sabores.map((x, j) => j === i ? { ...x, disponible: !x.disponible } : x),
                        })}
                      />
                      <span className={cn("text-xs truncate", !sab.disponible && "text-mute line-through")}>
                        {sab.nombre}
                      </span>
                    </label>
                    <button
                      onClick={() => onSabores({ sabores: sabores.filter((_, j) => j !== i) })}
                      className="text-mute hover:text-red-600 text-xs px-1"
                      aria-label={`Quitar ${sab.nombre}`}
                    >✕</button>
                  </div>
                ))}

                <div className="flex gap-1.5 pt-0.5">
                  <input
                    value={nuevoSabor}
                    onChange={e => setNuevoSabor(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarSabor() } }}
                    placeholder="Agregar sabor"
                    className="flex-1 min-w-0 px-2 py-1 bg-canvas border border-line rounded text-xs focus:outline-none focus:ring-2 focus:ring-oso-300"
                  />
                  <button onClick={agregarSabor}
                    className="px-2 py-1 bg-oso-100 text-oso-800 rounded text-xs hover:bg-oso-200 transition-colors shrink-0">
                    +
                  </button>
                </div>

                {hoy.length > 0 && (
                  <button
                    onClick={() => onSabores({ sabores: sabores.map(x => ({ ...x, disponible: false })) })}
                    className="text-[10px] text-mute hover:text-ink underline decoration-dotted"
                  >
                    Hoy no hay ninguno
                  </button>
                )}
              </div>
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
