import { useState } from 'react'
import { supabase } from '../lib/supabase'
import PantallaMarca from '../components/PantallaMarca'

type Modo = 'login' | 'registro' | 'recuperar'

// El restaurante al que pertenece ESTE panel (cada restaurante despliega el suyo)
const RESTAURANTE_ID = import.meta.env.VITE_RESTAURANTE_ID as string

export default function Login() {
  const [modo, setModo]         = useState<Modo>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre]     = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError]       = useState('')
  const [aviso, setAviso]       = useState('')

  function limpiar() { setError(''); setAviso('') }

  async function iniciarSesion() {
    limpiar()
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
      if (error.message.toLowerCase().includes('invalid login')) {
        setError('Correo o contraseña incorrectos')
      } else if (error.message.toLowerCase().includes('email not confirmed')) {
        setError('Tu cuenta no está confirmada todavía.')
      } else {
        setError(error.message)
      }
    }
  }

  async function registrarse() {
    limpiar()
    if (!nombre.trim()) { setError('Escribe tu nombre'); return }
    if (!email.trim()) { setError('Escribe tu correo'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (!RESTAURANTE_ID) {
      setError('Este panel no tiene restaurante configurado. Avísale al administrador.')
      return
    }

    setCargando(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // El trigger del servidor lee estos datos. NO mandamos rol:
        // el rol siempre lo fija el servidor como 'empleado'.
        data: {
          nombre: nombre.trim(),
          restaurante_id: RESTAURANTE_ID
        }
      }
    })
    setCargando(false)

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        setError('Ese correo ya tiene cuenta. Intenta iniciar sesión.')
      } else {
        setError(error.message)
      }
      return
    }

    if (data.session) {
      // Registro inmediato (sin confirmación de correo): el App entra solo.
    } else {
      setAviso('¡Cuenta creada! Si te pide confirmar el correo, revisa tu bandeja. Si no, ya puedes iniciar sesión.')
      setModo('login')
    }
  }

  async function recuperarContrasena() {
    limpiar()
    if (!email.trim()) {
      setError('Escribe tu correo para enviarte el enlace')
      return
    }
    setCargando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/restablecer'
    })
    setCargando(false)
    if (error) setError(error.message)
    else setAviso('Te enviamos un correo con el enlace para restablecer tu contraseña.')
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (modo === 'login') iniciarSesion()
    else if (modo === 'registro') registrarse()
    else recuperarContrasena()
  }

  const titulo =
    modo === 'login' ? 'Panel de administración' :
    modo === 'registro' ? 'Crear cuenta' :
    'Recuperar contraseña'

  const textoBoton =
    cargando ? 'Un momento…' :
    modo === 'login' ? 'Entrar' :
    modo === 'registro' ? 'Crear cuenta' :
    'Enviar enlace'

  return (
    <PantallaMarca subtitulo={titulo}>
          <form onSubmit={onSubmit} className="space-y-4">
            {modo === 'registro' && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                  Tu nombre
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  autoComplete="name"
                  placeholder="Ej. Carlos"
                  className="w-full px-3 py-2.5 bg-white border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400"
                />
              </div>
            )}

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

            {modo !== 'recuperar' && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
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
              {textoBoton}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            {modo === 'login' && (
              <>
                <div>
                  <button
                    onClick={() => { setModo('registro'); limpiar() }}
                    className="text-sm text-oso-600 hover:underline font-medium"
                  >
                    Crear una cuenta nueva
                  </button>
                </div>
                <div>
                  <button
                    onClick={() => { setModo('recuperar'); limpiar() }}
                    className="text-sm text-mute hover:text-ink transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </>
            )}
            {modo !== 'login' && (
              <button
                onClick={() => { setModo('login'); limpiar() }}
                className="text-sm text-mute hover:text-ink transition-colors"
              >
                ← Volver al inicio de sesión
              </button>
            )}
          </div>

          {modo === 'registro' && (
            <p className="text-center text-xs text-mute mt-6">
              Tu cuenta se crea como empleado. El dueño puede darte más permisos después.
            </p>
          )}
    </PantallaMarca>
  )
}
