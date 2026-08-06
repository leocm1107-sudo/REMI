// src/components/SoloDueno.tsx
//
// Guarda de ruta para las pantallas que son del dueño.
//
// Hasta ahora `soloDueno` en Layout controlaba únicamente si la sección
// APARECÍA en el menú. Las rutas estaban todas registradas sin condición,
// así que un empleado que escribiera /configuracion o /clientes en la barra
// de direcciones renderizaba la pantalla, y lo único que lo separaba de los
// datos era RLS. Eso deja una sola defensa: cualquier política que quede
// corta se convierte en fuga inmediata, y ahí adentro está la lista de
// clientes, el teléfono del jefe y las tarifas.
//
// Esto no reemplaza a RLS —la base sigue siendo la autoridad— pero suma la
// segunda capa, que es lo que faltaba. Admin.tsx ya lo hacía bien con
// es_superadmin; acá se aplica el mismo patrón a las otras cuatro.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SoloDueno({ children }: { children: React.ReactNode }) {
  const [permitido, setPermitido] = useState<boolean | null>(null)

  useEffect(() => {
    let vivo = true
    supabase.rpc('mi_rol').then(({ data }) => {
      if (!vivo) return
      setPermitido(data === 'dueno' || data === 'superadmin')
    })
    return () => { vivo = false }
  }, [])

  if (permitido === null) {
    return <p className="text-mute text-sm py-12 text-center">Cargando…</p>
  }

  if (!permitido) {
    return (
      <div className="py-16 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="font-display text-xl font-semibold tracking-tight mb-2">
          Esta sección es del dueño
        </h1>
        <p className="text-mute text-sm mb-6">
          Tu cuenta no tiene acceso a esta parte del panel.
        </p>
        <Link to="/" className="text-sm underline text-mute hover:text-ink transition-colors">
          ← Volver
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
