-- ============================================================
--  PANTALLA DE CLIENTES (solo dueño) — ajustado a la tabla real
--
--  Columnas reales: nombre, telefono, direccion, barrio, ciudad,
--  notas, fecha_ultima_compra, total_comprado_historico.
-- ============================================================


-- ════════════════════════════════════════════
-- 1. Listar clientes con resumen
-- ════════════════════════════════════════════
create or replace function listar_clientes_resumen()
returns table (
    id               uuid,
    nombre           text,
    telefono         text,
    direccion        text,
    barrio           text,
    total_pedidos    bigint,
    total_gastado    bigint,
    ultimo_pedido    timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    return query
        select
            c.id,
            c.nombre,
            c.telefono,
            c.direccion,
            c.barrio,
            count(p.id) filter (where p.estado = 'entregado')                      as total_pedidos,
            coalesce(sum(p.total) filter (where p.estado = 'entregado'), 0)::bigint as total_gastado,
            max(p.created_at)                                                       as ultimo_pedido
          from clientes c
          left join pedidos p on p.cliente_id = c.id
         where c.restaurante_id = obtener_restaurante_actual()
         group by c.id, c.nombre, c.telefono, c.direccion, c.barrio
         order by max(p.created_at) desc nulls last;
end;
$$;


-- ════════════════════════════════════════════
-- 2. Detalle + historial de un cliente
-- ════════════════════════════════════════════
create or replace function obtener_historial_cliente(
    p_cliente_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_cliente clientes%rowtype;
    v_pedidos jsonb;
    v_stats   jsonb;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    select * into v_cliente
      from clientes
     where id = p_cliente_id
       and restaurante_id = obtener_restaurante_actual();

    if v_cliente.id is null then
        raise exception 'Cliente no encontrado';
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id',            p.id,
            'numero_pedido', p.numero_pedido,
            'estado',        p.estado,
            'tipo_entrega',  p.tipo_entrega,
            'total',         p.total,
            'metodo_pago',   p.metodo_pago,
            'created_at',    p.created_at
        ) order by p.created_at desc
    ), '[]'::jsonb)
    into v_pedidos
    from pedidos p
    where p.cliente_id = p_cliente_id;

    select jsonb_build_object(
        'total_pedidos',   count(*) filter (where estado = 'entregado'),
        'total_gastado',   coalesce(sum(total) filter (where estado = 'entregado'), 0),
        'ticket_promedio', coalesce(round(avg(total) filter (where estado = 'entregado')), 0)
    )
    into v_stats
    from pedidos
    where cliente_id = p_cliente_id;

    return jsonb_build_object(
        'cliente', jsonb_build_object(
            'id',        v_cliente.id,
            'nombre',    v_cliente.nombre,
            'telefono',  v_cliente.telefono,
            'direccion', v_cliente.direccion,
            'barrio',    v_cliente.barrio,
            'ciudad',    v_cliente.ciudad,
            'notas',     v_cliente.notas
        ),
        'pedidos', v_pedidos,
        'stats',   v_stats
    );
end;
$$;


-- ════════════════════════════════════════════
-- 3. RLS: el dueño edita clientes de su restaurante
-- ════════════════════════════════════════════
alter table clientes enable row level security;

drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes
    for select using (restaurante_id = obtener_restaurante_actual());

drop policy if exists clientes_update_dueno on clientes;
create policy clientes_update_dueno on clientes
    for update using (
        restaurante_id = obtener_restaurante_actual() and es_dueno()
    ) with check (
        restaurante_id = obtener_restaurante_actual()
    );


notify pgrst, 'reload schema';
