import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PantallaMarca from '../components/PantallaMarca'

export default function Restablecer() {
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')
  const [cargando, setCargando]   = useState(false)
  const [error, setError]         = useState('')
  const [listo, setListo]         = useState(false)
  const [sesionValida, setSesionValida] = useState<boolean | null>(null)

  // Al llegar desde el correo, Supabase pone una sesión temporal de recuperación
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesionValida(!!data.session)
    })
  }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden')
      return
    }
    setCargando(true)
    const { error } = await supabase.auth.updateUser({ password })
    setCargando(false)
    if (error) {
      setError(error.message)
    } else {
      setListo(true)
      // Tras 2s, el cambio de sesión lleva al panel solo
    }
  }

  return (
    <PantallaMarca subtitulo="Nueva contraseña">
          {sesionValida === false ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-ink">
                Este enlace no es válido o ya expiró.
              </p>
              <a href="/" className="inline-block text-sm text-oso-600 hover:underline">
                Volver al inicio de sesión
              </a>
            </div>
          ) : listo ? (
            <div className="text-center space-y-3">
              <div className="text-3xl">✓</div>
              <p className="text-sm text-ink font-medium">Contraseña actualizada</p>
              <a href="/" className="inline-block text-sm text-oso-600 hover:underline">
                Ir al panel
              </a>
            </div>
          ) : (
            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                  Repite la contraseña
                </label>
                <input
                  type="password"
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="w-full bg-oso-600 text-white py-2.5 rounded-lg font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
              >
                {cargando ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}
        </PantallaMarca>
  )
}
