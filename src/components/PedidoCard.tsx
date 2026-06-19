import { cn, formatCOP } from '../lib/utils'
import { infoEstado, type Pedido } from '../lib/types'

type Props = {
  pedido: Pedido
  onClick: () => void
  tiempo: string
}

const ICONO_ENTREGA: Record<string, string> = {
  domicilio: '🛵',
  recoge:    '🏪',
  mesa:      '🍽️'
}

export default function PedidoCard({ pedido, onClick, tiempo }: Props) {
  const info = infoEstado(pedido.estado)
  const icono = ICONO_ENTREGA[pedido.tipo_entrega] ?? '📦'
  const esRecoge = pedido.tipo_entrega === 'recoge' || pedido.tipo_entrega === 'mesa'

  const direccionCorta = pedido.direccion_entrega
    ? pedido.direccion_entrega.length > 38
      ? pedido.direccion_entrega.slice(0, 38) + '…'
      : pedido.direccion_entrega
    : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface border border-line rounded-xl p-5 hover:border-oso-400 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold tnum tracking-tight">
            {pedido.numero_pedido}
          </div>
          <div className="text-sm text-mute truncate">
            {pedido.clientes?.nombre || 'Sin nombre'}
            {pedido.clientes?.telefono && (
              <> · <span className="tnum">{pedido.clientes.telefono}</span></>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn(
            "text-xs px-2.5 py-1 rounded-full ring-1 ring-inset font-medium",
            info.chip
          )}>
            {info.label}
          </span>
          <span className="text-xs text-mute">{tiempo}</span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="text-sm text-mute min-w-0 truncate">
          <span className="mr-1">{icono}</span>
          <span className="capitalize">{pedido.tipo_entrega}</span>
          {esRecoge ? (
            <> · recoge en local</>
          ) : direccionCorta ? (
            <> · {direccionCorta}</>
          ) : null}
        </div>
        <div className="font-display text-lg font-semibold tnum tracking-tight shrink-0">
          {formatCOP(pedido.total)}
        </div>
      </div>

      {pedido.domicilio_requiere_revision && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 inline-block">
          ⚠️ Domicilio fuera de rango — revisar
        </div>
      )}
    </button>
  )
}
