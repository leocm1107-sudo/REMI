-- ============================================================
--  RLS para la pantalla de Logística
--  Permite que el panel lea la cola, los rangos y configure.
-- ============================================================

-- ---------- config_tiempos: empleado lee, dueño modifica ----------
alter table config_tiempos enable row level security;

drop policy if exists config_tiempos_select on config_tiempos;
create policy config_tiempos_select on config_tiempos
    for select using (restaurante_id = obtener_restaurante_actual());

drop policy if exists config_tiempos_modify_dueno on config_tiempos;
create policy config_tiempos_modify_dueno on config_tiempos
    for all using (
        restaurante_id = obtener_restaurante_actual() and es_dueno()
    );

-- ---------- horarios_restaurante: empleado lee, dueño modifica ----------
alter table horarios_restaurante enable row level security;

drop policy if exists horarios_select on horarios_restaurante;
create policy horarios_select on horarios_restaurante
    for select using (restaurante_id = obtener_restaurante_actual());

drop policy if exists horarios_modify_dueno on horarios_restaurante;
create policy horarios_modify_dueno on horarios_restaurante
    for all using (
        restaurante_id = obtener_restaurante_actual() and es_dueno()
    );

-- ---------- La vista v_cola_hoy hereda RLS de pedidos ----------
-- Como v_cola_hoy lee de pedidos (que ya tiene RLS por restaurante),
-- y de clientes (idem), la vista respeta automáticamente el aislamiento.
-- Pero hay que asegurar que la vista corra con permisos del invocador.
alter view v_cola_hoy set (security_invoker = true);

notify pgrst, 'reload schema';
