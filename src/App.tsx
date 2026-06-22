import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Restablecer from './pages/Restablecer'
import Pedidos from './pages/Pedidos'
import Menu from './pages/Menu'
import Logistica from './pages/Logistica'
import Clientes from './pages/Clientes'
import Usuarios from './pages/Usuarios'
import Layout from './components/Layout'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        setRecuperando(true)
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

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout session={session} />}>
          <Route index element={<Pedidos session={session} />} />
          <Route path="menu" element={<Menu session={session} />} />
          <Route path="logistica" element={<Logistica session={session} />} />
          <Route path="clientes" element={<Clientes session={session} />} />
          <Route path="usuarios" element={<Usuarios session={session} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
