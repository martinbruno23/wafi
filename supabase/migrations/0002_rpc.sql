-- RPCs transaccionales de sellado y canje.
-- Garantizan la invariante del SPEC §6: todo cambio de `cards` escribe su
-- `stamp_event` en la misma transacción. El server nunca hace UPDATE directo.

-- ---------------------------------------------------------------------------
-- Sellar: +1 sello. Siempre permitido sobre una card existente.
-- current_stamps puede superar stamps_required (el cliente no pierde sellos
-- si sigue comprando sin canjear).
-- ---------------------------------------------------------------------------
create or replace function public.apply_stamp(p_card_id uuid, p_created_by uuid)
returns cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card cards;
begin
  update cards
     set current_stamps   = current_stamps + 1,
         total_stamps     = total_stamps + 1,
         last_stamp_at    = now(),
         apple_updated_at = now()
   where id = p_card_id
  returning * into v_card;

  if not found then
    raise exception 'CARD_NOT_FOUND';
  end if;

  insert into stamp_events (card_id, merchant_id, customer_id, type, stamps_delta, created_by)
  values (v_card.id, v_card.merchant_id, v_card.customer_id, 'stamp', 1, p_created_by);

  return v_card;
end $$;

-- ---------------------------------------------------------------------------
-- Canjear: descuenta stamps_required. Falla con NO_PRIZE si no alcanza.
-- ---------------------------------------------------------------------------
create or replace function public.apply_redeem(p_card_id uuid, p_created_by uuid)
returns cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card     cards;
  v_required int;
begin
  select m.stamps_required
    into v_required
    from cards c
    join merchants m on m.id = c.merchant_id
   where c.id = p_card_id;

  if not found then
    raise exception 'CARD_NOT_FOUND';
  end if;

  update cards
     set current_stamps   = current_stamps - v_required,
         prizes_redeemed  = prizes_redeemed + 1,
         apple_updated_at = now()
   where id = p_card_id
     and current_stamps >= v_required
  returning * into v_card;

  if not found then
    raise exception 'NO_PRIZE';
  end if;

  insert into stamp_events (card_id, merchant_id, customer_id, type, stamps_delta, created_by)
  values (v_card.id, v_card.merchant_id, v_card.customer_id, 'redeem', -v_required, p_created_by);

  return v_card;
end $$;

-- Estas funciones solo se invocan desde el server (service_role).
-- Postgres otorga EXECUTE a PUBLIC por defecto: hay que revocarlo de PUBLIC
-- (revocarlo solo de anon/authenticated no tendría efecto) y luego otorgarlo
-- explícitamente al rol que las usa.
revoke execute on function public.apply_stamp(uuid, uuid)  from public;
revoke execute on function public.apply_redeem(uuid, uuid) from public;
grant  execute on function public.apply_stamp(uuid, uuid)  to service_role;
grant  execute on function public.apply_redeem(uuid, uuid) to service_role;
