// src/pages/Admin.tsx — Panel de control de la plataforma
//
// Dos pestañas:
//   Negocios — los interruptores de cada cliente
//   Módulos  — cómo se llama y se describe cada uno (metadato editable)
//
// CLAVES_CODIGO es la lista de módulos que de verdad tienen código detrás.
// Se manda a la base para detectar desajustes en las dos direcciones: un
// módulo en el catálogo que ya no existe en el código sería un interruptor
// que no hace nada; uno en el código sin ficha no se puede ofrecer.
// Cuando agregues un módulo nuevo, va acá y también en el catálogo.
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const CLAVES_CODIGO = [
  'pedidos', 'catalogo', 'stock', 'personalizacion', 'importar_carta',
  'agendamiento', 'agenda_servicios', 'cambios_cliente',
  'domicilio', 'maps',
  'voz', 'pagos_ia', 'aviso_jefe',
]

type Negocio = {
  id: string
  nombre: string
  activo: boolean
  plan: string | null
  tipo: string | null
  logo_emoji: string | null
  logo_url: string | null
  color_primario: string | null
  phone_number_id: string | null
  tiene_token: boolean
  features: Record<string, boolean>
  usuarios: number
  productos: number
  pedidos_30d: number
  modulos: string[]
}

type Modulo = {
  clave: string
  label: string
  descripcion: string | null
  grupo: string
  orden: number
  estado: 'estable' | 'experimental' | 'retirado'
  planes: string[]
}

type Desync = { huerfanas: string[]; sin_ficha: string[] }

