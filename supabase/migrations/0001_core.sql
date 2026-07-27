-- WAFI core schema — SPEC §6.
-- El backend (service_role) es la única fuente de verdad; las policies de RLS
-- cubren los accesos desde el browser (dashboard del comercio y landing del cliente).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Comercios
-- ---------------------------------------------------------------------------
create table merchants (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,            -- para /j/{slug}
  name              text not null,
  address           text,
  lat               double precision,
  lng               double precision,                -- para geolocalización del pass
  logo_url          text,
  cover_url         text,
  brand_color       text not null default '#2D2D2D',
  stamps_required   int  not null default 10 check (stamps_required between 1 and 20),
  prize_description text not null,
  is_active         boolean not null default true,
  google_class_id   text,                            -- LoyaltyClass creada (lazy)
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Usuarios de dashboard por comercio
-- ---------------------------------------------------------------------------
create table merchant_users (
  user_id     uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','staff')),
  primary key (user_id, merchant_id)
);

-- ---------------------------------------------------------------------------
-- Clientes finales (identidad liviana: email sin verificar al momento del alta)
-- ---------------------------------------------------------------------------
create table customers (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  email_verified_at timestamptz,
  name              text,
  auth_user_id      uuid references auth.users(id),  -- se vincula al primer magic link
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- La tarjeta: par cliente+comercio. Su qr_token es lo que viaja en el QR del pass.
-- ---------------------------------------------------------------------------
create table cards (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references customers(id),
  merchant_id      uuid not null references merchants(id),
  qr_token         text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  current_stamps   int not null default 0 check (current_stamps >= 0),
  total_stamps     int not null default 0,
  prizes_redeemed  int not null default 0,
  last_stamp_at    timestamptz,
  google_object_id text,                             -- LoyaltyObject emitido
  apple_auth_token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  apple_updated_at timestamptz not null default now(), -- para passesUpdatedSince
  created_at       timestamptz not null default now(),
  unique (customer_id, merchant_id)
);

-- ---------------------------------------------------------------------------
-- Ledger inmutable de movimientos (nunca se edita ni se borra)
-- ---------------------------------------------------------------------------
create table stamp_events (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references cards(id),
  merchant_id  uuid not null references merchants(id),
  customer_id  uuid not null references customers(id),
  type         text not null check (type in ('stamp','redeem','adjust')),
  stamps_delta int  not null,
  created_by   uuid references auth.users(id),       -- usuario de dashboard que operó
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Registraciones de dispositivos Apple (PassKit web service)
-- ---------------------------------------------------------------------------
create table apple_registrations (
  id                        uuid primary key default gen_random_uuid(),
  card_id                   uuid not null references cards(id) on delete cascade,
  device_library_identifier text not null,
  push_token                text not null,
  active                    boolean not null default true,
  created_at                timestamptz not null default now(),
  unique (device_library_identifier, card_id)
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
-- cards(qr_token) y cards(customer_id, merchant_id) ya tienen índice por unique.
create index cards_merchant_id_idx on cards (merchant_id);
create index cards_customer_id_idx on cards (customer_id);
create index stamp_events_card_created_idx on stamp_events (card_id, created_at desc);
create index stamp_events_merchant_created_idx on stamp_events (merchant_id, created_at desc);
create index apple_registrations_card_active_idx on apple_registrations (card_id) where active;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table merchants           enable row level security;
alter table merchant_users      enable row level security;
alter table customers           enable row level security;
alter table cards               enable row level security;
alter table stamp_events        enable row level security;
alter table apple_registrations enable row level security;

-- Helper: los merchant_id a los que pertenece el usuario autenticado.
-- security definer para poder leer merchant_users sin recursión de policies.
create or replace function public.current_user_merchant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select merchant_id from merchant_users where user_id = auth.uid();
$$;

-- Comercio: sus miembros leen su propia fila y pueden editarla.
create policy "merchant members read own merchant"
  on merchants for select to authenticated
  using (id in (select public.current_user_merchant_ids()));

create policy "merchant members update own merchant"
  on merchants for update to authenticated
  using (id in (select public.current_user_merchant_ids()))
  with check (id in (select public.current_user_merchant_ids()));

-- Membresías: cada usuario ve las suyas.
create policy "users read own memberships"
  on merchant_users for select to authenticated
  using (user_id = auth.uid());

-- Tarjetas: las lee el comercio dueño, o el cliente dueño de la tarjeta.
create policy "merchant members read own cards"
  on cards for select to authenticated
  using (merchant_id in (select public.current_user_merchant_ids()));

create policy "customers read own cards"
  on cards for select to authenticated
  using (customer_id in (select id from customers where auth_user_id = auth.uid()));

-- Eventos: idem tarjetas.
create policy "merchant members read own events"
  on stamp_events for select to authenticated
  using (merchant_id in (select public.current_user_merchant_ids()));

create policy "customers read own events"
  on stamp_events for select to authenticated
  using (customer_id in (select id from customers where auth_user_id = auth.uid()));

-- Clientes: cada uno lee su propia fila (para la landing /mi).
create policy "customers read own row"
  on customers for select to authenticated
  using (auth_user_id = auth.uid());

-- Nota: no hay policies de insert/update/delete para el rol authenticated.
-- Toda escritura de negocio (enroll, stamp, redeem) pasa por el server con
-- service_role, que bypassa RLS. apple_registrations queda sin policies:
-- solo la toca el PassKit web service desde el server.
