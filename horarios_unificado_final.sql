-- ============================================================
--  Índice único requerido para el on conflict (idempotente)
-- ============================================================
create unique index if not exists ux_horarios_rest_dia
    on horarios_restaurante (restaurante_id, dia_semana);


-- ============================================================
--  HORARIOS UNIFICADOS — fuente única: tabla horarios_restaurante
--
--  Resuelve el lío de 3 fuentes de horario distintas. De ahora en
--  adelante, la ÚNICA fuente de verdad es la tabla horarios_restaurante
--  (una fila por día: dia_semana 0=domingo..6=sábado, con apertura,
--  cierre y un booleano "cerrado").
--
--  Incluye:
--   1. obtener_horarios_dia()  — lee los 7 días (panel).
--   2. guardar_horarios_dia()  — guarda los 7 días (panel).
--   3. obtener_config_restaurante() corregido — calcula estado_negocio
--      LEYENDO de horarios_restaurante (no del jsonb viejo).
--
--  Mapeo de días (Postgres extract(dow) y la tabla coinciden):
--   0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado
-- ============================================================


-- ════════════════════════════════════════════
-- 1. Leer los 7 días (panel, dueño)
-- ════════════════════════════════════════════
create or replace function obtener_horarios_dia()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
    v_arr  jsonb;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    v_rest := obtener_restaurante_actual();

    -- Asegurar que existan las 7 filas (por si falta alguna)
    insert into horarios_restaurante (restaurante_id, dia_semana, hora_apertura, hora_cierre, cerrado)
    select v_rest, d, '17:00'::time, '23:00'::time, false
      from generate_series(0,6) as d
    on conflict (restaurante_id, dia_semana) do nothing;

    select jsonb_agg(
             jsonb_build_object(
               'dia_semana', dia_semana,
               'hora_apertura', to_char(hora_apertura, 'HH24:MI'),
               'hora_cierre',   to_char(hora_cierre, 'HH24:MI'),
               'cerrado', cerrado
             ) order by dia_semana
           )
      into v_arr
      from horarios_restaurante
     where restaurante_id = v_rest;

    return jsonb_build_object('ok', true, 'dias', coalesce(v_arr, '[]'::jsonb));
end;
$$;


