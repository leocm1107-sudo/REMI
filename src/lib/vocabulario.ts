// src/lib/vocabulario.ts — De qué habla cada panel
//
// El panel es el mismo para todos, pero un salón no tiene "pedidos en
// cocina" ni una repostería tiene "clientas". En vez de esparcir
// condicionales por cada pantalla, cada componente pide la palabra acá.
//
// Para agregar un negocio de otro rubro: una entrada nueva en VOCABULARIOS,
// el valor en restaurantes.vocabulario, y el check de la base.
//
// Este archivo no importa nada del proyecto a propósito: types.ts lo
// importa a él, y al revés se armaría un ciclo.

export type Vocab = {
  // La unidad de venta
  pedido: string
  pedidos: string
  Pedido: string
  Pedidos: string
  unPedido: string          // con artículo, para frases
  nuevoPedido: string

  // Lo que se vende
  producto: string
  productos: string
  Productos: string
  carta: string             // el listado completo
  buscarProducto: string
  fueraDeCarta: string

  // Quién compra
  cliente: string
  clientes: string
  Clientes: string

  // Dinero
  vendidoHoy: string

  // Estados: solo los que cambian de nombre según el rubro
  estados: Record<string, string>

  // Entrega
  entregaRecoge: string
  entregaDomicilio: string

  // Detalle
  Items: string
  detalles: string
  cancelar: string
  confirmCancelar: string
  notasPlaceholder: string
  notasPedido: string

  // Menú / catálogo
  nuevoProducto: string
  tabProductos: string
  cargandoProductos: string
  contadorProductos: (n: number, cats: number) => string
  lugarPreparacion: string

  // Clientes
  cargandoClientes: string
  sinPedidos: string
  buscarCliente: string
  sinResultados: string
  aunSinClientes: string

  // El negocio en sí
  negocio: string
  elNegocio: string
  historial: string
  sinHistorial: string
  bienvenidaEjemplo: string

  // Pantalla vacía
  vacio: string
  vacioAyuda: string
  cargando: string
}

const RESTAURANTE: Vocab = {
  pedido: 'pedido', pedidos: 'pedidos', Pedido: 'Pedido', Pedidos: 'Pedidos',
  unPedido: 'un pedido', nuevoPedido: 'Nuevo pedido',

  producto: 'plato', productos: 'platos', Productos: 'Menú',
  carta: 'carta', buscarProducto: 'Buscar plato…', fueraDeCarta: 'Producto fuera de carta',

  cliente: 'cliente', clientes: 'clientes', Clientes: 'Clientes',

  vendidoHoy: 'Vendido hoy',

  estados: {
    preparando: 'En cocina',
    en_camino: 'En camino',
    listo_recoger: 'Listo para recoger',
    entregado: 'Entregado',
  },

  entregaRecoge: 'Recoge en el local',
  entregaDomicilio: 'Domicilio',

  Items: 'Items',
  detalles: 'Detalles del pedido',
  cancelar: 'Cancelar pedido',
  confirmCancelar: '¿Seguro que quieres cancelar este pedido?',
  notasPlaceholder: 'Notas (sin cebolla, término medio…)',
  notasPedido: 'Notas del pedido (entrega 7pm…)',

  nuevoProducto: 'Nuevo plato',
  tabProductos: 'Platos',
  cargandoProductos: 'Cargando menú…',
  contadorProductos: (n, c) => `${n} platos en ${c} categorías`,
  lugarPreparacion: '🍳 Cocina',

  cargandoClientes: 'Cargando clientes…',
  sinPedidos: 'Sin pedidos',
  buscarCliente: 'Buscar por nombre, teléfono o barrio…',
  sinResultados: 'No se encontró ningún cliente.',
  aunSinClientes: 'Todavía no hay clientes.',

  negocio: 'restaurante',
  elNegocio: 'el restaurante',
  historial: 'Historial de pedidos',
  sinHistorial: 'Sin pedidos todavía.',
  bienvenidaEjemplo: '¡Hola! Bienvenido 👋 ¿Qué te provoca hoy?',

  vacio: 'No hay pedidos aquí.',
  vacioAyuda: 'Cuando entren por WhatsApp aparecerán solos.',
  cargando: 'Cargando pedidos…',
}

