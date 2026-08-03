// src/pages/Admin.tsx — Panel de control de la plataforma
//
// Solo lo ve quien esté en plataforma_admins. Desde acá se prenden y apagan
// los módulos de cada negocio, se pausa un cliente entero, y se puede entrar
// al panel "como" un cliente para ver exactamente lo que ve él.
//
// Los módulos son los mismos que lee el bot en cfg.features y el menú lateral
// en Layout.tsx. No hay catálogo en la base a propósito: cada interruptor
// existe porque hay código detrás, así que la lista vive junto al código.
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Negocio = {
  id: string
  nombre: string
  activo: boolean
  plan: string | null
  tipo: string | null
  logo_emoji: string | null
  color_primario: string | null
  phone_number_id: string | null
  tiene_token: boolean
  features: Record<string, boolean>
  usuarios: number
  productos: number
  pedidos_30d: number
}

type Modulo = { clave: string; label: string; desc: string }

const MODULOS: { grupo: string; items: Modulo[] }[] = [
  {
    grupo: 'Venta',
    items: [
      { clave: 'pedidos', label: 'Pedidos', desc: 'Carrito y creación de pedidos. Apagado, el bot solo responde preguntas.' },
      { clave: 'catalogo', label: 'Catálogo de WhatsApp', desc: 'Botón que abre el catálogo con fotos dentro del chat.' },
      { clave: 'stock', label: 'Control de inventario', desc: 'Frena el pedido si no alcanza la existencia.' },
      { clave: 'personalizacion', label: 'Pedidos a medida', desc: 'Fotos de referencia y cotización con el dueño antes de cerrar.' },
    ],
  },
  {
    grupo: 'Agenda',
    items: [
      { clave: 'agendamiento', label: 'Entregas con fecha', desc: 'Franjas horarias y encargos con anticipación.' },
      { clave: 'agenda_servicios', label: 'Citas por persona', desc: 'Bloques de duración contra la agenda de cada empleada.' },
      { clave: 'cambios_cliente', label: 'Cambios por el cliente', desc: 'Deja que el cliente pida mover su pedido desde el chat.' },
    ],
  },
  {
    grupo: 'Entrega',
    items: [
      { clave: 'domicilio', label: 'Domicilio', desc: 'Entrega a domicilio y cobro del envío.' },
      { clave: 'maps', label: 'Distancia y zonas', desc: 'Geocodifica direcciones, cobra por distancia y veta barrios.' },
    ],
  },
  {
    grupo: 'Canal',
    items: [
      { clave: 'voz', label: 'Notas de voz', desc: 'Transcribe los audios que manda el cliente.' },
      { clave: 'pagos_ia', label: 'Lectura de comprobantes', desc: 'Lee la foto de la transferencia y registra el pago.' },
      { clave: 'aviso_jefe', label: 'Avisos al dueño', desc: 'Le manda cada pedido y cada consulta por WhatsApp.' },
    ],
  },
]

