# Don Oso — Panel

Panel web para empleados y dueño del restaurante. Auth por magic link de Supabase y dashboard de pedidos en tiempo real.

## Setup local

```bash
npm install
cp .env.example .env
```

Edita `.env` y pon tu `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API → anon/public key).

```bash
npm run dev
```

Abre http://localhost:5173.

## Configuración necesaria en Supabase

### 1. Auth — URL de redirección

Authentication → URL Configuration:
- **Site URL:** `http://localhost:5173` (en desarrollo) o tu dominio de Vercel (en producción)
- **Redirect URLs:** agrega ambos.

Sin esto, el magic link te devuelve a un dominio raro y no autentica.

### 2. Realtime — habilitar en `pedidos`

Database → Replication → encuentra la tabla `pedidos` y enciende el toggle.  
Sin esto, los pedidos nuevos no aparecen sin refrescar.

### 3. Primer usuario dueño

Ya corriste el SQL del panel; ahora invita al dueño:

1. Authentication → Users → **Invite user** → pon su email.
2. El dueño abre el link que le llega y queda en Supabase Auth.
3. Copia su `user_id` y corre:

```sql
insert into usuarios_panel (user_id, restaurante_id, rol, nombre)
values (
  'PEGA_AQUI_EL_USER_ID',
  (select id from restaurantes where nombre = 'Don Oso'),
  'dueno',
  'Carlos (Dueño)'
);
```

Después de eso, el dueño entra por http://localhost:5173 con magic link.

Para empleados es lo mismo pero `rol = 'empleado'`.

## Deploy a Vercel

1. Sube el proyecto a un repo en GitHub.
2. En vercel.com → Add New → Project → importa el repo.
3. Variables de entorno: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy.
5. Vuelve a Supabase → Auth → URL Configuration y agrega el dominio de Vercel como Site URL y Redirect URL.

## Estructura del código

```
src/
├── App.tsx               # auth gate
├── lib/
│   ├── supabase.ts       # cliente
│   ├── types.ts          # tipos compartidos + ESTADOS_INFO
│   └── utils.ts          # formatCOP, hace, cn
├── pages/
│   ├── Login.tsx
│   └── Pedidos.tsx       # dashboard principal
└── components/
    ├── PedidoCard.tsx
    └── PedidoDetalle.tsx # drawer lateral
```

## Siguientes pantallas (mismo patrón)

- **Menú** (`pages/Menu.tsx`): listar `platos` con toggle de disponible, edición de precio (solo dueño).
- **Clientes** (`pages/Clientes.tsx`): `clientes` con historial de pedidos y notas detectadas.
- **Tarifas de domicilio** (`pages/Tarifas.tsx`): solo dueño, CRUD de `tarifas_distancia`.
- **Pagos** (`pages/Pagos.tsx`): solo dueño, validar comprobantes.
- **Configuración** (`pages/Config.tsx`): solo dueño, datos del restaurante.

Cuando vayas a agregar más pantallas, conviene meter `react-router-dom` y armar el menú lateral. Por ahora, una sola pantalla no lo justifica.
