import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type Perfil = {
  nombre: string | null
  rol: 'dueno' | 'empleado'
  estado_acceso: string
}

const SECCIONES = [
  { to: '/',              label: 'Pedidos',           end: true,  soloDueno: false },
  { to: '/menu',          label: 'Menú',              end: false, soloDueno: false },
  { to: '/importar',      label: 'Importar menú',     end: false, soloDueno: true },
  { to: '/logistica',     label: 'Logística',         end: false, soloDueno: false },
  { to: '/zonas',         label: 'Zonas de domicilio', end: false, soloDueno: true },
  { to: '/horarios',      label: 'Horarios',          end: false, soloDueno: true },
  { to: '/clientes',      label: 'Clientes',          end: false, soloDueno: true },
  { to: '/estadisticas',  label: 'Estadísticas',      end: false, soloDueno: true },
  { to: '/usuarios',      label: 'Usuarios',          end: false, soloDueno: true },
  { to: '/configuracion', label: 'Configuración',     end: false, soloDueno: true }
]

export default function Layout({ session }: { session: Session }) {
  const [perfil, setPerfil]   = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => {
    supabase
      .from('usuarios_panel')
      .select('nombre, rol, estado_acceso')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) setPerfil(data as Perfil)
        setCargando(false)
      })
  }, [session.user.id])

  useEffect(() => { setMenuAbierto(false) }, [location.pathname])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAbierto(false)
      }
    }
    if (menuAbierto) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuAbierto])

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  if (cargando) {
    return (
      <div className="min-h-screen grid place-items-center text-mute text-sm">
        Cargando…
      </div>
    )
  }

  const estado = perfil?.estado_acceso ?? 'pendiente'
  if (estado === 'pendiente') return <PantallaEspera onSalir={cerrarSesion} tipo="pendiente" />
  if (estado === 'rechazado') return <PantallaEspera onSalir={cerrarSesion} tipo="rechazado" />

  const esDueno = perfil?.rol === 'dueno'
  const visibles = SECCIONES.filter(s => !s.soloDueno || esDueno)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface/80 backdrop-blur border-b border-line sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuAbierto(v => !v)}
                aria-label="Menú"
                className="w-9 h-9 grid place-items-center rounded-lg hover:bg-canvas transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>

              {menuAbierto && (
                <div className="absolute left-0 top-full mt-2 w-56 bg-surface border border-line rounded-xl shadow-lg overflow-hidden animate-fade z-30">
                  {visibles.map(s => (
                    <NavLink
                      key={s.to}
                      to={s.to}
                      end={s.end}
                      className={({ isActive }) => cn(
                        "block px-4 py-2.5 text-sm font-medium transition-colors",
                        isActive ? "bg-oso-100 text-oso-800" : "text-ink hover:bg-canvas"
                      )}
                    >
                      {s.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xl">🐻</span>
              <span className="font-display font-semibold tracking-tight">Don Oso</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            {perfil && (
              <span className="text-mute hidden sm:inline">
                {perfil.nombre ?? session.user.email} ·{' '}
                <span>{esDueno ? 'Dueño' : 'Empleado'}</span>
              </span>
            )}
            <button onClick={cerrarSesion} className="text-mute hover:text-ink transition-colors">
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        <Outlet />
      </main>
    </div>
  )
}

function PantallaEspera({ onSalir, tipo }: { onSalir: () => void; tipo: 'pendiente' | 'rechazado' }) {
  return (
    <div className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">{tipo === 'pendiente' ? '⏳' : '🚫'}</div>
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
          {tipo === 'pendiente' ? 'Cuenta pendiente de aprobación' : 'Acceso no autorizado'}
        </h1>
        <p className="text-mute text-sm mb-6 leading-relaxed">
          {tipo === 'pendiente'
            ? 'Tu cuenta fue creada y está esperando que el dueño la apruebe. Cuando te den acceso, podrás entrar con tu correo y contraseña.'
            : 'El dueño no autorizó el acceso de esta cuenta al panel. Si crees que es un error, contáctalo.'}
        </p>
        <button onClick={onSalir} className="text-sm text-mute hover:text-ink transition-colors">
          ← Cerrar sesión
        </button>
      </div>
    </div>
  )
}
