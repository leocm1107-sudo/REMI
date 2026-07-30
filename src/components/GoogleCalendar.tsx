// src/components/GoogleCalendar.tsx — Conexión con Google Calendar
// Autocontenido, se monta con una línea:
//   import GoogleCalendar from '../components/GoogleCalendar'
//   <GoogleCalendar />
//
// Lee el estado de la vista `google_calendar_estado`, que NO expone los tokens.
// El handshake lo hace la edge function google-oauth; acá solo mandamos a
// Angélica a la pantalla de Google y mostramos qué cuenta quedó conectada.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// La URL base se saca del propio cliente de Supabase, así no depende de cómo
// se llame la variable de entorno en este proyecto.
const BASE = (supabase as any).supabaseUrl
  ?? (import.meta as any).env?.VITE_SUPABASE_URL
  ?? ''
const FUNCIONES = `${BASE}/functions/v1`

type Estado = {
  restaurante_id: string
  email: string | null
  calendar_id: string | null
  conectado_at: string | null
  updated_at: string | null
  tiene_refresh: boolean
}

export default function GoogleCalendar() {
  const [restId, setRestId] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  async function refrescar(rid: string) {
    const { data } = await supabase.from('google_calendar_estado')
      .select('*').eq('restaurante_id', rid).maybeSingle()
    setEstado((data as Estado) ?? null)
  }

  useEffect(() => {
    async function cargar() {
      const { data: cat } = await supabase.from('categorias').select('restaurante_id').limit(1).maybeSingle()
      const rid = (cat as any)?.restaurante_id ?? null
      setRestId(rid)
      if (rid) await refrescar(rid)
      setCargando(false)

      // Al volver del handshake, google-oauth redirige con ?google=ok
      if (new URLSearchParams(window.location.search).get('google') === 'ok') {
        setMsg({ ok: true, texto: 'Calendario conectado. La primera sincronización corre en unos minutos.' })
      }
    }
    cargar()
  }, [])

  function conectar() {
    if (!restId) return
    // Mandamos el origen de ESTE panel para que Google nos devuelva acá y no
    // al panel de otro restaurante.
    const panel = encodeURIComponent(window.location.origin)
    window.location.href = `${FUNCIONES}/google-oauth?restaurante_id=${restId}&panel=${panel}`
  }

  async function sincronizarAhora() {
    if (!restId) return
    setSincronizando(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { restaurante_id: restId },
    })
    setSincronizando(false)

    if (error) { setMsg({ ok: false, texto: 'No se pudo sincronizar: ' + error.message }); return }

    const r = (data as any)?.resumen?.[0]
    if (r?.error === 'sin_token') {
      await refrescar(restId)
      setMsg({ ok: false, texto: 'Google pidió permiso de nuevo. Volvé a conectar la cuenta.' })
      return
    }
    setMsg({
      ok: true,
      texto: `Listo: ${r?.importados ?? 0} bloqueo(s) desde tu calendario, ` +
             `${r?.borrados ?? 0} liberado(s), ${r?.creados ?? 0} pedido(s) agregado(s) como evento.`,
    })
    await refrescar(restId)
  }

  async function desconectar() {
    if (!restId) return
    if (!confirm('Se corta la conexión con Google Calendar. Los bloqueos que vinieron de tus reuniones se dejan de actualizar. ¿Seguimos?')) return
    const { error } = await supabase.from('google_calendar_conexion').delete().eq('restaurante_id', restId)
    if (error) { setMsg({ ok: false, texto: error.message }); return }
    setEstado(null)
    setMsg({ ok: true, texto: 'Calendario desconectado.' })
  }

  const conectado = !!estado?.tiene_refresh

  return (
    <section className="bg-surface border border-line rounded-xl p-5">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Google Calendar</h2>
        <p className="text-xs text-mute mt-0.5">
          Tus reuniones bloquean las franjas de entrega, y cada pedido confirmado
          aparece como evento en tu calendario.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm mb-4 border ${
          msg.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {msg.texto}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-mute">Cargando…</p>
      ) : !conectado ? (
        <div className="space-y-3">
          <p className="text-sm text-mute leading-relaxed">
            Al conectar tu cuenta, todo lo que tengas marcado como ocupado deja de
            ofrecerse como hora de entrega. Lo que marques “Disponible” en Google no
            bloquea nada.
          </p>
          <button onClick={conectar} disabled={!restId}
            className="bg-oso-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors">
            Conectar Google Calendar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-canvas rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-600 shrink-0" />
              <p className="text-sm font-medium">{estado?.email ?? 'Cuenta de Google'}</p>
            </div>
            <p className="text-xs text-mute mt-1">
              Calendario: {estado?.calendar_id ?? 'principal'}
              {estado?.updated_at && ` · última sincronización ${new Date(estado.updated_at).toLocaleString('es-CO')}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={sincronizarAhora} disabled={sincronizando}
              className="bg-oso-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors">
              {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
            <button onClick={conectar}
              className="text-sm text-oso-700 hover:text-oso-900 underline decoration-dotted">
              Cambiar de cuenta
            </button>
            <button onClick={desconectar}
              className="text-sm text-mute hover:text-red-600 underline decoration-dotted">
              Desconectar
            </button>
          </div>

          <p className="text-[11px] text-mute">
            Se sincroniza solo cada 15 minutos, 60 días hacia adelante.
          </p>
        </div>
      )}
    </section>
  )
}
