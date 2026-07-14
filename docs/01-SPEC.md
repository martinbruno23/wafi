# WAFI v2 — Product Spec

Versión 2.0 · Julio 2026 · Reemplaza al spec v1 ("Customer App", marzo 2026)

---

## 1. Qué es WAFI y qué cambió respecto de v1

WAFI es una plataforma de fidelización para cafés de especialidad y comercios gastronómicos. El cliente acumula sellos digitales por cada consumo y canjea premios, reemplazando la tarjeta de cartón.

**Cambio central respecto de v1:** se elimina la app mobile del cliente. La tarjeta de fidelización vive en **Apple Wallet / Google Wallet**, y el comercio opera desde un **dashboard web**. Motivos:

- Cero fricción para el cliente: no descarga app, no crea cuenta. Toca "Agregar a Wallet" una vez.
- Cero fricción de distribución: sin App Store / Play Store, sin revisiones, sin mantenimiento de builds nativas.
- Valida el producto con mínima inversión. La app nativa queda como evolución futura (§11), no como requisito.

**Trade-offs aceptados** (decisión tomada, no reabrir sin causa):

- El pass de wallet es una plantilla rígida: logo, color, un par de campos de texto, una imagen (strip) y un QR. No hay animaciones, personaje, ni personalización rica. Ese engagement se recupera parcialmente con la landing del cliente (§7.6) y totalmente con la app futura.
- No hay pantalla "Explorar" ni discovery de comercios. El alta es siempre presencial (QR en el local) o por link directo.

## 2. Arquitectura: core headless + clientes

```
                ┌─────────────────────────────────┐
                │  CORE (Next.js API + Supabase)   │
                │  Fuente de verdad única:         │
                │  merchants · customers · cards   │
                │  stamps · canjes · reglas        │
                └───────────────┬─────────────────┘
                                │  API interna
      ┌──────────────┬─────────┴─────┬───────────────┬─────────────┐
      │              │               │               │             │
 Google Wallet  Apple Wallet    Dashboard        Landing       App nativa
  (Etapa 2)      (Etapa 4)      comercio         cliente       (futuro §11)
                                (Etapa 3)        (Etapa 5)
```

Regla de oro: **toda la lógica de negocio vive en el core**. Los passes de wallet son proyecciones de solo lectura del estado del server, actualizadas por push. La app futura será otro cliente del mismo core: evolucionar no es migrar, es sumar un cliente.

### Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Un solo proyecto: dashboard, landings y API |
| UI | Tailwind CSS + shadcn/ui | Tokens del design system en §9 |
| DB + Auth | Supabase (Postgres, Auth, RLS) | Cliente `@supabase/supabase-js` + `@supabase/ssr` |
| Hosting | Vercel | Functions con Fluid Compute (Node.js) |
| Google Wallet | REST API `walletobjects` + `google-auth-library` | Gratis |
| Apple Wallet | `passkit-generator` + PassKit Web Service propio + APNs | Requiere Apple Developer (USD 99/año) |
| Scanner QR | `html5-qrcode` en el navegador del comercio | Sin app nativa para el comercio tampoco |
| Emails | Resend (transaccionales) + Supabase Auth (magic links) | |
| Tests | Vitest | Lógica de dominio con cobertura obligatoria |

## 3. Actores y superficies

| Actor | Superficie | Qué hace |
|---|---|---|
| **Cliente** | Su wallet (Apple/Google) + landing de alta + landing personal | Se enrola, muestra su QR, ve su progreso |
| **Cajero** | Página Scanner del dashboard (celu/tablet del local) | Escanea el QR del cliente, sella o canjea |
| **Dueño del comercio** | Dashboard | Configura tarjeta, premio, branding; ve métricas; descarga su QR de alta |
| **Admin WAFI (Martín)** | Supabase Studio + dashboard (rol admin, post-MVP) | Alta de comercios en el MVP |

## 4. Inversión del escaneo (decisión clave)

En v1 el cliente escaneaba un QR fijo del local. En v2 **se invierte**:

- El pass del cliente lleva un QR con el `qr_token` de su tarjeta.
- **El comercio escanea al cliente** desde la página Scanner (cámara del navegador).
- El backend valida que la tarjeta pertenezca al comercio autenticado, aplica sello o canje, y pushea la actualización al pass.

Ventajas: el que escribe sellos es siempre el comercio autenticado (anti-fraude estructural, sin geolocalización), y un solo gesto sirve para sellar y canjear.

## 5. Flujos

