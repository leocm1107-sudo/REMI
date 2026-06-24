-- ============================================================
--  BARRIOS VETADOS + RANGOS DE DOMICILIO (multi-tenant)
--
--  • Tabla barrios_vetados (por nombre y/o por punto GPS+radio).
--  • RPCs para gestionar desde el panel (solo dueño).
--  • RPC que el BOT (Make) consulta: ¿este destino está vetado?
--  • RPCs para guardar los rangos de tarifas desde el mapa.
-- ============================================================


-- ════════════════════════════════════════════
-- 0. Extensión para comparar texto sin tildes
-- ════════════════════════════════════════════
create extension if not exists unaccent;


-- ════════════════════════════════════════════
-- 1. Tabla de barrios vetados
-- ════════════════════════════════════════════
create table if not exists barrios_vetados (
    id              uuid primary key default gen_random_uuid(),
    restaurante_id  uuid not null references restaurantes(id) on delete cascade,
    nombre_barrio   text,            -- veto por nombre (ej. "La Inmaculada")
    -- veto por zona GPS (opcional): un punto central + radio en metros
    lat             numeric,
    lng             numeric,
    radio_m         integer,         -- si hay lat/lng, radio de la zona vetada
    motivo          text,            -- nota interna (ej. "muy lejos", "inseguro")
    activo          boolean default true,
    created_at      timestamptz default now()
);

create index if not exists idx_barrios_vetados_rest
    on barrios_vetados (restaurante_id);


-- ════════════════════════════════════════════
-- 2. Listar barrios vetados (panel, dueño)
-- ════════════════════════════════════════════
create or replace function listar_barrios_vetados()
returns table (
    id            uuid,
    nombre_barrio text,
    lat           numeric,
    lng           numeric,
    radio_m       integer,
    motivo        text,
    activo        boolean
)
language plpgsql security definer set search_path = public as $$
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    return query
        select bv.id, bv.nombre_barrio, bv.lat, bv.lng, bv.radio_m, bv.motivo, bv.activo
          from barrios_vetados bv
         where bv.restaurante_id = obtener_restaurante_actual()
         order by bv.nombre_barrio nulls last, bv.created_at;
end;
$$;


