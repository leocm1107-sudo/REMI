-- ============================================================
--  EDITOR DE HORARIOS POR DÍA (panel, solo dueño)
--
--  Guarda el horario semana en el jsonb "horarios" de restaurantes.
--  Un día CERRADO simplemente NO aparece en el jsonb (igual que el
--  lunes hoy). Un día abierto guarda { "abre": "HH:MM", "cierra": "HH:MM" }.
--
--  El RPC obtener_config_restaurante ya lee este jsonb para calcular
--  estado_negocio (abierto/cerrado).
-- ============================================================


-- ════════════════════════════════════════════
-- 1. Leer los horarios del restaurante actual
-- ════════════════════════════════════════════
create or replace function obtener_horarios()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
    v_h    jsonb;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    v_rest := obtener_restaurante_actual();

    select coalesce(horarios, '{}'::jsonb) into v_h
      from restaurantes where id = v_rest;

    return jsonb_build_object('ok', true, 'horarios', v_h);
end;
$$;


-- ════════════════════════════════════════════
-- 2. Guardar los horarios (reemplaza el jsonb completo)
--    Recibe el objeto por día. Los días cerrados NO se incluyen.
--    Ejemplo de p_horarios:
--    {
--      "martes":  { "abre":"17:16", "cierra":"23:00" },
--      "domingo": { "abre":"17:16", "cierra":"23:00" }
--      // lunes ausente = cerrado
--    }
-- ════════════════════════════════════════════
create or replace function guardar_horarios(
    p_horarios jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest      uuid;
    v_dia       text;
    v_obj       jsonb;
    v_limpio    jsonb := '{}'::jsonb;
    v_texto     text := '';
    v_abre      text;
    v_cierra    text;
    v_primera_apertura time := null;
    -- orden de días para el texto
    dias_orden  text[] := array['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
    dias_label  text[] := array['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    i           int;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;
    v_rest := obtener_restaurante_actual();

    -- Validar y limpiar: solo días con abre y cierra válidos entran
    if p_horarios is not null and jsonb_typeof(p_horarios) = 'object' then
        for v_dia in select jsonb_object_keys(p_horarios)
        loop
            v_obj := p_horarios -> v_dia;
            v_abre   := v_obj ->> 'abre';
            v_cierra := v_obj ->> 'cierra';
            -- Solo si ambos vienen y no están vacíos
            if coalesce(v_abre,'') <> '' and coalesce(v_cierra,'') <> '' then
                v_limpio := v_limpio || jsonb_build_object(
                    v_dia, jsonb_build_object('abre', v_abre, 'cierra', v_cierra)
                );
            end if;
        end loop;
    end if;

    -- Construir horarios_texto legible + detectar primera apertura
    for i in 1 .. array_length(dias_orden, 1) loop
        v_dia := dias_orden[i];
        if v_limpio ? v_dia then
            v_obj := v_limpio -> v_dia;
            v_texto := v_texto || dias_label[i] || ' ' ||
                       (v_obj->>'abre') || '-' || (v_obj->>'cierra') || ' | ';
            -- primera apertura (para el campo hora_apertura suelto)
            if v_primera_apertura is null then
                v_primera_apertura := (v_obj->>'abre')::time;
            end if;
        else
            v_texto := v_texto || dias_label[i] || ' Cerrado | ';
        end if;
    end loop;
    -- quitar el " | " final
    v_texto := rtrim(v_texto, ' | ');

    -- Guardar todo
    update restaurantes
       set horarios       = v_limpio,
           horarios_texto = v_texto,
           hora_apertura  = coalesce(v_primera_apertura, hora_apertura),
           updated_at     = now()
     where id = v_rest;

    return jsonb_build_object('ok', true, 'horarios', v_limpio, 'texto', v_texto);
end;
$$;


notify pgrst, 'reload schema';