### 5.1 Alta de comercio (MVP: manual)

1. Martín crea el merchant en la DB (Supabase Studio o script seed): nombre, slug, brand_color, logo, sellos requeridos, premio.
2. Crea el usuario de dashboard (Supabase Auth) y lo vincula (`merchant_users`).
3. El sistema crea la LoyaltyClass de Google Wallet para ese merchant (lazy, al primer enrolamiento).
4. El comercio entra al dashboard y descarga su **QR de alta** (apunta a `/j/{slug}`) para imprimir.

Self-service onboarding de comercios: post-MVP.

### 5.2 Enrolamiento del cliente (el momento más crítico del producto)

```
QR/link del local  →  Landing de alta  →  Email  →  Add to Wallet  →  Listo
  (mostrador)         (branding café)    (1 campo)  (sheet nativo)    (~15 seg)
```

1. El comercio exhibe su QR estático → apunta a `/j/{slug}`. Es el mismo QR para siempre; va impreso en mostrador, mesas, Instagram.
2. El cliente lo escanea con la **cámara nativa** del teléfono. Se abre la landing de alta en el navegador: logo y color del café, texto del premio ("Juntá 10 y el 11° va de regalo"), **un solo campo: email**, botón "Agregar a mi Wallet".
3. **Detección de plataforma** por user-agent:
   - iOS/Safari → se sirve el `.pkpass` → sheet nativo de Apple Wallet.
   - Android/Chrome → botón "Guardar en Google Wallet" (save link JWT).
   - Desktop → QR en pantalla para escanear con el celular + opción de recibirlo por mail.
4. Backend: upsert de `customer` por email (sin verificar), creación de `card` (par customer+merchant), emisión del pass.

**Decisiones cerradas del enrolamiento:**

- **Email sin verificar en el alta.** La verificación (magic link) ocurre recién cuando el cliente quiere entrar a su landing personal. La identidad operativa del pass es el `qr_token` de la tarjeta; el email es el ancla para el futuro (landing + app). Un typo en el email no rompe nada: la tarjeta funciona igual y se corrige después.
- **Mismo cliente, segundo café**: mismo email en `/j/{otro-cafe}` → encuentra el customer existente → crea una segunda card → segundo pass. Dos passes en la wallet, una sola cuenta.
- **Re-escaneo en un café donde ya está enrolado**: no se duplica la card. La landing muestra "Ya tenés esta tarjeta" + botón para re-agregar el pass (por si lo borró de la wallet).
- No se pide nombre, teléfono ni ningún otro dato. Solo email.

### 5.3 Sellado

1. Cliente muestra su pass (la wallet lo sugiere sola en el lockscreen por geolocalización del pass).
2. Cajero, con la página Scanner abierta y sesión iniciada, escanea el QR.
3. Backend: valida `qr_token` → valida que `card.merchant_id` == merchant de la sesión (si no: rechaza con "Esta tarjeta es de otro comercio") → responde estado de la tarjeta.
4. Scanner muestra al cajero: nombre/email parcial del cliente, sellos actuales, y las acciones disponibles.
5. Cajero toca **"Sellar"** → backend registra `stamp_event(+1)` → actualiza `card` → pushea actualización a los passes (Google: PATCH; Apple: APNs → el device re-descarga el pass).
6. El cliente ve el pass actualizado (la wallet muestra notificación de cambio en lockscreen, gratis).

Regla: `current_stamps` puede superar `stamps_required` (el cliente puede seguir comprando sin canjear; no pierde sellos).

### 5.4 Canje del premio

No hay QR nuevo ni countdown (elimina el flujo v1 de token efímero). **El mismo QR del pass sirve para canjear**:

1. Cuando `current_stamps >= stamps_required`, el pass muestra "🎉 Premio disponible" (campo de texto actualizado por push).
2. El cajero escanea el mismo QR de siempre. El Scanner detecta el estado y ofrece dos botones: **"Canjear premio"** y **"Sellar"** (por si el cliente compra pero no quiere canjear hoy).
3. "Canjear premio" pide confirmación → backend registra `stamp_event(type='redeem', delta=-stamps_required)`, incrementa `prizes_redeemed` → push a los passes.
4. La seguridad del canje es la confirmación explícita del cajero autenticado, no un token efímero. Suficiente para este perfil de riesgo (un café gratis).

### 5.5 Baja / borrado del pass

- Apple avisa por su web service (DELETE registration) → se marca la registration como inactiva. La card **no** se borra: si el cliente vuelve a `/j/{slug}`, recupera su progreso.
- Google no avisa de forma confiable → no hacer nada; el objeto queda huérfano sin costo.

