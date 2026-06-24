-- ============================================================
--  IMPORTADOR DE MENÚ (reemplazo total)
--
--  importar_menu_completo(p_platos jsonb):
--    • Borra TODO el menú actual del restaurante (platos + categorías).
--    • Crea las categorías detectadas y todos los platos.
--    • Atómico: si algo falla, no queda nada a medias.
--
--  Recibe un arreglo de platos ya parseados desde el CSV:
--    [
--      { "categoria":"Hamburguesas", "nombre":"Clásica",
--        "descripcion":"...", "precio":18000, "tipo":"comida",
--        "disponible":true, "foto_url":"", "orden":1,
--        "keywords":"hamburguesa,carne",
--        "ingredientes":["carne","queso","lechuga"] },
--      ...
--    ]
--
--  PROTECCIÓN: los pedidos históricos guardan nombre_plato como
--  texto en pedido_items, así que borrar platos NO rompe el
--  historial de pedidos.
-- ============================================================

drop function if exists importar_menu_completo(jsonb);

create function importar_menu_completo(
    p_platos jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest      uuid;
    v_cat       text;
    v_cat_id    uuid;
    v_cat_orden integer := 0;
    item        jsonb;
    v_n_platos  integer := 0;
    v_n_cats    integer := 0;
    v_orden     integer;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    v_rest := obtener_restaurante_actual();

    if v_rest is null then
        return jsonb_build_object('error', 'sin_restaurante');
    end if;

    if jsonb_typeof(p_platos) <> 'array' or jsonb_array_length(p_platos) = 0 then
        return jsonb_build_object('error', 'csv_vacio');
    end if;

    -- ───── 1. BORRAR menú actual del restaurante ─────
    -- (primero platos, luego categorías por la FK)
    delete from platos     where restaurante_id = v_rest;
    delete from categorias where restaurante_id = v_rest;

    -- ───── 2. Crear categorías únicas (en orden de aparición) ─────
    for v_cat in
        select distinct on (lower(trim(value->>'categoria')))
               value->>'categoria'
          from jsonb_array_elements(p_platos)
         where coalesce(trim(value->>'categoria'), '') <> ''
         order by lower(trim(value->>'categoria'))
    loop
        v_cat_orden := v_cat_orden + 1;
        insert into categorias (restaurante_id, nombre, orden, activa)
        values (v_rest, trim(v_cat), v_cat_orden, true);
        v_n_cats := v_n_cats + 1;
    end loop;

    -- ───── 3. Crear platos ─────
    v_orden := 0;
    for item in select * from jsonb_array_elements(p_platos)
    loop
        v_cat := trim(item->>'categoria');

        -- Buscar la categoría que creamos
        select id into v_cat_id
          from categorias
         where restaurante_id = v_rest
           and lower(nombre) = lower(v_cat)
         limit 1;

        v_orden := v_orden + 1;

        insert into platos (
            restaurante_id, categoria_id, nombre, descripcion, precio,
            tipo, disponible, foto_url, orden, keywords, ingredientes
        ) values (
            v_rest,
            v_cat_id,
            trim(item->>'nombre'),
            nullif(trim(coalesce(item->>'descripcion','')), ''),
            coalesce((item->>'precio')::integer, 0),
            nullif(trim(coalesce(item->>'tipo','')), ''),
            coalesce((item->>'disponible')::boolean, true),
            nullif(trim(coalesce(item->>'foto_url','')), ''),
            v_orden,
            nullif(trim(coalesce(item->>'keywords','')), ''),
            coalesce(item->'ingredientes', '[]'::jsonb)
        );
        v_n_platos := v_n_platos + 1;
    end loop;

    return jsonb_build_object(
        'ok', true,
        'categorias_creadas', v_n_cats,
        'platos_creados', v_n_platos
    );
end;
$$;


notify pgrst, 'reload schema';
