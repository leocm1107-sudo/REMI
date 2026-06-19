-- ============================================================
--  ESTADO "listo_recoger" + WEBHOOK DE CAMBIOS DE ESTADO
--
--  1. Normaliza y permite el nuevo estado listo_recoger.
--  2. Dispara un webhook (vía pg_net) hacia Make cada vez que
--     un pedido cambia a: preparando, en_camino o listo_recoger.
--     Funciona sin importar el origen del cambio (panel o bot).
-- ============================================================


-- ---------- 1. Habilitar pg_net (HTTP desde Postgres) ----------
create extension if not exists pg_net;


-- ---------- 2. Guardar la URL del webhook de Make ----------
-- Crea una tabla mínima de configuración para no hardcodear la URL.
create table if not exists config_webhooks (
    clave text primary key,
    url   text not null,
    activo boolean default true
);

-- Inserta (o actualiza) la URL del webhook de Make.
-- ⚠️ REEMPLAZA la URL por la que te dé Make cuando crees el módulo Webhook.
insert into config_webhooks (clave, url)
values ('cambio_estado_pedido', 'https://hook.us2.make.com/REEMPLAZA_ESTO')
on conflict (clave) do update set url = excluded.url;


-- ---------- 3. Normalizador de estado (con listo_recoger) ----------
create or replace function normalizar_estado_pedido()
returns trigger language plpgsql as $$
begin
    new.estado := case lower(coalesce(new.estado, ''))
        when 'sin_cambios'         then 'cotizado'
        when 'sin cambios'         then 'cotizado'
        when 'en_preparacion'      then 'preparando'
        when 'en preparacion'      then 'preparando'
        when 'preparacion'         then 'preparando'
        when 'preparación'         then 'preparando'
        when 'camino'              then 'en_camino'
        when 'en camino'           then 'en_camino'
        when 'listo'               then 'listo_recoger'
        when 'listo_para_recoger'  then 'listo_recoger'
        when 'listo para recoger'  then 'listo_recoger'
        when 'para_recoger'        then 'listo_recoger'
        when 'rechazada'           then 'cancelado'
        when 'rechazado'           then 'cancelado'
        when ''                    then 'cotizado'
        else new.estado
    end;
    return new;
end;
$$;

drop trigger if exists trg_normalizar_estado_pedido on pedidos;
create trigger trg_normalizar_estado_pedido
    before insert or update of estado on pedidos
    for each row execute function normalizar_estado_pedido();


-- ---------- 4. Función que dispara el webhook ----------
create or replace function notificar_cambio_estado()
returns trigger language plpgsql as $$
declare
    v_url          text;
    v_cliente      clientes%rowtype;
    v_payload      jsonb;
begin
    -- Solo nos interesan estos 3 estados
    if new.estado not in ('preparando', 'en_camino', 'listo_recoger') then
        return new;
    end if;

    -- Solo si el estado REALMENTE cambió
    if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then
        return new;
    end if;

    -- Buscar la URL del webhook
    select url into v_url
      from config_webhooks
     where clave = 'cambio_estado_pedido' and activo = true;

    if v_url is null or v_url like '%REEMPLAZA%' then
        -- No hay webhook configurado todavía; no hacer nada
        return new;
    end if;

    -- Datos del cliente para el payload
    select * into v_cliente from clientes where id = new.cliente_id;

    -- Armar el payload
    v_payload := jsonb_build_object(
        'evento',          'cambio_estado',
        'pedido_id',       new.id,
        'numero_pedido',   new.numero_pedido,
        'estado_nuevo',    new.estado,
        'estado_anterior', case when tg_op = 'UPDATE' then old.estado else null end,
        'tipo_entrega',    new.tipo_entrega,
        'total',           new.total,
        'restaurante_id',  new.restaurante_id,
        'cliente', jsonb_build_object(
            'telefono', v_cliente.telefono,
            'nombre',   v_cliente.nombre
        ),
        'timestamp', now()
    );

    -- Disparar el POST asíncrono (no bloquea la transacción)
    perform net.http_post(
        url     := v_url,
        body    := v_payload,
        headers := '{"Content-Type": "application/json"}'::jsonb
    );

    return new;
end;
$$;


-- ---------- 5. Conectar el trigger del webhook ----------
-- Corre DESPUÉS del normalizador (orden alfabético: 'z_' al final)
drop trigger if exists trg_z_notificar_cambio_estado on pedidos;
create trigger trg_z_notificar_cambio_estado
    after insert or update of estado on pedidos
    for each row execute function notificar_cambio_estado();


-- ---------- 6. Refrescar caché PostgREST ----------
notify pgrst, 'reload schema';
