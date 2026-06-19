import { useEffect } from 'react'
import { cn, formatCOP } from '../lib/utils'
import { infoEstado, siguienteEstado, type EstadoPedido, type Pedido } from '../lib/types'

type Props = {
  pedido: Pedido
  onClose: () => void
  onCambiarEstado: (p: Pedido, e: EstadoPedido) => void
}

export default function PedidoDetalle({ pedido, onClose, onCambiarEstado }: Props) {
  const info = infoEstado(pedido.estado)
  const siguiente = siguienteEstado(pedido.estado, pedido.tipo_entrega)
  const esRecoge = pedido.tipo_entrega === 'recoge' || pedido.tipo_entrega === 'mesa'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40 animate-fade" onClick={onClose} />

      <div className="relative bg-surface w-full max-w-md h-full overflow-y-auto shadow-2xl animate-in-right">
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="font-display text-xl font-semibold tnum tracking-tight">
              {pedido.numero_pedido}
            </div>
            <span className={cn(
              "inline-block text-xs px-2 py-0.5 rounded-full ring-1 ring-inset font-medium mt-1.5",
              info.chip
            )}>
              {info.label}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-mute hover:text-ink text-2xl leading-none w-8 h-8 grid place-items-center"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 space-y-7">
          <section>
            <Label>Cliente</Label>
            <div className="font-medium">{pedido.clientes?.nombre || 'Sin nombre'}</div>
            {pedido.clientes?.telefono && (
              <a
                href={`https://wa.me/${pedido.clientes.telefono.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-oso-600 hover:underline tnum inline-flex items-center gap-1"
              >
                {pedido.clientes.telefono}
                <span className="text-xs">↗</span>
              </a>
            )}
          </section>

          <section>
            <Label>Items</Label>
            {pedido.pedido_items && pedido.pedido_items.length > 0 ? (
              <div className="space-y-3">
                {pedido.pedido_items.map(item => (
                  <div key={item.id} className="flex items-start gap-3 pb-3 border-b border-line last:border-0 last:pb-0">
                    <span className="font-semibold tnum text-sm bg-oso-100 text-oso-800 rounded px-2 py-0.5 shrink-0">
                      {item.cantidad}×
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{item.nombre_plato}</div>
                      {item.notas && (
                        <div className="text-sm text-mute italic mt-0.5">{item.notas}</div>
                      )}
                      <div className="text-xs text-mute tnum mt-0.5">
                        {formatCOP(item.precio_unitario)} c/u
                      </div>
                    </div>
                    <div className="text-sm font-medium tnum shrink-0">
                      {formatCOP(item.precio_unitario * item.cantidad)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-mute">Cargando items…</div>
            )}
          </section>

          <section className="bg-canvas rounded-xl p-4 space-y-1.5 text-sm tnum">
            <div className="flex justify-between">
              <span className="text-mute">Subtotal</span>
              <span>{formatCOP(pedido.subtotal)}</span>
            </div>
            {pedido.tipo_entrega === 'domicilio' && (
              <div className="flex justify-between">
                <span className="text-mute">
                  Domicilio
                  {pedido.distancia_km != null && (
                    <span className="text-xs ml-1">({pedido.distancia_km} km)</span>
                  )}
                </span>
                <span>{formatCOP(pedido.domicilio_valor)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base pt-2 mt-1 border-t border-line">
              <span>Total</span>
              <span className="font-display tracking-tight">{formatCOP(pedido.total)}</span>
            </div>
          </section>

          {pedido.domicilio_requiere_revision && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-sm text-amber-900">
              <div className="font-medium mb-0.5">⚠️ Dirección fuera de rango</div>
              <div className="text-xs">
                El cobro automático puede estar incorrecto. Verifica con el cliente antes de despachar.
              </div>
            </div>
          )}

          <section className="grid grid-cols-2 gap-4">
            <div>
              <Label>Entrega</Label>
              <div className="font-medium capitalize">{pedido.tipo_entrega}</div>
              {esRecoge ? (
                <div className="text-mute mt-0.5 text-xs">Recoge en el local</div>
              ) : pedido.direccion_entrega ? (
                <div className="text-mute mt-0.5 text-xs">{pedido.direccion_entrega}</div>
              ) : null}
            </div>
            <div>
              <Label>Pago</Label>
              <div className="font-medium capitalize">{pedido.metodo_pago || '—'}</div>
            </div>
          </section>

          {pedido.estado !== 'entregado' && pedido.estado !== 'cancelado' && (
            <section className="space-y-2 pt-2">
              <Label>Acciones</Label>
              {siguiente && (
                <button
                  onClick={() => onCambiarEstado(pedido, siguiente)}
                  className="w-full bg-oso-600 text-white py-3 rounded-lg font-medium hover:bg-oso-700 transition-colors"
                >
                  Marcar como {infoEstado(siguiente).label}
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm('¿Seguro que quieres cancelar este pedido?')) {
                    onCambiarEstado(pedido, 'cancelado')
                  }
                }}
                className="w-full bg-surface text-red-700 py-2.5 rounded-lg text-sm hover:bg-red-50 transition-colors border border-line"
              >
                Cancelar pedido
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider font-semibold text-mute mb-2">
      {children}
    </div>
  )
}
