import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type ConfigForm = {
  nombre: string
  direccion: string
  ciudad: string
  lat: string
  lng: string
  telefono_publico: string
  telefono_jefe: string
  domicilio_tarifa_plana: string
  domicilio_cobertura: string
  domicilio_minimo_pedido: string
  nombre_bot: string
  tono_bot: string
  mensaje_bienvenida: string
}

const VACIO: ConfigForm = {
  nombre: '', direccion: '', ciudad: '', lat: '', lng: '',
  telefono_publico: '', telefono_jefe: '',
  domicilio_tarifa_plana: '', domicilio_cobertura: '', domicilio_minimo_pedido: '',
  nombre_bot: '', tono_bot: '', mensaje_bienvenida: ''
}

export default function Configuracion({ session: _session }: { session: Session }) {
  const [form, setForm]         = useState<ConfigForm>(VACIO)
  const [original, setOriginal] = useState<ConfigForm>(VACIO)
  const [cargando, setCargando] = useState(true)
  const [noAutorizado, setNoAutorizado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)

  useEffect(() => {
    let activo = true
    async function cargar() {
      const { data, error } = await supabase.rpc('obtener_config_general')
      if (!activo) return
      if (error) {
        setNoAutorizado(true)
        setCargando(false)
        return
      }
      const d = data as any
      const cargado: ConfigForm = {
        nombre:                  d.nombre ?? '',
        direccion:               d.direccion ?? '',
        ciudad:                  d.ciudad ?? '',
        lat:                     d.lat != null ? String(d.lat) : '',
        lng:                     d.lng != null ? String(d.lng) : '',
        telefono_publico:        d.telefono_publico ?? '',
        telefono_jefe:           d.telefono_jefe ?? '',
        domicilio_tarifa_plana:  d.domicilio_tarifa_plana != null ? String(d.domicilio_tarifa_plana) : '',
        domicilio_cobertura:     d.domicilio_cobertura ?? '',
        domicilio_minimo_pedido: d.domicilio_minimo_pedido != null ? String(d.domicilio_minimo_pedido) : '',
        nombre_bot:              d.nombre_bot ?? '',
        tono_bot:                d.tono_bot ?? '',
        mensaje_bienvenida:      d.mensaje_bienvenida ?? ''
      }
      setForm(cargado)
      setOriginal(cargado)
      setCargando(false)
    }
    cargar()
    return () => { activo = false }
  }, [])

  function set<K extends keyof ConfigForm>(campo: K, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }))
    setGuardado(false)
  }

  const hayCambios = JSON.stringify(form) !== JSON.stringify(original)

  async function guardar() {
    setGuardando(true)
    setGuardado(false)
    const { error } = await supabase.rpc('guardar_config_general', {
      p_nombre:                  form.nombre.trim(),
      p_direccion:               form.direccion.trim() || null,
      p_ciudad:                  form.ciudad.trim() || null,
      p_lat:                     form.lat.trim() ? Number(form.lat) : null,
      p_lng:                     form.lng.trim() ? Number(form.lng) : null,
      p_telefono_publico:        form.telefono_publico.trim() || null,
      p_telefono_jefe:           form.telefono_jefe.trim() || null,
      p_domicilio_tarifa_plana:  form.domicilio_tarifa_plana.trim() ? parseInt(form.domicilio_tarifa_plana, 10) : null,
      p_domicilio_cobertura:     form.domicilio_cobertura.trim() || null,
      p_domicilio_minimo_pedido: form.domicilio_minimo_pedido.trim() ? parseInt(form.domicilio_minimo_pedido, 10) : null,
      p_nombre_bot:              form.nombre_bot.trim() || null,
      p_tono_bot:                form.tono_bot.trim() || null,
      p_mensaje_bienvenida:      form.mensaje_bienvenida.trim() || null
    })
    setGuardando(false)
    if (error) {
      alert('No se pudo guardar: ' + error.message)
      return
    }
    setOriginal(form)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 3000)
  }

  if (cargando) {
    return <div className="text-center text-mute py-20 text-sm">Cargando configuración…</div>
  }

  if (noAutorizado) {
    return (
      <div className="text-center py-20 bg-surface border border-dashed border-line rounded-xl">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-ink font-medium">Solo el dueño puede ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Configuración</h1>
        <p className="text-mute text-sm">
          Datos del restaurante. Los horarios y tiempos se ajustan en Logística.
        </p>
      </div>

      <div className="space-y-6">
        {/* Identidad */}
        <Seccion titulo="Identidad" descripcion="Cómo se presenta tu restaurante al cliente.">
          <Campo label="Nombre del restaurante" requerido>
            <input className="input" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
          </Campo>
          <Campo label="Dirección física" ayuda="La que el bot da cuando el cliente recoge.">
            <input className="input" value={form.direccion} onChange={e => set('direccion', e.target.value)} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Ciudad">
              <input className="input" value={form.ciudad} onChange={e => set('ciudad', e.target.value)} />
            </Campo>
            <Campo label="Teléfono público">
              <input className="input tnum" value={form.telefono_publico} onChange={e => set('telefono_publico', e.target.value)} />
            </Campo>
          </div>
        </Seccion>

        {/* Domicilio */}
        <Seccion titulo="Domicilio" descripcion="Cobro y zona de entrega.">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tarifa base" ayuda="En pesos. Punto de partida del cobro.">
              <input className="input tnum" type="number" value={form.domicilio_tarifa_plana}
                onChange={e => set('domicilio_tarifa_plana', e.target.value)} placeholder="5000" />
            </Campo>
            <Campo label="Pedido mínimo" ayuda="Monto mínimo para domicilio.">
              <input className="input tnum" type="number" value={form.domicilio_minimo_pedido}
                onChange={e => set('domicilio_minimo_pedido', e.target.value)} placeholder="20000" />
            </Campo>
          </div>
          <Campo label="Zona de cobertura" ayuda="Texto descriptivo (ej. 'Casco urbano de Tuluá').">
            <input className="input" value={form.domicilio_cobertura} onChange={e => set('domicilio_cobertura', e.target.value)} />
          </Campo>

          <div className="bg-canvas rounded-lg p-4 mt-1">
            <div className="text-xs font-medium uppercase tracking-wider text-mute mb-1">
              Coordenadas de origen
            </div>
            <p className="text-xs text-mute mb-3 leading-relaxed">
              El punto desde donde se calcula la distancia a cada cliente. Para obtenerlas:
              abre Google Maps, haz clic derecho sobre tu restaurante y copia los dos números que aparecen arriba.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Latitud">
                <input className="input tnum" value={form.lat} onChange={e => set('lat', e.target.value)} placeholder="4.0847" />
              </Campo>
              <Campo label="Longitud">
                <input className="input tnum" value={form.lng} onChange={e => set('lng', e.target.value)} placeholder="-76.1954" />
              </Campo>
            </div>
            {form.lat && form.lng && (
              <a
                href={`https://www.google.com/maps?q=${form.lat},${form.lng}`}
                target="_blank" rel="noreferrer"
                className="inline-block mt-2 text-xs text-oso-600 hover:underline"
              >
                Ver esta ubicación en el mapa ↗
              </a>
            )}
          </div>
        </Seccion>

        {/* Operación */}
        <Seccion titulo="Operación" descripcion="Datos internos del negocio.">
          <Campo label="Teléfono del jefe" ayuda="A este número llegan las notificaciones de pedidos. Con código país (ej. 573...).">
            <input className="input tnum" value={form.telefono_jefe} onChange={e => set('telefono_jefe', e.target.value)} placeholder="573001234567" />
          </Campo>
        </Seccion>

        {/* Personalidad del bot */}
        <Seccion titulo="El bot" descripcion="Cómo habla tu asistente en WhatsApp.">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre del bot" ayuda="Cómo se presenta.">
              <input className="input" value={form.nombre_bot} onChange={e => set('nombre_bot', e.target.value)} placeholder="Oso" />
            </Campo>
            <Campo label="Tono" ayuda="Estilo al hablar.">
              <input className="input" value={form.tono_bot} onChange={e => set('tono_bot', e.target.value)} placeholder="cálido y directo" />
            </Campo>
          </div>
          <Campo label="Mensaje de bienvenida" ayuda="Lo primero que ve un cliente nuevo.">
            <textarea className="input" rows={2} value={form.mensaje_bienvenida}
              onChange={e => set('mensaje_bienvenida', e.target.value)}
              placeholder="¡Hola! Bienvenido a Don Oso 🐻 ¿Qué te provoca hoy?" />
          </Campo>
        </Seccion>
      </div>

      {/* Barra de guardado */}
      <div className="sticky bottom-0 mt-8 -mx-6 px-6 py-4 bg-canvas/90 backdrop-blur border-t border-line flex items-center justify-between gap-4">
        <div className="text-sm">
          {guardado ? (
            <span className="text-green-700 font-medium">✓ Cambios guardados</span>
          ) : hayCambios ? (
            <span className="text-mute">Tienes cambios sin guardar</span>
          ) : (
            <span className="text-mute">Todo guardado</span>
          )}
        </div>
        <button
          onClick={guardar}
          disabled={guardando || !hayCambios}
          className="bg-oso-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-oso-700 disabled:opacity-50 transition-colors"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: white;
          border: 1px solid #E8E5DD;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border-color: #A8794F;
          box-shadow: 0 0 0 3px rgba(168,121,79,0.15);
        }
      `}</style>
    </div>
  )
}

function Seccion({ titulo, descripcion, children }: {
  titulo: string; descripcion: string; children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-line rounded-xl p-5">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">{titulo}</h2>
        <p className="text-xs text-mute mt-0.5">{descripcion}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Campo({ label, requerido, ayuda, children }: {
  label: string; requerido?: boolean; ayuda?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-mute mb-1.5">
        {label}{requerido && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {ayuda && <p className="text-[11px] text-mute mt-1">{ayuda}</p>}
    </div>
  )
}
