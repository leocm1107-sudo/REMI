import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type UsuarioPanel = {
  user_id: string
  nombre: string | null
  rol: string
  email: string
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
      // El RPC lanza "No autorizado" si no es dueño
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

  async function cambiarRol(u: UsuarioPanel, nuevoRol: 'dueno' | 'empleado') {
    const accion = nuevoRol === 'dueno' ? 'hacer dueño a' : 'quitarle el rol de dueño a'
    if (!confirm(`¿Seguro que quieres ${accion} ${u.nombre || u.email}?`)) return

    setProcesando(u.user_id)
    const { data, error } = await supabase.rpc('cambiar_rol_usuario', {
      p_user_id: u.user_id,
      p_nuevo_rol: nuevoRol
    })
    setProcesando(null)

    if (error) {
      alert('Error: ' + error.message)
      return
    }
    if (data && (data as any).error === 'ultimo_dueno') {
      alert('No puedes quitar al único dueño. Asciende a otra persona primero.')
      return
    }
    // Recargar la lista
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
          {usuarios.length} {usuarios.length === 1 ? 'persona' : 'personas'} con acceso al panel
        </p>
      </div>

      <div className="space-y-2">
        {usuarios.map(u => {
          const esYo    = u.user_id === session.user.id
          const esDueno = u.rol === 'dueno'
          const enProceso = procesando === u.user_id

          return (
            <div
              key={u.user_id}
              className="bg-surface border border-line rounded-xl p-4 flex items-center gap-4"
            >
              {/* Avatar con inicial */}
              <div className={cn(
                "shrink-0 w-11 h-11 rounded-full grid place-items-center font-display font-semibold",
                esDueno ? "bg-oso-600 text-white" : "bg-oso-100 text-oso-800"
              )}>
                {(u.nombre || u.email).charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{u.nombre || 'Sin nombre'}</span>
                  {esYo && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-canvas rounded text-mute font-medium">
                      tú
                    </span>
                  )}
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full ring-1 ring-inset font-medium",
                    esDueno
                      ? "bg-amber-100 text-amber-800 ring-amber-200"
                      : "bg-gray-100 text-gray-700 ring-gray-200"
                  )}>
                    {esDueno ? 'Dueño' : 'Empleado'}
                  </span>
                </div>
                <div className="text-sm text-mute truncate">{u.email}</div>
              </div>

              {/* Acción */}
              <div className="shrink-0">
                {esDueno ? (
                  // No permitir que el dueño se quite el rol a sí mismo desde aquí
                  esYo ? (
                    <span className="text-xs text-mute">—</span>
                  ) : (
                    <button
                      onClick={() => cambiarRol(u, 'empleado')}
                      disabled={enProceso}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-surface text-red-700 border border-line hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {enProceso ? '…' : 'Quitar dueño'}
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => cambiarRol(u, 'dueno')}
                    disabled={enProceso}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 disabled:opacity-50 transition-colors"
                  >
                    {enProceso ? '…' : 'Hacer dueño'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-mute mt-6 leading-relaxed">
        Las personas nuevas se registran como empleados. Aquí puedes ascenderlas a dueño
        para que puedan editar el menú, los tiempos y la configuración.
      </p>
    </>
  )
}
