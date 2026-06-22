-- ============================================================
--  CONFIGURACIÓN GENERAL DEL RESTAURANTE (solo dueño)
--
--  • obtener_config_general(): trae los datos editables.
--  • guardar_config_general(): los actualiza (valida dueño).
--
--  Excluye los campos que se editan en Logística (horarios,
--  rangos, minutos, modo_notificacion).
-- ============================================================


-- ════════════════════════════════════════════
-- 1. Leer config general
-- ════════════════════════════════════════════
create or replace function obtener_config_general()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest_id uuid;
    v_r       restaurantes%rowtype;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    v_rest_id := obtener_restaurante_actual();
    select * into v_r from restaurantes where id = v_rest_id;

    return jsonb_build_object(
        'nombre',                  v_r.nombre,
        'direccion',               v_r.direccion,
        'ciudad',                  v_r.ciudad,
        'lat',                     v_r.lat,
        'lng',                     v_r.lng,
        'telefono_publico',        v_r.telefono_publico,
        'telefono_jefe',           v_r.telefono_jefe,
        'domicilio_tarifa_plana',  v_r.domicilio_tarifa_plana,
        'domicilio_cobertura',     v_r.domicilio_cobertura,
        'domicilio_minimo_pedido', v_r.domicilio_minimo_pedido,
        'nombre_bot',              v_r.nombre_bot,
        'tono_bot',                v_r.tono_bot,
        'mensaje_bienvenida',      v_r.mensaje_bienvenida
    );
end;
$$;


-- ════════════════════════════════════════════
-- 2. Guardar config general
-- ════════════════════════════════════════════
create or replace function guardar_config_general(
    p_nombre                  text,
    p_direccion               text,
    p_ciudad                  text,
    p_lat                     numeric,
    p_lng                     numeric,
    p_telefono_publico        text,
    p_telefono_jefe           text,
    p_domicilio_tarifa_plana  integer,
    p_domicilio_cobertura     text,
    p_domicilio_minimo_pedido integer,
    p_nombre_bot              text,
    p_tono_bot                text,
    p_mensaje_bienvenida      text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest_id uuid;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    v_rest_id := obtener_restaurante_actual();

    update restaurantes set
        nombre                  = p_nombre,
        direccion               = p_direccion,
        ciudad                  = p_ciudad,
        lat                     = p_lat,
        lng                     = p_lng,
        telefono_publico        = p_telefono_publico,
        telefono_jefe           = p_telefono_jefe,
        domicilio_tarifa_plana  = p_domicilio_tarifa_plana,
        domicilio_cobertura     = p_domicilio_cobertura,
        domicilio_minimo_pedido = p_domicilio_minimo_pedido,
        nombre_bot              = p_nombre_bot,
        tono_bot                = p_tono_bot,
        mensaje_bienvenida      = p_mensaje_bienvenida,
        updated_at              = now()
     where id = v_rest_id;

    return jsonb_build_object('ok', true);
end;
$$;


notify pgrst, 'reload schema';