export default function Admin({ session }: { session: Session }) {
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [negocios, setNegocios] = useState<Negocio[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [viendoComo, setViendoComo] = useState<string | null>(null)

  async function cargar() {
    const { data } = await supabase.rpc('admin_negocios')
    setNegocios((data ?? []) as Negocio[])
    const { data: mio } = await supabase
      .from('plataforma_admins').select('restaurante_activo')
      .eq('user_id', session.user.id).maybeSingle()
    setViendoComo((mio as any)?.restaurante_activo ?? null)
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('es_superadmin')
      const ok = data === true
      setAutorizado(ok)
      if (ok) cargar()
    })()
  }, [session.user.id])

  async function alternar(n: Negocio, clave: string, valor: boolean) {
    setGuardando(`${n.id}:${clave}`)
    // Optimista: el interruptor responde de una, y si falla se revierte
    setNegocios(prev => prev.map(x =>
      x.id === n.id ? { ...x, features: { ...x.features, [clave]: valor } } : x))
    const { data } = await supabase.rpc('admin_set_feature', {
      p_restaurante_id: n.id, p_clave: clave, p_valor: valor,
    })
    if ((data as any)?.ok !== true) {
      setNegocios(prev => prev.map(x =>
        x.id === n.id ? { ...x, features: { ...x.features, [clave]: !valor } } : x))
      alert('No se pudo guardar el cambio.')
    }
    setGuardando(null)
  }

  async function pausar(n: Negocio) {
    const msg = n.activo
      ? `Pausar ${n.nombre}? El bot deja de responder y nadie del equipo puede entrar al panel.`
      : `Reactivar ${n.nombre}?`
    if (!confirm(msg)) return
    await supabase.rpc('admin_set_activo', { p_restaurante_id: n.id, p_activo: !n.activo })
    cargar()
  }

  async function verComo(id: string | null) {
    await supabase.rpc('admin_ver_como', { p_restaurante_id: id })
    // El panel entero cuelga de obtener_restaurante_actual(): hay que recargar
    window.location.href = '/'
  }

  if (autorizado === null) {
    return <p className="text-mute text-sm">Verificando…</p>
  }
  if (!autorizado) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <p className="text-sm text-mute">Esta sección es solo para administradores de la plataforma.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Plataforma</h1>
        <p className="text-mute text-sm">
          {negocios.length} negocio{negocios.length === 1 ? '' : 's'} ·{' '}
          {negocios.filter(n => n.activo).length} activo{negocios.filter(n => n.activo).length === 1 ? '' : 's'}
        </p>
      </div>

      {viendoComo && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-amber-900">
            Estás viendo el panel como{' '}
            <strong>{negocios.find(n => n.id === viendoComo)?.nombre ?? 'otro negocio'}</strong>.
          </span>
          <button onClick={() => verComo(null)}
            className="text-sm underline text-amber-900">Volver a lo mío</button>
        </div>
      )}

      <div className="space-y-3">
        {negocios.map(n => {
          const activos = MODULOS.flatMap(g => g.items).filter(m => n.features?.[m.clave] === true).length
          const listo = n.tiene_token && n.phone_number_id && !n.phone_number_id.startsWith('PENDIENTE') && !n.phone_number_id.startsWith('TEST')
          return (
            <div key={n.id} className="rounded-xl border border-line overflow-hidden">
              <button
                onClick={() => setAbierto(abierto === n.id ? null : n.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-canvas transition-colors"
              >
                <span className="w-8 h-8 rounded-full grid place-items-center text-base shrink-0"
                  style={{ background: (n.color_primario ?? '#888') + '22' }}>
                  {n.logo_emoji ?? '🏪'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{n.nombre}</span>
                    {!n.activo && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Pausado</span>
                    )}
                    {!listo && n.activo && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Sin canal</span>
                    )}
                  </div>
                  <div className="text-[11px] text-mute">
                    {activos} módulo{activos === 1 ? '' : 's'} · {n.productos} productos ·{' '}
                    {n.pedidos_30d} pedidos en 30 días · {n.usuarios} usuario{n.usuarios === 1 ? '' : 's'}
                  </div>
                </div>
                <span className="text-mute text-sm shrink-0">{abierto === n.id ? '▴' : '▾'}</span>
              </button>

              {abierto === n.id && (
                <div className="px-4 pb-4 border-t border-line pt-3 space-y-4">
                  {MODULOS.map(g => (
                    <div key={g.grupo}>
                      <h4 className="text-[11px] uppercase tracking-wide text-mute mb-2">{g.grupo}</h4>
                      <div className="space-y-2">
                        {g.items.map(m => {
                          const on = n.features?.[m.clave] === true
                          const busy = guardando === `${n.id}:${m.clave}`
                          return (
                            <label key={m.clave}
                              className="flex items-start gap-3 cursor-pointer group">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => alternar(n, m.clave, !on)}
                                role="switch"
                                aria-checked={on}
                                aria-label={m.label}
                                className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${
                                  on ? 'bg-oso-800' : 'bg-line'
                                } ${busy ? 'opacity-50' : ''}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                                  on ? 'left-[18px]' : 'left-0.5'
                                }`} />
                              </button>
                              <span className="min-w-0">
                                <span className={`block text-sm ${on ? 'text-ink' : 'text-mute'}`}>{m.label}</span>
                                <span className="block text-[11px] text-mute leading-snug">{m.desc}</span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="pt-2 border-t border-line flex items-center gap-2 flex-wrap">
                    <button onClick={() => verComo(n.id)}
                      className="px-3 py-1.5 rounded-lg bg-oso-100 text-oso-800 hover:bg-oso-200 text-sm">
                      Ver su panel
                    </button>
                    <button onClick={() => pausar(n)}
                      className={`px-3 py-1.5 rounded-lg text-sm ${
                        n.activo ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                 : 'bg-green-50 text-green-700 hover:bg-green-100'
                      }`}>
                      {n.activo ? 'Pausar negocio' : 'Reactivar'}
                    </button>
                    <span className="text-[11px] text-mute ml-auto">
                      {n.phone_number_id ?? 'sin número'} · {n.tiene_token ? 'con token' : 'sin token'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