const REPOSTERIA: Vocab = {
  ...RESTAURANTE,
  producto: 'producto', productos: 'productos', Productos: 'Catálogo',
  carta: 'catálogo', buscarProducto: 'Buscar producto…',
  fueraDeCarta: 'Producto fuera de catálogo',

  estados: {
    preparando: 'En preparación',
    en_camino: 'En camino',
    listo_recoger: 'Listo para recoger',
    entregado: 'Entregado',
  },

  detalles: 'Detalles del encargo',
  notasPlaceholder: 'Notas (decoración, mensaje…)',

  nuevoProducto: 'Nuevo producto',
  tabProductos: 'Productos',
  cargandoProductos: 'Cargando catálogo…',
  contadorProductos: (n, c) => `${n} productos en ${c} categorías`,
  lugarPreparacion: '🧁 Taller',

  negocio: 'negocio',
  elNegocio: 'el negocio',
  historial: 'Historial de pedidos',
  sinHistorial: 'Sin pedidos todavía.',
  bienvenidaEjemplo: '¡Hola! 👋 ¿Qué se te antoja hoy?',

  vacio: 'No hay pedidos aquí.',
  vacioAyuda: 'Cuando entren por WhatsApp aparecerán solos.',
  cargando: 'Cargando pedidos…',
}

const SALON: Vocab = {
  pedido: 'cita', pedidos: 'citas', Pedido: 'Cita', Pedidos: 'Citas',
  unPedido: 'una cita', nuevoPedido: 'Nueva cita',

  producto: 'servicio', productos: 'servicios', Productos: 'Servicios',
  carta: 'lista de servicios', buscarProducto: 'Buscar servicio…',
  fueraDeCarta: 'Servicio fuera de lista',

  // El salón atiende mujeres casi en su totalidad, y así habla el bot.
  cliente: 'clienta', clientes: 'clientas', Clientes: 'Clientas',

  vendidoHoy: 'Facturado hoy',

  estados: {
    preparando: 'En proceso',
    en_camino: 'En proceso',      // no hay domicilio; si aparece, es un residuo
    listo_recoger: 'Lista para atender',
    entregado: 'Atendida',
  },

  entregaRecoge: 'En el salón',
  entregaDomicilio: 'Domicilio',

  Items: 'Servicios',
  detalles: 'Detalles de la cita',
  cancelar: 'Cancelar cita',
  confirmCancelar: '¿Seguro que quieres cancelar esta cita? El horario vuelve a quedar libre.',
  notasPlaceholder: 'Notas (cabello crespo, teñido…)',
  notasPedido: 'Notas de la cita',

  nuevoProducto: 'Nuevo servicio',
  tabProductos: 'Servicios',
  cargandoProductos: 'Cargando servicios…',
  contadorProductos: (n, c) => `${n} servicios en ${c} ${c === 1 ? 'categoría' : 'categorías'}`,
  lugarPreparacion: '💇 Salón',

  negocio: 'salón',
  elNegocio: 'el salón',
  historial: 'Historial de citas',
  sinHistorial: 'Sin citas todavía.',
  bienvenidaEjemplo: '¡Hola! 💇‍♀️ ¿En qué te puedo ayudar?',

  cargandoClientes: 'Cargando clientas…',
  sinPedidos: 'Sin citas',
  buscarCliente: 'Buscar por nombre o teléfono…',
  sinResultados: 'No se encontró ninguna clienta.',
  aunSinClientes: 'Todavía no hay clientas.',

  vacio: 'No hay citas aquí.',
  vacioAyuda: 'Cuando se agenden por WhatsApp aparecerán solas.',
  cargando: 'Cargando citas…',
}

export const VOCABULARIOS: Record<string, Vocab> = {
  restaurante: RESTAURANTE,
  reposteria: REPOSTERIA,
  salon: SALON,
}

export function vocabDe(clave?: string | null): Vocab {
  return VOCABULARIOS[clave ?? 'restaurante'] ?? RESTAURANTE
}