### 5.6 Landing personal del cliente (Etapa 5)

El pass lleva en el reverso un link "Ver mi WAFI" → `/mi`. Login por **magic link** (Supabase Auth, email OTP) contra el mismo email del alta. Muestra: todas sus tarjetas con progreso visual rico, fotos del café, detalle del premio, historial. Es el puente de engagement que la wallet no da, y el futuro home de la app.

## 6. Modelo de datos (Postgres / Supabase)

```sql
-- Comercios
create table merchants (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,           -- para /j/{slug}
  name             text not null,
  address          text,
  lat              double precision,
  lng              double precision,               -- para geolocalización del pass
  logo_url         text,
  cover_url        text,
  brand_color      text not null default '#2D2D2D',
  stamps_required  int  not null default 10 check (stamps_required between 1 and 20),
  prize_description text not null,
  is_active        boolean not null default true,
  google_class_id  text,                           -- LoyaltyClass creada (lazy)
  created_at       timestamptz not null default now()
);

-- Usuarios de dashboard por comercio
create table merchant_users (
  user_id     uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','staff')),
  primary key (user_id, merchant_id)
);

-- Clientes finales (identidad liviana, email sin verificar al alta)
create table customers (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  email_verified_at timestamptz,
  name              text,
  auth_user_id      uuid references auth.users(id), -- se vincula al primer magic link
  created_at        timestamptz not null default now()
);

-- La tarjeta: par cliente+comercio. Su qr_token es lo que viaja en el QR del pass.
create table cards (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references customers(id),
  merchant_id      uuid not null references merchants(id),
  qr_token         text unique not null default encode(gen_random_bytes(24), 'hex'),
  current_stamps   int not null default 0 check (current_stamps >= 0),
  total_stamps     int not null default 0,
  prizes_redeemed  int not null default 0,
  last_stamp_at    timestamptz,
  google_object_id text,                            -- LoyaltyObject emitido
  apple_auth_token text not null default encode(gen_random_bytes(16), 'hex'),
  apple_updated_at timestamptz not null default now(), -- para passesUpdatedSince
  created_at       timestamptz not null default now(),
  unique (customer_id, merchant_id)
);

-- Ledger inmutable de movimientos (nunca se edita ni borra)
create table stamp_events (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references cards(id),
  merchant_id  uuid not null references merchants(id),
  customer_id  uuid not null references customers(id),
  type         text not null check (type in ('stamp','redeem','adjust')),
  stamps_delta int  not null,
  created_by   uuid references auth.users(id),      -- el usuario de dashboard que operó
  note         text,
  created_at   timestamptz not null default now()
);

-- Registraciones de dispositivos Apple (PassKit web service)
create table apple_registrations (
  id                        uuid primary key default gen_random_uuid(),
  card_id                   uuid not null references cards(id) on delete cascade,
  device_library_identifier text not null,
  push_token                text not null,
  active                    boolean not null default true,
  created_at                timestamptz not null default now(),
  unique (device_library_identifier, card_id)
);
```

**RLS:** activar en todas las tablas. Los route handlers del server usan la `service_role` key (bypass). Para el dashboard, policies que permiten a un `merchant_user` leer solo filas de su `merchant_id`. Los clientes solo acceden vía landing autenticada (policies por `auth_user_id`).

**Invariantes de dominio (implementar en un módulo puro, con tests):**

- `stamp`: `current_stamps += 1`, `total_stamps += 1`, `last_stamp_at = now()`. Siempre permitido sobre card activa.
- `redeem`: requiere `current_stamps >= stamps_required`; efecto: `current_stamps -= stamps_required`, `prizes_redeemed += 1`.
- Todo cambio de `cards` genera su `stamp_event` en la misma transacción (RPC de Postgres o transacción en el server).
- `hasPrize(card, merchant) = card.current_stamps >= merchant.stamps_required`.

## 7. Contrato de API

Route handlers de Next.js bajo `/app/api/`. Formato de error uniforme: `{ error: { code: string, message: string } }` con HTTP status semántico.

### Públicos (sin auth)

