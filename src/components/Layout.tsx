import { Outlet, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'
import type { PerfilUsuario } from '../lib/types'

export default function Layout({ session }: { session: Session }) {
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)

  useEffect(() => {
    supabase
      .from('usuarios_panel')
      .select('nombre, rol')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) setPerfil(data as PerfilUsuario)
      })
  }, [session.user.id])

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  const esDueno = perfil?.rol === 'dueno'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface/80 backdrop-blur border-b border-line sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐻</span>
              <span className="font-display font-semibold tracking-tight">Don Oso</span>
            </div>
            <nav className="flex items-center gap-0.5">
              <NavTab to="/" end>Pedidos</NavTab>
              <NavTab to="/menu">Menú</NavTab>
              <NavTab to="/logistica">Logística</NavTab>
              {esDueno && <NavTab to="/usuarios">Usuarios</NavTab>}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {perfil && (
              <span className="text-mute hidden sm:inline">
                {perfil.nombre ?? session.user.email} ·{' '}
                <span>{perfil.rol === 'dueno' ? 'Dueño' : 'Empleado'}</span>
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

function NavTab({ to, children, end = false }: { to: string; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
        isActive
          ? "bg-oso-100 text-oso-800"
          : "text-mute hover:text-ink hover:bg-canvas"
      )}
    >
      {children}
    </NavLink>
  )
}
