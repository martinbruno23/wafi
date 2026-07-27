-- Rate limiting simple para endpoints públicos (SPEC §10).
-- Ventana fija por clave; alcanza para el piloto. Si el volumen crece,
-- reemplazar por Upstash Redis sin tocar los call sites.

create table rate_limits (
  bucket     text primary key,      -- ej: "enroll:190.1.2.3"
  count      int not null default 0,
  expires_at timestamptz not null
);

create index rate_limits_expires_idx on rate_limits (expires_at);

alter table rate_limits enable row level security;
-- Sin policies: solo el server (service_role) la toca.

/**
 * Incrementa el contador de `p_key` y devuelve true si sigue dentro del límite.
 * La ventana arranca en la primera request y dura p_window_seconds.
 */
create or replace function public.check_rate_limit(
  p_key            text,
  p_limit          int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from rate_limits where expires_at < now();

  insert into rate_limits as rl (bucket, count, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set count = rl.count + 1
  returning rl.count into v_count;

  return v_count <= p_limit;
end $$;

revoke execute on function public.check_rate_limit(text, int, int) from public;
grant  execute on function public.check_rate_limit(text, int, int) to service_role;
