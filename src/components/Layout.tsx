import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'
import { useMarca, useVocab, RESTAURANTE_ID } from '../lib/tema'
import type { Vocab } from '../lib/vocabulario'

type Perfil = {
  nombre: string | null
  rol: 'dueno' | 'empleado'
  estado_acceso: string
}

// Las etiquetas salen del vocabulario del negocio: en un salón el menú
// lateral dice Citas y Servicios, no Pedidos y Menú.
//
// Dos formas distintas de condicionar una sección, y la diferencia importa:
//   feature  → se muestra SOLO si la clave está en true. Para módulos que
//              son la excepción (agenda de citas, personalizadas).
//   ocultaSi → se muestra SIEMPRE salvo que la clave esté explícitamente
//              en false. Para lo que casi todos tienen (domicilio), donde
//              exigir la clave le borraría la sección a quien nunca la
//              declaró.
type Seccion = {
  to: string
  label: string
  end: boolean
  soloDueno: boolean
  feature?: string
  ocultaSi?: string
}

const seccionesDe = (V: Vocab): Seccion[] => [
  { to: '/',               label: V.Pedidos,             end: true,  soloDueno: false, ocultaSi: 'panel_pedidos' },
  { to: '/personalizados', label: 'Personalizadas',      end: false, soloDueno: false, feature: 'personalizacion', ocultaSi: 'panel_personalizados' },
  { to: '/menu',           label: V.Productos,           end: false, soloDueno: false, ocultaSi: 'panel_menu' },
  { to: '/importar',       label: `Importar ${V.carta}`, end: false, soloDueno: true,  ocultaSi: 'importar_carta' },
  { to: '/agenda',         label: 'Agenda',              end: false, soloDueno: false, feature: 'agendamiento' },
  { to: '/citas',          label: 'Agenda',              end: false, soloDueno: false, feature: 'agenda_servicios' },
  { to: '/logistica',      label: 'Logística',           end: false, soloDueno: false, ocultaSi: 'panel_logistica' },
  { to: '/zonas',          label: 'Zonas de domicilio',  end: false, soloDueno: true,  ocultaSi: 'domicilio' },
  { to: '/clientes',       label: V.Clientes,            end: false, soloDueno: true,  ocultaSi: 'panel_clientes' },
  { to: '/usuarios',       label: 'Usuarios',            end: false, soloDueno: true,  ocultaSi: 'panel_usuarios' },
  { to: '/configuracion',  label: 'Configuración',       end: false, soloDueno: true,  ocultaSi: 'panel_configuracion' },
]

export default function Layout({ session }: { session: Session }) {
  const [perfil, setPerfil]   = useState<Perfil | null>(null)
  const [esSuperadmin, setEsSuperadmin] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const marca = useMarca()
  const V = useVocab()
  

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

  // Plataforma: solo para quien esté en plataforma_admins.
  //
  // Y algo más: el tema sale de VITE_RESTAURANTE_ID (build) pero los datos
  // salen de obtener_restaurante_actual(), que para un superadmin devuelve
  // restaurante_activo. Si venía "viendo como" otro negocio y entra a este
  // sitio, vería la marca de uno con los datos del otro. Entrar a un panel
  // ES mirar ese negocio, así que se alinea solo.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('es_superadmin')
      if (data !== true) { setEsSuperadmin(false); return }
      setEsSuperadmin(true)

      const { data: yo } = await supabase.from('plataforma_admins')
        .select('restaurante_activo').eq('user_id', session.user.id).maybeSingle()
      if (RESTAURANTE_ID && (yo as any)?.restaurante_activo !== RESTAURANTE_ID) {
        await supabase.rpc('admin_ver_como', { p_restaurante_id: RESTAURANTE_ID })
        window.location.reload()   // los datos ya cargados son del negocio anterior
      }
    })()
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
  const F = marca.features ?? {}
  const visibles: Seccion[] = [
    ...seccionesDe(V).filter(s =>
      (!s.soloDueno || esDueno) &&
      (!s.feature  || F[s.feature] === true) &&
      (!s.ocultaSi || F[s.ocultaSi] !== false)
    ),
    ...(esSuperadmin
      ? [{ to: '/admin', label: 'Plataforma', end: false, soloDueno: false }]
      : []),
  ]

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
              {marca.logo_url
                ? <img src={marca.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                : <span className="text-xl">{marca.logo_emoji}</span>}
              <span className="font-display font-semibold tracking-tight">{marca.nombre}</span>
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
