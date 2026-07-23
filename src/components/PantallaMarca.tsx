// src/components/PantallaMarca.tsx
// Envoltorio visual para las pantallas SIN sesión (login, restablecer).
// Si el restaurante tiene imagen_fondo_url, la usa como fondo con un velo
// para que el formulario siga siendo legible. Si no, cae al color de marca.
import type { ReactNode } from 'react'
import { useMarca } from '../lib/tema'

export default function PantallaMarca({
  subtitulo,
  children,
}: {
  subtitulo?: string
  children: ReactNode
}) {
  const marca = useMarca()
  const conFoto = Boolean(marca.imagen_fondo_url)

  return (
    <div
      className="min-h-screen grid place-items-center px-4 py-10 bg-canvas bg-cover bg-center"
      style={conFoto ? { backgroundImage: `url(${marca.imagen_fondo_url})` } : undefined}
    >
      {/* Velo: sin él, el texto sobre una foto clara se vuelve ilegible */}
      {conFoto && <div className="fixed inset-0 bg-canvas/70 backdrop-blur-[2px]" aria-hidden />}

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          {marca.logo_url ? (
            <img
              src={marca.logo_url}
              alt=""
              className="h-20 w-20 mx-auto mb-3 rounded-2xl object-cover shadow-sm ring-1 ring-black/5"
            />
          ) : (
            <div className="text-4xl mb-2">{marca.logo_emoji}</div>
          )}
          <h1 className="font-display text-2xl font-semibold tracking-tight">{marca.nombre}</h1>
          {subtitulo && <p className="text-mute text-sm mt-1">{subtitulo}</p>}
        </div>

        <div className="bg-surface/95 backdrop-blur border border-line rounded-2xl p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  )
}