| Método y ruta | Body / params | Respuesta | Notas |
|---|---|---|---|
| `GET /api/merchants/[slug]` | — | `{ name, brandColor, logoUrl, stampsRequired, prizeDescription }` | Para la landing de alta |
| `POST /api/enroll` | `{ merchantSlug, email, platform: 'google'\|'apple'\|'unknown' }` | `{ cardId, existing: boolean, google?: { saveUrl }, apple?: { pkpassUrl } }` | Upsert customer + card. Rate-limited por IP |
| `GET /api/passes/apple/[cardId]` | query `?t={apple_auth_token}` | binario `.pkpass` | El token evita descargas de terceros |

### Autenticados como comercio (sesión Supabase + membership en `merchant_users`)

| Método y ruta | Body | Respuesta | Notas |
|---|---|---|---|
| `GET /api/scan/[qrToken]` | — | `{ cardId, customerEmailMasked, currentStamps, stampsRequired, hasPrize }` | 403 `WRONG_MERCHANT` si la card es de otro comercio |
| `POST /api/cards/[cardId]/stamp` | `{}` | `{ currentStamps, hasPrize }` | Registra evento + push a wallets |
| `POST /api/cards/[cardId]/redeem` | `{}` | `{ currentStamps, prizesRedeemed }` | 409 `NO_PRIZE` si no alcanza |
| `GET /api/merchants/me` | — | config del merchant | |
| `PATCH /api/merchants/me` | campos editables | config actualizada | brand_color, premio, etc. |
| `GET /api/merchants/me/events?limit=50` | — | lista de stamp_events con datos del cliente | historial / actividad |

### PassKit Web Service de Apple (contrato fijado por Apple, no modificar)

Base: `/api/apple-wallet/v1`. Auth: header `Authorization: ApplePass {apple_auth_token}`.

| Método y ruta | Función |
|---|---|
| `POST /devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}` | Registrar device (guarda push_token). El `serial` es el `card_id` |
| `GET /devices/{deviceLibraryId}/registrations/{passTypeId}?passesUpdatedSince=X` | Serials actualizados desde X |
| `GET /passes/{passTypeId}/{serial}` | Devuelve el `.pkpass` regenerado (con `Last-Modified`) |
| `DELETE /devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}` | Desregistrar device |
| `POST /log` | Logs de error de iOS → volcar a logs del server |

## 8. Especificación de los passes

### 8.1 Google Wallet (Etapa 2 — primero, y por qué)

Google va primero porque: (a) la API es mucho más simple (REST + JWT, sin certificados ni web service propio), (b) el push de actualización lo maneja Google con un simple PATCH, (c) en Argentina Android es ~80% del mercado. Permite validar el flujo end-to-end completo antes de pelear con APNs.

- **Issuer**: cuenta en Google Pay & Wallet Console + service account con permiso sobre el issuer. Gratis. Empieza en modo demo (passes solo para testers) → pedir aprobación de publicación antes del piloto.
- **LoyaltyClass** (una por merchant, id `{issuerId}.{merchant-slug}`): programName, logo, `hexBackgroundColor` = brand_color.
- **LoyaltyObject** (uno por card, id `{issuerId}.{card-uuid}`): `loyaltyPoints.balance` = "7 / 10", `barcode { type: QR_CODE, value: qr_token }`, textModule con el premio, estado "🎉 Premio disponible" cuando corresponde, `linksModuleData` con el link a `/mi`.
- **Save link**: JWT RS256 firmado con la service account: `{ iss: <sa-email>, aud: 'google', typ: 'savetowallet', payload: { loyaltyObjects: [{ id }] } }` → URL `https://pay.google.com/gp/v/save/{jwt}`.
- **Actualización**: `PATCH https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/{id}` tras cada stamp/redeem. Google pushea al device.

### 8.2 Apple Wallet (Etapa 4)

- **Requisitos**: Apple Developer Program (USD 99/año), Pass Type ID (`pass.app.wafi.card`), certificado del Pass Type ID + WWDR intermedio. ⚠️ TAREA HUMANA.
- **Pass**: estilo `storeCard`, generado con `passkit-generator`. Campos: header = nombre del café; primary = "Sellos: 7 de 10"; secondary = premio; back = link a `/mi` + ayuda. `barcodes: [{ format: 'PKBarcodeFormatQR', message: qr_token, messageEncoding: 'iso-8859-1' }]`. Colores desde brand_color. `locations` con lat/lng del café (sugiere el pass en lockscreen cerca del local). `webServiceURL` + `authenticationToken` (= `apple_auth_token` de la card).
- **Actualización**: al cambiar la card → APNs HTTP/2 POST a `api.push.apple.com/3/device/{pushToken}` con payload `{}` y topic = passTypeIdentifier, autenticado con el certificado del Pass Type ID (mTLS) → iOS llama al web service → re-descarga el pass.
- **Serial number** del pass = `card_id`.

