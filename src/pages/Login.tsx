import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Modo = 'login' | 'recuperar'

export default function Login() {
  const [modo, setModo]         = useState<Modo>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError]       = useState('')
  const [aviso, setAviso]       = useState('')

  async function iniciarSesion() {
    setError('')
    setAviso('')
    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña')
      return
    }
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })
    setCargando(false)
    if (error) {
      // Mensajes más claros para los casos comunes
      if (error.message.toLowerCase().includes('invalid login')) {
        setError('Correo o contraseña incorrectos')
      } else if (error.message.toLowerCase().includes('email not confirmed')) {
        setError('Tu cuenta no está confirmada. Pídele al administrador que la active.')
      } else {
        setError(error.message)
      }
    }
    // Si entra bien, el onAuthStateChange del App detecta la sesión solo
  }

  async function recuperarContrasena() {
    setError('')
    setAviso('')
    if (!email.trim()) {
      setError('Escribe tu correo para enviarte el enlace de recuperación')
      return
    }
    setCargando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/restablecer'
    })
    setCargando(false)
    if (error) {
      setError(error.message)
    } else {
      setAviso('Te enviamos un correo con el enlace para restablecer tu contraseña. Revisa tu bandeja.')
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (modo === 'login') iniciarSesion()
    else recuperarContrasena()
  }

  return (
    <div className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🐻</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Don Oso</h1>
          <p className="text-mute text-sm mt-1">Panel de administración</p>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                Correo
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="tucorreo@ejemplo.com"
                className="w-full px-3 py-2.5 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
              />
            </div>

            {modo === 'login' && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}
            {aviso && (
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">
                {aviso}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-oso-600 text-white py-2.5 rounded-lg font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
            >
              {cargando
                ? 'Un momento…'
                : modo === 'login' ? 'Entrar' : 'Enviar enlace de recuperación'}
            </button>
          </form>

          <div className="mt-4 text-center">
            {modo === 'login' ? (
              <button
                onClick={() => { setModo('recuperar'); setError(''); setAviso('') }}
                className="text-sm text-mute hover:text-ink transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            ) : (
              <button
                onClick={() => { setModo('login'); setError(''); setAviso('') }}
                className="text-sm text-mute hover:text-ink transition-colors"
              >
                ← Volver al inicio de sesión
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-mute mt-6">
          ¿No tienes cuenta? Pídele acceso al administrador.
        </p>
      </div>
    </div>
  )
}
