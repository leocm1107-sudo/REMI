import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Estado = 'idle' | 'enviando' | 'enviado' | 'error'

export default function Login() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<Estado>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function enviarMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setEstado('enviando')
    setErrMsg('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    })
    if (error) {
      setEstado('error')
      setErrMsg(error.message)
    } else {
      setEstado('enviado')
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-canvas px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <span className="text-2xl">🐻</span>
          <span className="font-display font-semibold text-xl tracking-tight">Don Oso · Panel</span>
        </div>

        <div className="bg-surface border border-line rounded-xl p-7">
          <h1 className="font-display text-2xl font-semibold mb-1.5 tracking-tight">
            Entra al panel
          </h1>
          <p className="text-mute text-sm mb-6">
            Te enviamos un enlace al correo. Sin contraseñas.
          </p>

          {estado === 'enviado' ? (
            <div className="text-sm bg-oso-50 border border-oso-200 text-oso-800 rounded-lg p-4">
              <div className="font-medium mb-1">Revisa tu correo</div>
              Te llegó un enlace a <strong>{email}</strong>. Ábrelo desde el mismo dispositivo.
            </div>
          ) : (
            <form onSubmit={enviarMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Correo</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 border border-line rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-oso-300 focus:border-oso-400 transition-colors"
                  placeholder="tu@correo.com"
                />
              </div>

              <button
                type="submit"
                disabled={estado === 'enviando' || !email}
                className="w-full bg-oso-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-oso-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {estado === 'enviando' ? 'Enviando…' : 'Enviar enlace'}
              </button>

              {errMsg && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {errMsg}
                </div>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-xs text-mute mt-6">
          Si es tu primera vez, pide al dueño que te invite.
        </p>
      </div>
    </div>
  )
}