### 8.3 Progreso visual (strip image)

MVP: el progreso es texto ("7 de 10"). Mejora en Etapa 5: **strip image** generada server-side (círculos llenos/vacíos con el brand_color, estilo del design system §9) regenerada en cada actualización. Misma imagen para el `strip` de Apple y opcionalmente hero de Google.

## 9. Design System (dashboard + landings)

Se hereda la identidad del spec v1: minimalista, cálido, artesanal-digital. Estética de cafetería de especialidad, no de banco ni de startup genérica.

### Tokens

| Token | Valor |
|---|---|
| `--background` | `#FAFAF8` (off-white cálido) |
| `--surface` | `#FFFFFF` |
| `--surface-alt` | `#F5F3EF` (crema) |
| `--text-primary` | `#1A1A1A` |
| `--text-secondary` | `#6B6560` |
| `--accent` | `#2D2D2D` (CTAs) |
| `--error` | `#D94F3D` |
| `--warning` | `#E8924A` |
| `--success` | `#4A8C5C` |
| `--border` | `#ECEAE6` |
| Stamp activo | `brand_color` del comercio |
| Stamp vacío | `#E8E4DF` |

**Implementación (Tailwind v4 + shadcn/ui):** los valores de arriba son la paleta canónica, pero en el código se exponen con los **nombres semánticos de shadcn/ui** para que sus componentes funcionen sin fricción. Mapeo: `--foreground`=text-primary, `--card`/`--popover`=surface, `--primary`=accent (CTA #2D2D2D), `--secondary`/`--muted`/`--accent`(shadcn, hover)=surface-alt, `--muted-foreground`=text-secondary, `--destructive`=error, `--border`/`--input`=border, `--ring`=#2D2D2D. Los extras WAFI (`--warning`, `--success`, `--stamp-empty`) se agregan aparte. Tokens definidos en `src/app/globals.css` bajo `@theme inline` (Tailwind v4 no usa `tailwind.config.js`). Tema claro único, sin dark mode.

- Tipografía: sans humanista (Inter de Google Fonts, vía `next/font`). Display 32/700 · Title 22/700 · Subtitle 17/600 · Body 15/400 · Caption 13/400.
- Radius: cards 20px · botones 14px · pills 999px. Spacing en múltiplos de 4.
- El `brand_color` del comercio tiñe: stamps activos, acentos de su landing de alta, y su pass.
- Anti-referencias (vigentes de v1): sin gradientes pesados, sin sombras excesivas, sin mayúsculas en navegación, animaciones < 500ms.
- Landing de alta y landing `/mi`: mobile-first estricto (375–430px). Dashboard: desktop-first con Scanner mobile-first (se usa desde el celu del local).

## 10. Seguridad y anti-fraude

- Sellos y canjes: solo vía endpoints autenticados de comercio; validación de pertenencia card↔merchant en cada operación.
- `qr_token` opaco (24 bytes random), sin datos codificados. Rotación de token: no en MVP (documentado como mejora si aparece abuso).
- Rate limiting en `/api/enroll` (por IP) y en scan/stamp (por merchant) — Upstash Redis o contador simple en Postgres para MVP.
- `stamp_events` es un ledger inmutable: auditoría completa de cada sello y canje, con `created_by`.
- Passes descargables solo con su token (`apple_auth_token` / save-link JWT de un solo objeto).
- Secrets (service account de Google, certificados de Apple) solo en env vars de Vercel, nunca en el repo. Certificados en base64.

## 11. Evolución futura (fuera de scope, pero protegida por diseño)

- **App nativa / PWA rica**: consume la misma API. El login del cliente ya existe (magic link por email). El día uno de la app, el usuario se loguea y ve sus tarjetas con todos sus sellos. Nada se migra.
- **Self-service de comercios**: signup + onboarding + billing (hoy: alta manual).
- Multi-premio, vencimiento de sellos, referidos: el ledger `stamp_events` y el campo `type='adjust'` ya lo soportan estructuralmente.

## 12. Decisiones pendientes (no bloquean Etapas 0–4)

| Decisión | Default si no se decide |
|---|---|
| Dominio (¿wafi.app? ¿getwafi.com?) | Subdominio `*.vercel.app` para el piloto |
| Nombre del remitente de emails | "WAFI" vía Resend con dominio por defecto |
| ¿Cobrar al comercio en el piloto? | Piloto gratis, 2–3 cafés |
