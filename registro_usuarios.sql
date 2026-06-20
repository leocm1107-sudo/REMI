-- ============================================================
--  AUTO-REGISTRO DE USUARIOS DEL PANEL
--
--  Cuando alguien se registra (auth.users), un trigger lo inserta
--  automáticamente en usuarios_panel con rol='empleado' y el
--  restaurante que venga en los metadatos del registro.
--
--  El rol SIEMPRE es 'empleado' (fijado del lado del servidor).
--  Aunque manipulen el cliente, no pueden auto-asignarse 'dueno'.
--  El dueño los asciende después.
-- ============================================================


-- ════════════════════════════════════════════
-- 1. Helper: ¿el usuario actual es dueño?
--    SECURITY DEFINER para que no choque con RLS de usuarios_panel.
-- ════════════════════════════════════════════
create or replace function es_dueno()
returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from usuarios_panel
         where user_id = auth.uid() and rol = 'dueno'
    );
$$;


-- ════════════════════════════════════════════
-- 2. Trigger: insertar en usuarios_panel al registrarse
-- ════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_rest uuid;
begin
    -- restaurante_id viene en los metadatos del registro (lo manda el panel)
    v_rest := nullif(new.raw_user_meta_data->>'restaurante_id', '')::uuid;

    -- Solo crear si no existe ya una fila para este usuario
    if not exists (select 1 from usuarios_panel where user_id = new.id) then
        insert into usuarios_panel (user_id, nombre, rol, restaurante_id)
        values (
            new.id,
            coalesce(nullif(new.raw_user_meta_data->>'nombre',''), split_part(new.email, '@', 1)),
            'empleado',                 -- ← SIEMPRE empleado, fijo del servidor
            v_rest
        );
    end if;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();


-- ════════════════════════════════════════════
-- 3. RLS en usuarios_panel
-- ════════════════════════════════════════════
alter table usuarios_panel enable row level security;

-- Cada usuario ve su propia fila (para que el panel sepa su rol)
drop policy if exists usuarios_panel_select_own on usuarios_panel;
create policy usuarios_panel_select_own on usuarios_panel
    for select using (user_id = auth.uid());

-- El dueño ve todas las filas de SU restaurante (para gestionarlas)
drop policy if exists usuarios_panel_select_dueno on usuarios_panel;
create policy usuarios_panel_select_dueno on usuarios_panel
    for select using (
        restaurante_id = obtener_restaurante_actual() and es_dueno()
    );

-- El dueño puede actualizar filas de su restaurante (ascender/cambiar rol)
drop policy if exists usuarios_panel_update_dueno on usuarios_panel;
create policy usuarios_panel_update_dueno on usuarios_panel
    for update using (
        restaurante_id = obtener_restaurante_actual() and es_dueno()
    ) with check (
        restaurante_id = obtener_restaurante_actual()
    );


notify pgrst, 'reload schema';