-- ════════════════════════════════════════════
-- 2. Guardar los 7 días (panel, dueño)
--    Recibe un arreglo:
--    [ { "dia_semana":0, "hora_apertura":"17:00", "hora_cierre":"23:00", "cerrado":false }, ... ]
--    También regenera horarios_texto y hora_apertura (legacy) para
--    mantener todo sincronizado.
-- ════════════════════════════════════════════
create or replace function guardar_horarios_dia(
    p_dias jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest    uuid;
    item      jsonb;
    v_texto   text := '';
    v_primera time := null;
    -- etiquetas en orden lunes..domingo para el texto legible
    dia_lbl   text[] := array['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']; -- índice = dia_semana
    orden_txt int[]  := array[1,2,3,4,5,6,0]; -- mostrar Lun..Dom en el texto
    d_idx     int;
    r         record;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    v_rest := obtener_restaurante_actual();

    -- Actualizar cada día recibido
    for item in select * from jsonb_array_elements(coalesce(p_dias, '[]'::jsonb))
    loop
        update horarios_restaurante
           set hora_apertura = nullif(item->>'hora_apertura','')::time,
               hora_cierre   = nullif(item->>'hora_cierre','')::time,
               cerrado       = coalesce((item->>'cerrado')::boolean, false)
         where restaurante_id = v_rest
           and dia_semana = (item->>'dia_semana')::int;
    end loop;

    -- Reconstruir horarios_texto (orden Lun..Dom) y detectar primera apertura
    foreach d_idx in array orden_txt loop
        select * into r from horarios_restaurante
          where restaurante_id = v_rest and dia_semana = d_idx;
        if r.cerrado or r.hora_apertura is null then
            v_texto := v_texto || dia_lbl[d_idx + 1] || ' Cerrado | ';
        else
            v_texto := v_texto || dia_lbl[d_idx + 1] || ' ' ||
                       to_char(r.hora_apertura,'HH24:MI') || '-' ||
                       to_char(r.hora_cierre,'HH24:MI') || ' | ';
            if v_primera is null then
                v_primera := r.hora_apertura;
            end if;
        end if;
    end loop;
    v_texto := rtrim(v_texto, ' | ');

    -- Sincronizar campos legacy en restaurantes
    update restaurantes
       set horarios_texto = v_texto,
           hora_apertura  = coalesce(v_primera, hora_apertura),
           updated_at     = now()
     where id = v_rest;

    return jsonb_build_object('ok', true, 'texto', v_texto);
end;
$$;


-- ════════════════════════════════════════════
-- 3. obtener_config_restaurante — estado_negocio desde horarios_restaurante
-- ════════════════════════════════════════════
drop function if exists obtener_config_restaurante(text);

create function obtener_config_restaurante(
    p_phone_number_id text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_r         restaurantes%rowtype;
    v_dow       int;
    v_hora_now  time;
    v_h         horarios_restaurante%rowtype;
    v_estado    text := 'cerrado';
begin
    select * into v_r
      from restaurantes
     where phone_number_id = p_phone_number_id
     limit 1;

    if v_r.id is null then
        return jsonb_build_object(
            'encontrado', false,
            'mensaje', 'No hay restaurante con ese phone_number_id'
        );
    end if;

    if v_r.activo is not true then
        return jsonb_build_object(
            'encontrado', true, 'activo', false,
            'id', v_r.id, 'restaurante_id', v_r.id, 'nombre', v_r.nombre
        );
    end if;

    -- ───── estado_negocio desde horarios_restaurante ─────
    -- (la base ya está en hora Colombia: now() es local)
    v_dow      := extract(dow from now())::int;   -- 0=domingo..6=sábado
    v_hora_now := now()::time;

    select * into v_h
      from horarios_restaurante
     where restaurante_id = v_r.id
       and dia_semana = v_dow
     limit 1;

    if found and v_h.cerrado is not true
       and v_h.hora_apertura is not null and v_h.hora_cierre is not null then
        if v_h.hora_cierre > v_h.hora_apertura then
            -- horario normal (no cruza medianoche)
            if v_hora_now >= v_h.hora_apertura and v_hora_now <= v_h.hora_cierre then
                v_estado := 'abierto';
            end if;
        else
            -- cruza medianoche (ej. abre 17:00, cierra 01:00)
            if v_hora_now >= v_h.hora_apertura or v_hora_now <= v_h.hora_cierre then
                v_estado := 'abierto';
            end if;
        end if;
    end if;
    -- si el día está cerrado o no hay fila → queda 'cerrado'

    return jsonb_build_object(
        'encontrado',              true,
        'activo',                  true,
        'estado_negocio',          v_estado,
        'id',                      v_r.id,
        'restaurante_id',          v_r.id,
        'nombre',                  v_r.nombre,
        'tipo',                    v_r.tipo_restaurante,
        'direccion',               v_r.direccion,
        'ciudad',                  v_r.ciudad,
        'lat',                     v_r.lat,
        'lng',                     v_r.lng,
        'telefono_publico',        v_r.telefono_publico,
        'telefono_jefe',           v_r.telefono_jefe,
        'modo_menu',               v_r.modo_menu,
        'domicilio_tarifa_plana',  v_r.domicilio_tarifa_plana,
        'domicilio_cobertura',     v_r.domicilio_cobertura,
        'domicilio_minimo_pedido', v_r.domicilio_minimo_pedido,
        'nombre_bot',              v_r.nombre_bot,
        'tono_bot',                v_r.tono_bot,
        'mensaje_bienvenida',      v_r.mensaje_bienvenida,
        'hora_apertura',           v_r.hora_apertura,
        'horarios_texto',          v_r.horarios_texto,
        'minutos_antes_preguntar', v_r.minutos_antes_preguntar,
        'minutos_antes_jefe',      v_r.minutos_antes_jefe,
        'modo_notificacion',       v_r.modo_notificacion,
        'metodos_pago',            v_r."metodos de pago",
        'color_primario',          v_r.color_primario,
        'logo_emoji',              v_r.logo_emoji
    );
end;
$$;


notify pgrst, 'reload schema';