export default function Admin({ session }: { session: Session }) {
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'negocios' | 'modulos'>('negocios')
  const [negocios, setNegocios] = useState<Negocio[]>([])
  const [modulos, setModulos] = useState<Modulo[]>([])
  const [desync, setDesync] = useState<Desync>({ huerfanas: [], sin_ficha: [] })
  const [abierto, setAbierto] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [viendoComo, setViendoComo] = useState<string | null>(null)
  const [editando, setEditando] = useState<Modulo | null>(null)

  async function cargar() {
    const [neg, cat, dsy, mio] = await Promise.all([
      supabase.rpc('admin_negocios'),
      supabase.rpc('modulos_catalogo'),
      supabase.rpc('modulos_desincronizados', { p_claves_codigo: CLAVES_CODIGO }),
      supabase.from('plataforma_admins').select('restaurante_activo')
        .eq('user_id', session.user.id).maybeSingle(),
    ])
    setNegocios((neg.data ?? []) as Negocio[])
    setModulos((cat.data ?? []) as Modulo[])
    setDesync((dsy.data ?? { huerfanas: [], sin_ficha: [] }) as Desync)
    setViendoComo((mio.data as any)?.restaurante_activo ?? null)
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('es_superadmin')
      const ok = data === true
      setAutorizado(ok)
      if (ok) cargar()
    })()
  }, [session.user.id])

  async function alternar(n: Negocio, clave: string, valor: boolean) {
    setGuardando(`${n.id}:${clave}`)
    setNegocios(prev => prev.map(x =>
      x.id === n.id ? { ...x, features: { ...x.features, [clave]: valor } } : x))
    const { data } = await supabase.rpc('admin_set_feature', {
      p_restaurante_id: n.id, p_clave: clave, p_valor: valor,
    })
    if ((data as any)?.ok !== true) {
      setNegocios(prev => prev.map(x =>
        x.id === n.id ? { ...x, features: { ...x.features, [clave]: !valor } } : x))
      alert('No se pudo guardar el cambio.')
    }
    setGuardando(null)
  }

  async function pausar(n: Negocio) {
    const msg = n.activo
      ? `¿Pausar ${n.nombre}? El bot deja de responder y nadie del equipo puede entrar al panel.`
      : `¿Reactivar ${n.nombre}?`
    if (!confirm(msg)) return
    await supabase.rpc('admin_set_activo', { p_restaurante_id: n.id, p_activo: !n.activo })
    cargar()
  }

  async function verComo(id: string | null) {
    await supabase.rpc('admin_ver_como', { p_restaurante_id: id })
    window.location.href = '/'   // todo el panel cuelga de obtener_restaurante_actual()
  }

  async function guardarModulo(m: Modulo) {
    const { data } = await supabase.rpc('admin_guardar_modulo', {
      p_clave: m.clave, p_label: m.label, p_descripcion: m.descripcion,
      p_grupo: m.grupo, p_orden: m.orden, p_estado: m.estado, p_planes: m.planes,
    })
    if ((data as any)?.ok !== true) { alert('No se pudo guardar.'); return }
    setEditando(null)
    cargar()
  }

  if (autorizado === null) return <p className="text-mute text-sm">Verificando…</p>
  if (!autorizado) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <p className="text-sm text-mute">Esta sección es solo para administradores de la plataforma.</p>
      </div>
    )
  }

  const grupos = [...new Set(modulos.map(m => m.grupo))]
  const hayDesync = desync.huerfanas?.length > 0 || desync.sin_ficha?.length > 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Plataforma</h1>
        <p className="text-mute text-sm">
          {negocios.length} negocio{negocios.length === 1 ? '' : 's'} ·{' '}
          {negocios.filter(n => n.activo).length} activo{negocios.filter(n => n.activo).length === 1 ? '' : 's'} ·{' '}
          {modulos.filter(m => m.estado === 'estable').length} módulos disponibles
        </p>
      </div>

      {viendoComo && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-amber-900">
            Estás viendo el panel como{' '}
            <strong>{negocios.find(n => n.id === viendoComo)?.nombre ?? 'otro negocio'}</strong>.
          </span>
          <button onClick={() => verComo(null)} className="text-sm underline text-amber-900">
            Volver a lo mío
          </button>
        </div>
      )}

      {hayDesync && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-900 space-y-1">
          {desync.huerfanas?.length > 0 && (
            <p>
              <strong>{desync.huerfanas.join(', ')}</strong> están en el catálogo pero ya no en el código.
              Su interruptor existe y no hace nada — pasalos a «retirado».
            </p>
          )}
          {desync.sin_ficha?.length > 0 && (
            <p>
              <strong>{desync.sin_ficha.join(', ')}</strong> existen en el código pero no tienen ficha.
              Funcionan, pero no se pueden ofrecer hasta que las agregues al catálogo.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {([['negocios', 'Negocios'], ['modulos', 'Módulos']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              tab === v ? 'bg-oso-800 text-white' : 'bg-oso-100 text-oso-800 hover:bg-oso-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════ NEGOCIOS ══════════ */}
      {tab === 'negocios' && (
        <div className="space-y-3">
          {negocios.map(n => {
            const disponibles = modulos.filter(m =>
              m.estado === 'estable' && (n.modulos ?? []).includes(m.clave))
            const activos = disponibles.filter(m => n.features?.[m.clave] === true).length
            const listo = n.tiene_token && n.phone_number_id
              && !n.phone_number_id.startsWith('PENDIENTE') && !n.phone_number_id.startsWith('TEST')
            return (
              <div key={n.id} className="rounded-xl border border-line overflow-hidden">
                <button onClick={() => setAbierto(abierto === n.id ? null : n.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-canvas transition-colors">
                  {n.logo_url
                    ? <img src={n.logo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    : <span className="w-8 h-8 rounded-full grid place-items-center text-base shrink-0"
                        style={{ background: (n.color_primario ?? '#888') + '22' }}>
                        {n.logo_emoji ?? '🏪'}
                      </span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{n.nombre}</span>
                      {!n.activo && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Pausado</span>}
                      {!listo && n.activo && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Sin canal</span>}
                    </div>
                    <div className="text-[11px] text-mute">
                      {activos} de {disponibles.length} módulos · {n.productos} productos ·{' '}
                      {n.pedidos_30d} pedidos en 30 días · {n.usuarios} usuario{n.usuarios === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span className="text-mute text-sm shrink-0">{abierto === n.id ? '▴' : '▾'}</span>
                </button>

                {abierto === n.id && (
                  <div className="px-4 pb-4 border-t border-line pt-3 space-y-4">
                    {grupos.map(g => {
                      const items = disponibles.filter(m => m.grupo === g)
                      if (items.length === 0) return null
                      return (
                        <div key={g}>
                          <h4 className="text-[11px] uppercase tracking-wide text-mute mb-2">{g}</h4>
                          <div className="space-y-2">
                            {items.map(m => {
                              const on = n.features?.[m.clave] === true
                              const busy = guardando === `${n.id}:${m.clave}`
                              return (
                                <div key={m.clave} className="flex items-start gap-3">
                                  <button type="button" role="switch" aria-checked={on}
                                    aria-label={m.label} disabled={busy}
                                    onClick={() => alternar(n, m.clave, !on)}
                                    className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${
                                      on ? 'bg-oso-800' : 'bg-line'} ${busy ? 'opacity-50' : ''}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                                      on ? 'left-[18px]' : 'left-0.5'}`} />
                                  </button>
                                  <span className="min-w-0">
                                    <span className={`block text-sm ${on ? 'text-ink' : 'text-mute'}`}>{m.label}</span>
                                    <span className="block text-[11px] text-mute leading-snug">{m.descripcion}</span>
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}

                    <div className="pt-2 border-t border-line flex items-center gap-2 flex-wrap">
                      <button onClick={() => verComo(n.id)}
                        className="px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm">
                        Ver su panel
                      </button>
                      <button onClick={() => pausar(n)}
                        className={`px-3 py-1.5 rounded-lg text-sm ${
                          n.activo ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                   : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                        {n.activo ? 'Pausar negocio' : 'Reactivar'}
                      </button>
                      <span className="text-[11px] text-mute ml-auto">
                        plan {n.plan ?? '—'} · {n.phone_number_id ?? 'sin número'} ·{' '}
                        {n.tiene_token ? 'con token' : 'sin token'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════ MÓDULOS ══════════ */}
      {tab === 'modulos' && (
        <div className="space-y-4">
          <p className="text-mute text-sm">
            La clave viene del código y no se cambia. Acá se edita cómo se le presenta
            al cliente: nombre, explicación, grupo y orden.
          </p>

          {grupos.map(g => (
            <div key={g}>
              <h4 className="text-[11px] uppercase tracking-wide text-mute mb-2">{g}</h4>
              <div className="rounded-xl border border-line divide-y divide-line">
                {modulos.filter(m => m.grupo === g).map(m => (
                  <button key={m.clave} onClick={() => setEditando({ ...m })}
                    className="w-full px-4 py-3 text-left hover:bg-canvas transition-colors flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{m.label}</span>
                        <code className="text-[11px] text-mute">{m.clave}</code>
                        {m.estado === 'experimental' && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            Experimental
                          </span>
                        )}
                        {m.planes?.length > 0 && (
                          <span className="text-[11px] text-mute">solo {m.planes.join(', ')}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-mute leading-snug">{m.descripcion}</p>
                    </div>
                    <span className="text-mute text-xs shrink-0">editar</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════ Editor de un módulo ══════════ */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"
          onClick={() => setEditando(null)}>
          <div className="bg-surface rounded-2xl p-5 max-w-md w-full space-y-3"
            onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-display text-xl font-semibold">{editando.label}</h3>
              <code className="text-[11px] text-mute">{editando.clave}</code>
            </div>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-mute">Nombre</span>
              <input value={editando.label}
                onChange={e => setEditando({ ...editando, label: e.target.value })}
                className="w-full mt-1 px-3 py-1.5 rounded-lg border border-line text-sm" />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-mute">Explicación</span>
              <textarea value={editando.descripcion ?? ''} rows={2}
                onChange={e => setEditando({ ...editando, descripcion: e.target.value })}
                className="w-full mt-1 px-3 py-1.5 rounded-lg border border-line text-sm" />
            </label>

            <div className="flex gap-2">
              <label className="flex-1">
                <span className="text-[11px] uppercase tracking-wide text-mute">Grupo</span>
                <input value={editando.grupo}
                  onChange={e => setEditando({ ...editando, grupo: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-line text-sm" />
              </label>
              <label className="w-24">
                <span className="text-[11px] uppercase tracking-wide text-mute">Orden</span>
                <input type="number" value={editando.orden}
                  onChange={e => setEditando({ ...editando, orden: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-line text-sm" />
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-mute">Estado</span>
              <select value={editando.estado}
                onChange={e => setEditando({ ...editando, estado: e.target.value as Modulo['estado'] })}
                className="w-full mt-1 px-3 py-1.5 rounded-lg border border-line text-sm">
                <option value="estable">Estable — se ofrece a los clientes</option>
                <option value="experimental">Experimental — no se ofrece todavía</option>
                <option value="retirado">Retirado — ya no se usa</option>
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-mute">
                Planes (separados por coma, vacío = todos)
              </span>
              <input value={(editando.planes ?? []).join(', ')}
                onChange={e => setEditando({
                  ...editando,
                  planes: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })}
                placeholder="pro, premium"
                className="w-full mt-1 px-3 py-1.5 rounded-lg border border-line text-sm" />
            </label>

            <div className="flex gap-2 pt-1">
              <button onClick={() => guardarModulo(editando)}
                className="px-4 py-1.5 rounded-lg bg-oso-800 text-white text-sm">
                Guardar
              </button>
              <button onClick={() => setEditando(null)}
                className="px-4 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm ml-auto">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
