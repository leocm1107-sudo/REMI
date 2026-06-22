import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type UsuarioPanel = {
  user_id: string
  nombre: string | null
  rol: string
  email: string
  estado_acceso: string
  created_at: string
}

export default function Usuarios({ session }: { session: Session }) {
  const [usuarios, setUsuarios] = useState<UsuarioPanel[]>([])
  const [cargando, setCargando] = useState(true)
  const [noAutorizado, setNoAutorizado] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)

  async function cargar() {
    const { data, error } = await supabase.rpc('listar_usuarios_panel')
    if (error) {
      setNoAutorizado(true)
      setCargando(false)
      return
    }
    setUsuarios((data ?? []) as UsuarioPanel[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendientes = useMemo(
    () => usuarios.filter(u => u.estado_acceso === 'pendiente'),
    [usuarios]
  )
  const activos = useMemo(
    () => usuarios.filter(u => u.estado_acceso === 'aprobado'),
    [usuarios]
  )
  const rechazados = useMemo(
    () => usuarios.filter(u => u.estado_acceso === 'rechazado'),
    [usuarios]
  )

  async function cambiarAcceso(u: UsuarioPanel, estado: 'aprobado' | 'rechazado') {
    const verbo = estado === 'aprobado' ? 'aprobar' : 'rechazar'
    if (!confirm(`¿${verbo} el acceso de ${u.nombre || u.email}?`)) return
    setProcesando(u.user_id)
    const { data, error } = await supabase.rpc('cambiar_acceso_usuario', {
      p_user_id: u.user_id,
      p_estado: estado
    })
    setProcesando(null)
    if (error) { alert('Error: ' + error.message); return }
    if (data && (data as any).error) {
      alert('No se pudo: ' + (data as any).error); return
    }
    cargar()
  }

  async function cambiarRol(u: UsuarioPanel, nuevoRol: 'dueno' | 'empleado') {
    const accion = nuevoRol === 'dueno' ? 'hacer dueño a' : 'quitarle el rol de dueño a'
    if (!confirm(`¿Seguro que quieres ${accion} ${u.nombre || u.email}?`)) return
    setProcesando(u.user_id)
    const { data, error } = await supabase.rpc('cambiar_rol_usuario', {
      p_user_id: u.user_id,
      p_nuevo_rol: nuevoRol
    })
    setProcesando(null)
    if (error) { alert('Error: ' + error.message); return }
    if (data && (data as any).error === 'ultimo_dueno') {
      alert('No puedes quitar al único dueño. Asciende a otra persona primero.')
      return
    }
    cargar()
  }

  if (cargando) {
    return <div className="text-center text-mute py-20 text-sm">Cargando usuarios…</div>
  }
  if (noAutorizado) {
    return (
      <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-ink font-medium">Solo el dueño puede ver esta sección.</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Usuarios</h1>
        <p className="text-mute text-sm">
          {activos.length} con acceso
          {pendientes.length > 0 && <> · {pendientes.length} pendientes</>}
        </p>
      </div>

      {/* PENDIENTES (lo más importante arriba) */}
      {pendientes.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold tracking-tight mb-1 flex items-center gap-2">
            Solicitudes de acceso
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
              {pendientes.length}
            </span>
          </h2>
          <p className="text-xs text-mute mb-3">
            Estas personas se registraron y esperan tu aprobación para entrar.
          </p>
          <div className="space-y-2">
            {pendientes.map(u => {
              const enProceso = procesando === u.user_id
              return (
                <div key={u.user_id} className="bg-surface border border-amber-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="shrink-0 w-11 h-11 rounded-full bg-amber-100 text-amber-800 grid place-items-center font-display font-semibold">
                    {(u.nombre || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.nombre || 'Sin nombre'}</div>
                    <div className="text-sm text-mute truncate">{u.email}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => cambiarAcceso(u, 'aprobado')}
                      disabled={enProceso}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {enProceso ? '…' : 'Aprobar'}
                    </button>
                    <button
                      onClick={() => cambiarAcceso(u, 'rechazado')}
                      disabled={enProceso}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-surface text-red-700 border border-line hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ACTIVOS */}
      <section className="mb-8">
        {pendientes.length > 0 && (
          <h2 className="font-display text-lg font-semibold tracking-tight mb-3">Con acceso</h2>
        )}
        <div className="space-y-2">
          {activos.map(u => {
            const esYo    = u.user_id === session.user.id
            const esDueno = u.rol === 'dueno'
            const enProceso = procesando === u.user_id
            return (
              <div key={u.user_id} className="bg-surface border border-line rounded-xl p-4 flex items-center gap-4">
                <div className={cn(
                  "shrink-0 w-11 h-11 rounded-full grid place-items-center font-display font-semibold",
                  esDueno ? "bg-oso-600 text-white" : "bg-oso-100 text-oso-800"
                )}>
                  {(u.nombre || u.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{u.nombre || 'Sin nombre'}</span>
                    {esYo && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-canvas rounded text-mute font-medium">tú</span>
                    )}
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full ring-1 ring-inset font-medium",
                      esDueno ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-gray-100 text-gray-700 ring-gray-200"
                    )}>
                      {esDueno ? 'Dueño' : 'Empleado'}
                    </span>
                  </div>
                  <div className="text-sm text-mute truncate">{u.email}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Cambiar rol */}
                  {esDueno ? (
                    esYo ? null : (
                      <button
                        onClick={() => cambiarRol(u, 'empleado')}
                        disabled={enProceso}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-surface text-mute border border-line hover:text-ink disabled:opacity-50 transition-colors"
                      >
                        Quitar dueño
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => cambiarRol(u, 'dueno')}
                      disabled={enProceso}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 disabled:opacity-50 transition-colors"
                    >
                      Hacer dueño
                    </button>
                  )}
                  {/* Expulsar (rechazar) — no a uno mismo */}
                  {!esYo && (
                    <button
                      onClick={() => cambiarAcceso(u, 'rechazado')}
                      disabled={enProceso}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-surface text-red-700 border border-line hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      Expulsar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* RECHAZADOS (colapsado abajo, con opción de readmitir) */}
      {rechazados.length > 0 && (
        <section>
          <h2 className="font-display text-base font-semibold tracking-tight mb-3 text-mute">
            Rechazados ({rechazados.length})
          </h2>
          <div className="space-y-2">
            {rechazados.map(u => {
              const enProceso = procesando === u.user_id
              return (
                <div key={u.user_id} className="bg-surface border border-line rounded-xl p-3.5 flex items-center gap-3 opacity-75">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-gray-100 text-gray-500 grid place-items-center text-sm font-medium">
                    {(u.nombre || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{u.nombre || 'Sin nombre'}</div>
                    <div className="text-xs text-mute truncate">{u.email}</div>
                  </div>
                  <button
                    onClick={() => cambiarAcceso(u, 'aprobado')}
                    disabled={enProceso}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-surface text-green-700 border border-line hover:bg-green-50 disabled:opacity-50 transition-colors shrink-0"
                  >
                    Readmitir
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-mute mt-6 leading-relaxed">
        Las personas nuevas se registran y quedan pendientes hasta que apruebes su acceso.
        Los empleados pueden ascenderse a dueño para editar menú, tiempos y configuración.
      </p>
    </>
  )
}
