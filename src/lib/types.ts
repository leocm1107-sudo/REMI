export type EstadoPedido =
  | 'cotizado'
  | 'confirmado'
  | 'preparando'
  | 'en_camino'
  | 'listo_recoger'
  | 'entregado'
  | 'cancelado'

export type ClienteResumen = {
  telefono: string
  nombre: string | null
}

export type PedidoItem = {
  id: string
  pedido_id: string
  nombre_plato: string
  cantidad: number
  precio_unitario: number
  notas: string | null
}

export type Pedido = {
  id: string
  numero_pedido: string
  estado: EstadoPedido
  tipo_entrega: 'domicilio' | 'recoge' | 'mesa' | string
  direccion_entrega: string | null
  subtotal: number
  domicilio_valor: number
  total: number
  metodo_pago: string | null
  distancia_km: number | null
  domicilio_requiere_revision: boolean
  notas_internas: string | null
  created_at: string
  updated_at: string
  cliente_id: string
  clientes?: ClienteResumen | null
  pedido_items?: PedidoItem[]
}

export type PerfilUsuario = {
  nombre: string | null
  rol: 'dueno' | 'empleado'
}

export type Plato = {
  id: string
  restaurante_id: string
  categoria_id: string
  nombre: string
  descripcion: string | null
  precio: number
  tipo: string | null
  disponible: boolean
  foto_url: string | null
  orden: number | null
  keywords: string | null
  ingredientes: string[] | null
  created_at: string
  updated_at: string
}

export type Categoria = {
  id: string
  restaurante_id: string
  nombre: string
  orden: number | null
}

// Info visual de cada estado (etiqueta + color de la píldora)
export const ESTADOS_INFO: Record<EstadoPedido, { label: string; chip: string }> = {
  cotizado:      { label: 'Cotizado',           chip: 'bg-gray-100 text-gray-700 ring-gray-200' },
  confirmado:    { label: 'Confirmado',         chip: 'bg-amber-100 text-amber-800 ring-amber-200' },
  preparando:    { label: 'En cocina',          chip: 'bg-orange-100 text-orange-800 ring-orange-200' },
  en_camino:     { label: 'En camino',          chip: 'bg-blue-100 text-blue-800 ring-blue-200' },
  listo_recoger: { label: 'Listo para recoger', chip: 'bg-teal-100 text-teal-800 ring-teal-200' },
  entregado:     { label: 'Entregado',          chip: 'bg-green-100 text-green-800 ring-green-200' },
  cancelado:     { label: 'Cancelado',          chip: 'bg-red-100 text-red-800 ring-red-200' }
}


const LABEL_AGENDAMIENTO: Partial<Record<EstadoPedido, string>> = {
  preparando: 'En preparación',
}

export function infoEstado(estado: string, agendamiento = false) {
  const base = ESTADOS_INFO[estado as EstadoPedido] ?? {
    label: estado || 'Desconocido',
    chip: 'bg-purple-100 text-purple-800 ring-purple-200'
  }
  const override = agendamiento ? LABEL_AGENDAMIENTO[estado as EstadoPedido] : undefined
  return override ? { ...base, label: override } : base
}
// El siguiente estado DEPENDE del tipo de entrega.
// Domicilio:   ... preparando -> en_camino     -> entregado
// Recoge/mesa: ... preparando -> listo_recoger -> entregado
export function siguienteEstado(
  estadoActual: EstadoPedido,
  tipoEntrega: string
): EstadoPedido | undefined {
  const esRecoge = tipoEntrega === 'recoge' || tipoEntrega === 'mesa'

  switch (estadoActual) {
    case 'cotizado':      return 'confirmado'
    case 'confirmado':    return 'preparando'
    case 'preparando':    return esRecoge ? 'listo_recoger' : 'en_camino'
    case 'en_camino':     return 'entregado'
    case 'listo_recoger': return 'entregado'
    default:              return undefined  // entregado / cancelado: no hay siguiente
  }
}
