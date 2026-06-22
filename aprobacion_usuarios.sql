-- ============================================================
--  APROBACIÓN DE USUARIOS NUEVOS
--
--  Los registros nuevos quedan 'pendiente'. El dueño aprueba o
--  rechaza desde la pantalla de Usuarios. Solo los 'aprobado'
--  pueden usar el panel.
-- ============================================================


-- ════════════════════════════════════════════
-- 1. Campo de estado de acceso
-- ════════════════════════════════════════════
alter table usuarios_panel
    add column if not exists estado_acceso text default 'pendiente';

-- Los usuarios que YA existen (tú y los que ya entraban) se marcan
-- como aprobados para que no pierdan acceso.
update usuarios_panel
   set estado_acceso = 'aprobado'
 where estado_acceso is null
    or estado_acceso = 'pendiente';
-- (Esto aprueba a todos los actuales. Los NUEVOS que se registren
--  después caerán como 'pendiente' por el trigger de abajo.)


-- ════════════════════════════════════════════
-- 2. Trigger de registro: ahora deja 'pendiente'
-- ════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
begin
    v_rest := nullif(new.raw_user_meta_data->>'restaurante_id', '')::uuid;

    if not exists (select 1 from usuarios_panel where user_id = new.id) then
        insert into usuarios_panel (user_id, nombre, rol, restaurante_id, estado_acceso)
        values (
            new.id,
            coalesce(nullif(new.raw_user_meta_data->>'nombre',''), split_part(new.email, '@', 1)),
            'empleado',
            v_rest,
            'pendiente'           -- ← queda pendiente de aprobación
        );
    end if;

    return new;
end;
$$;


-- ════════════════════════════════════════════
-- 3. Helper: ¿el usuario actual está aprobado?
-- ════════════════════════════════════════════
create or replace function mi_estado_acceso()
returns text
language sql stable security definer set search_path = public as $$
    select coalesce(estado_acceso, 'pendiente')
      from usuarios_panel
     where user_id = auth.uid()
     limit 1;
$$;


-- ════════════════════════════════════════════
-- 4. Listar usuarios (ahora incluye estado_acceso)
-- ════════════════════════════════════════════
create or replace function listar_usuarios_panel()
returns table (
    user_id       uuid,
    nombre        text,
    rol           text,
    email         text,
    estado_acceso text,
    created_at    timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    return query
        select up.user_id, up.nombre, up.rol, u.email::text,
               coalesce(up.estado_acceso, 'pendiente'), up.created_at
          from usuarios_panel up
          join auth.users u on u.id = up.user_id
         where up.restaurante_id = obtener_restaurante_actual()
         order by
           case coalesce(up.estado_acceso,'pendiente')
             when 'pendiente' then 0 else 1 end,  -- pendientes primero
           up.created_at;
end;
$$;


-- ════════════════════════════════════════════
-- 5. Cambiar estado de acceso (aprobar / rechazar)
-- ════════════════════════════════════════════
create or replace function cambiar_acceso_usuario(
    p_user_id uuid,
    p_estado  text       -- 'aprobado' | 'rechazado'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
begin
    if not es_dueno() then
        raise exception 'No autorizado';
    end if;

    if p_estado not in ('aprobado', 'rechazado', 'pendiente') then
        return jsonb_build_object('error', 'estado_invalido');
    end if;

    v_rest := obtener_restaurante_actual();

    -- No permitir que el dueño se rechace a sí mismo
    if p_user_id = auth.uid() and p_estado = 'rechazado' then
        return jsonb_build_object('error', 'no_puedes_rechazarte');
    end if;

    update usuarios_panel
       set estado_acceso = p_estado
     where user_id = p_user_id
       and restaurante_id = v_rest;

    return jsonb_build_object('ok', true, 'user_id', p_user_id, 'estado', p_estado);
end;
$$;


notify pgrst, 'reload schema';
