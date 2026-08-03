import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Restablecer from './pages/Restablecer'
import Pedidos from './pages/Pedidos'
import Menu from './pages/Menu'
import ImportarMenu from './pages/ImportarMenu'
import Logistica from './pages/Logistica'
import ZonasDomicilio from './pages/ZonasDomicilio'
import Clientes from './pages/Clientes'
import Usuarios from './pages/Usuarios'
import Configuracion from './pages/Configuracion'
import Layout from './components/Layout'
import Agenda from './pages/Agenda'
import Personalizados from './pages/Personalizados'
import Citas from './pages/Citas'
import Admin from './pages/Admin'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recuperando, setRecuperando] = useState(false)
  const [estadoAcceso, setEstadoAcceso] = useState<string | null>(null)
  const [verificandoAcceso, setVerificandoAcceso] = useState(false)

  const verificarAcceso = async () => {
    setVerificandoAcceso(true)
    const { data, error } = await supabase.rpc('mi_estado_acceso')
    setEstadoAcceso(error ? 'pendiente' : (data as string))
    setVerificandoAcceso(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      if (data.session) verificarAcceso()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        setRecuperando(true)
      }
      if (s) {
        verificarAcceso()
      } else {
        setEstadoAcceso(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const enRutaRestablecer =
    typeof window !== 'undefined' && window.location.pathname === '/restablecer'

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-mute text-sm">
        Cargando…
      </div>
    )
  }

  if (recuperando || enRutaRestablecer) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/restablecer" element={<Restablecer />} />
          <Route path="*" element={<Restablecer />} />
        </Routes>
      </BrowserRouter>
    )
  }

  if (!session) return <Login />

  if (verificandoAcceso || estadoAcceso === null) {
    return (
      <div className="min-h-screen grid place-items-center text-mute text-sm">
        Verificando acceso…
      </div>
    )
  }

  if (estadoAcceso !== 'aprobado') {
    const mensaje =
      estadoAcceso === 'rechazado'
        ? 'Tu acceso a este panel fue rechazado. Contacta al dueño del restaurante si crees que es un error.'
        : 'Tu cuenta está pendiente de aprobación. El dueño del restaurante debe aprobarte antes de que puedas entrar.'
    return (
      <div className="min-h-screen grid place-items-center text-center px-4">
        <div className="max-w-sm space-y-4">
          <p className="text-sm text-mute">{mensaje}</p>
          <button
            className="text-sm underline text-mute"
            onClick={() => supabase.auth.signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout session={session} />}>
          <Route index element={<Pedidos session={session} />} />
          <Route path="personalizados" element={<Personalizados session={session} />} />
          <Route path="menu" element={<Menu session={session} />} />
          <Route path="importar" element={<ImportarMenu session={session} />} />
          <Route path="agenda" element={<Agenda session={session} />} />
          <Route path="citas" element={<Citas session={session} />} />
          <Route path="admin" element={<Admin session={session} />} />
          <Route path="logistica" element={<Logistica session={session} />} />
          <Route path="zonas" element={<ZonasDomicilio session={session} />} />
          <Route path="clientes" element={<Clientes session={session} />} />
          <Route path="usuarios" element={<Usuarios session={session} />} />
          <Route path="configuracion" element={<Configuracion session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