-- ════════════════════════════════════════════
-- 3. Agregar barrio vetado (panel)
-- ════════════════════════════════════════════
create or replace function agregar_barrio_vetado(
    p_nombre_barrio text default null,
    p_lat           numeric default null,
    p_lng           numeric default null,
    p_radio_m       integer default null,
    p_motivo        text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
    v_id   uuid;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    -- Debe tener al menos un nombre o un punto GPS
    if coalesce(trim(p_nombre_barrio),'') = '' and (p_lat is null or p_lng is null) then
        return jsonb_build_object('error', 'falta_nombre_o_gps');
    end if;

    v_rest := obtener_restaurante_actual();

    insert into barrios_vetados (restaurante_id, nombre_barrio, lat, lng, radio_m, motivo, activo)
    values (v_rest, nullif(trim(coalesce(p_nombre_barrio,'')),''), p_lat, p_lng,
            coalesce(p_radio_m, 500), nullif(trim(coalesce(p_motivo,'')),''), true)
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;


-- ════════════════════════════════════════════
-- 4. Eliminar / activar barrio vetado (panel)
-- ════════════════════════════════════════════
create or replace function eliminar_barrio_vetado(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    delete from barrios_vetados
     where id = p_id and restaurante_id = obtener_restaurante_actual();
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function alternar_barrio_vetado(p_id uuid, p_activo boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    update barrios_vetados set activo = p_activo
     where id = p_id and restaurante_id = obtener_restaurante_actual();
    return jsonb_build_object('ok', true);
end;
$$;


-- ════════════════════════════════════════════
-- 5. ⭐ RPC que el BOT consulta: ¿destino vetado?
--    Recibe el restaurante (por phone_number_id), el nombre del
--    barrio (si lo detectó) y/o lat/lng (si el cliente compartió).
--    Devuelve si está vetado y un mensaje para el cliente.
-- ════════════════════════════════════════════
create or replace function verificar_destino_vetado(
    p_phone_number_id text,
    p_barrio          text default null,
    p_lat             numeric default null,
    p_lng             numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest    uuid;
    v_match   record;
    v_dist    numeric;
begin
    select id into v_rest
      from restaurantes where phone_number_id = p_phone_number_id limit 1;

    if v_rest is null then
        return jsonb_build_object('vetado', false, 'motivo', 'restaurante_no_encontrado');
    end if;

    -- (a) Veto por NOMBRE de barrio (comparación flexible, ignora mayúsculas/acentos parciales)
    if coalesce(trim(p_barrio),'') <> '' then
        for v_match in
            select nombre_barrio from barrios_vetados
             where restaurante_id = v_rest and activo = true
               and nombre_barrio is not null
        loop
            if lower(unaccent(p_barrio)) like '%' || lower(unaccent(v_match.nombre_barrio)) || '%'
               or lower(unaccent(v_match.nombre_barrio)) like '%' || lower(unaccent(p_barrio)) || '%' then
                return jsonb_build_object(
                    'vetado', true,
                    'tipo', 'nombre',
                    'barrio', v_match.nombre_barrio,
                    'mensaje', 'Lo sentimos, por ahora no hacemos domicilios al barrio ' || v_match.nombre_barrio || '. 😔'
                );
            end if;
        end loop;
    end if;

    -- (b) Veto por GPS (si el cliente compartió ubicación y hay zonas con punto)
    if p_lat is not null and p_lng is not null then
        for v_match in
            select nombre_barrio, lat, lng, radio_m from barrios_vetados
             where restaurante_id = v_rest and activo = true
               and lat is not null and lng is not null
        loop
            -- distancia aproximada en metros (fórmula simple para distancias cortas)
            v_dist := 111320 * sqrt(
                power(p_lat - v_match.lat, 2) +
                power((p_lng - v_match.lng) * cos(radians(p_lat)), 2)
            );
            if v_dist <= coalesce(v_match.radio_m, 500) then
                return jsonb_build_object(
                    'vetado', true,
                    'tipo', 'gps',
                    'barrio', coalesce(v_match.nombre_barrio, 'esa zona'),
                    'mensaje', 'Lo sentimos, esa ubicación está fuera de nuestra zona de domicilios. 😔'
                );
            end if;
        end loop;
    end if;

    return jsonb_build_object('vetado', false);
end;
$$;


-- ════════════════════════════════════════════
-- 6. Rangos de domicilio (para los círculos del mapa)
--    Reemplaza todos los rangos del restaurante de una vez.
-- ════════════════════════════════════════════
create or replace function guardar_rangos_domicilio(
    p_rangos jsonb   -- [{ "min_m":0, "max_m":2000, "tarifa":4000 }, ...]
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
    item   jsonb;
    v_n    integer := 0;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    v_rest := obtener_restaurante_actual();

    -- Reemplazar todos los rangos
    delete from tarifas_distancia where restaurante_id = v_rest;

    for item in select * from jsonb_array_elements(coalesce(p_rangos,'[]'::jsonb))
    loop
        insert into tarifas_distancia (restaurante_id, distancia_min_m, distancia_max_m, tarifa, activo)
        values (
            v_rest,
            (item->>'min_m')::integer,
            (item->>'max_m')::integer,
            (item->>'tarifa')::numeric,
            true
        );
        v_n := v_n + 1;
    end loop;

    return jsonb_build_object('ok', true, 'rangos_creados', v_n);
end;
$$;

create or replace function listar_rangos_domicilio()
returns table (
    distancia_min_m integer,
    distancia_max_m integer,
    tarifa          numeric
)
language plpgsql security definer set search_path = public as $$
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    return query
        select td.distancia_min_m, td.distancia_max_m, td.tarifa
          from tarifas_distancia td
         where td.restaurante_id = obtener_restaurante_actual()
           and td.activo = true
         order by td.distancia_min_m;
end;
$$;


-- ════════════════════════════════════════════
-- 7. RLS
-- ════════════════════════════════════════════
alter table barrios_vetados enable row level security;

drop policy if exists bv_dueno on barrios_vetados;
create policy bv_dueno on barrios_vetados
    for all using (restaurante_id = obtener_restaurante_actual() and es_dueno())
    with check (restaurante_id = obtener_restaurante_actual());


notify pgrst, 'reload schema';


-- ════════════════════════════════════════════
-- 8. Guardar solo la ubicación (lat/lng) del restaurante
--    Usado por la pantalla de Zonas (chincheta del mapa).
-- ════════════════════════════════════════════
create or replace function guardar_ubicacion_restaurante(
    p_lat numeric,
    p_lng numeric
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    v_rest := obtener_restaurante_actual();

    update restaurantes
       set lat = p_lat, lng = p_lng, updated_at = now()
     where id = v_rest;

    return jsonb_build_object('ok', true, 'lat', p_lat, 'lng', p_lng);
end;
$$;


notify pgrst, 'reload schema';
