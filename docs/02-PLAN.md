# WAFI v2 — Plan de implementación

> **Para agentes ejecutores:** Leé primero [docs/01-SPEC.md](01-SPEC.md) completo — es la fuente de verdad de toda decisión. Ejecutá las etapas **en orden**. Cada tarea termina con verificación y commit. Marcá los checkboxes `- [x]` en este archivo a medida que completás. Si tenés disponibles las skills `superpowers:executing-plans` o `superpowers:subagent-driven-development`, usalas para ejecutar este plan; si no, seguilo secuencialmente igual. Las tareas **⚠️ TAREA HUMANA** las hace Martín — si una bloquea, avisale y seguí con lo que no dependa de ella.

**Goal:** Plataforma de fidelización sin app: tarjeta de sellos en Google/Apple Wallet + dashboard web para el comercio, lista para piloto con 2–3 cafés.

**Arquitectura:** Core headless (Next.js API + Supabase) como única fuente de verdad; los passes de wallet son proyecciones actualizadas por push; dashboard y landings son clientes del mismo core.

**Tech Stack:** Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase · Vercel · `google-auth-library` · `passkit-generator` · `html5-qrcode` · Vitest.

## Restricciones globales (aplican a TODAS las tareas)

- Código en inglés; UI/copys en español rioplatense con voseo.
- La lógica de dominio (sellar, canjear, invariantes) vive en módulos puros de `src/lib/domain/` con tests Vitest. Los route handlers solo orquestan.
- Los route handlers del server usan la key `service_role` de Supabase **solo en servidor** (nunca llega al cliente). El browser usa la `anon` key con RLS.
- Todo cambio de `cards` escribe su `stamp_event` en la misma transacción (RPC de Postgres).
- Errores de API: `{ error: { code, message } }` + HTTP status correcto.
- Commit al final de cada tarea, mensajes convencionales (`feat:`, `fix:`, `chore:`).
- No introducir dependencias fuera de las listadas sin documentarlo en el SPEC §2.

---

## Etapa 0 — Setup del proyecto

**Objetivo:** repo inicializado, Next.js corriendo, Supabase conectado, deployado en Vercel. Al final: una página "WAFI" visible en una URL pública.

### Tarea 0.1 — ⚠️ TAREA HUMANA: cuentas

- [ ] Crear proyecto en [supabase.com](https://supabase.com) (plan free). Guardar: `Project URL`, `anon key`, `service_role key` (Settings → API).
- [ ] Tener cuenta de Vercel y (recomendado) instalar CLI: `npm i -g vercel`.
- [ ] (Para Etapa 2, se puede hacer ya) Crear cuenta en [Google Pay & Wallet Console](https://pay.google.com/business/console) → sección Google Wallet API → obtener **Issuer ID**. Crear un proyecto en Google Cloud Console, habilitar "Google Wallet API", crear **service account**, descargar su JSON key, y en Wallet Console autorizar el email de la service account como usuario del issuer.

### Tarea 0.2 — Scaffold

> **Notas de ejecución (2026-07-13):** el scaffold quedó en **Next.js 16.2 + Tailwind v4 + React 19**. Tailwind v4 **no usa `tailwind.config.js`**: los tokens van en `@theme` dentro de `globals.css`. `shadcn init` de la v4.13 abre un menú de presets interactivo que además pisa los tokens, así que la base de shadcn (`components.json` + `cn()` en `src/lib/utils.ts` + deps `class-variance-authority clsx tailwind-merge lucide-react tw-animate-css`) se armó **a mano**, mapeando los nombres semánticos de shadcn (`--primary`, `--accent`, `--border`, …) a la paleta WAFI (ver SPEC §9). Fuente: **Inter** vía `next/font` con la variable `--font-inter`.

- [x] `git init` en la raíz del proyecto.
- [x] Crear app Next.js con TypeScript + Tailwind + App Router + src dir:
  ```bash
  npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint-strict 2>/dev/null || npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
  ```
  (Si la carpeta no está vacía por los docs, crear en un temp y mover, preservando `docs/` y `CLAUDE.md`.)
- [x] Instalar dependencias base:
  ```bash
  npm i @supabase/supabase-js @supabase/ssr zod
  npm i -D vitest @vitest/coverage-v8
  npx shadcn@latest init
  ```
- [x] Configurar Vitest: crear `vitest.config.ts` con `test: { include: ['src/**/*.test.ts'] }` y script `"test": "vitest run"` en package.json.
- [x] Aplicar tokens del design system (SPEC §9) como CSS variables en `src/app/globals.css` (en Tailwind v4 los tokens van en `@theme inline`, no en `tailwind.config.js`).
- [x] `.env.local` + `.env.example` con: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. `.env.local` en `.gitignore`; `.env.example` exceptuado con `!.env.example` para versionarlo.
- [x] Home provisoria en `src/app/page.tsx`: wordmark "WAFI" centrado sobre `--background`.
- [x] Verificar: `npm run dev` levanta y la home carga sin errores (HTTP 200, wordmark + tagline + `lang="es-AR"`). `npm run build` y `npm test` pasan.
- [x] Commit: `chore: scaffold Next.js app with WAFI design system and Supabase clients`

### Tarea 0.3 — Clientes Supabase + deploy

- [x] Crear `src/lib/supabase/admin.ts` (cliente con service_role + `import "server-only"`) y `src/lib/supabase/server.ts` + `src/lib/supabase/client.ts` (helpers de `@supabase/ssr` 0.12 con patrón `getAll`/`setAll`; `cookies()` es async en Next 16).
- [x] Deploy: hecho vía importación del repo de GitHub en la web de Vercel (en vez de `vercel --prod` por CLI — camino equivalente, con la ventaja de que ahora cada push a `main` deploya solo). Repo: `github.com/martinbruno23/wafi`.
- [x] Verificar: `https://wafi-iota.vercel.app/` responde HTTP 200 con el wordmark WAFI y la tagline.
- [x] Commit: código de los clientes ya commiteado junto al scaffold; el deploy en sí no genera commit (vive en la config de Vercel).

**Definición de terminado Etapa 0:** URL pública viva + `npm test` corre + env vars en Vercel. — **✅ Cumplida (2026-07-24).** URL de producción: `https://wafi-iota.vercel.app/`.

### Notas de ejecución (Martín, 2026-07-24)

- El deploy se hizo por la **web de Vercel** (Import de GitHub) en vez de por CLI — quedó documentado como alternativa válida a los pasos originales de esta tarea.
- Se creó el repo `github.com/martinbruno23/wafi` (privado) y se pusheó `main` con `git remote add origin` + `git push -u origin main`.
- Pendiente de confirmar: cargar `NEXT_PUBLIC_APP_URL=https://wafi-iota.vercel.app` en Vercel (Settings → Environment Variables) y hacer Redeploy — sin esto, la env var sigue apuntando a `localhost:3000` en producción.

---

## Etapa 1 — Core de dominio

**Objetivo:** schema completo en Supabase, lógica de dominio testeada, y los endpoints de negocio funcionando (probables por curl). Sin UI todavía.

### Tarea 1.1 — Migraciones de schema

- [x] Instalar CLI de Supabase (`npm i -D supabase`), `npx supabase init`, `npx supabase link --project-ref <ref>`.
- [x] Crear `supabase/migrations/0001_core.sql` con **exactamente** el schema del SPEC §6 (merchants, merchant_users, customers, cards, stamp_events, apple_registrations), más:
  - `alter table ... enable row level security;` en todas.
  - Policy de lectura para dashboard: miembros de `merchant_users` leen sus `merchants`, `cards`, `stamp_events` (filtrando por `merchant_id in (select merchant_id from merchant_users where user_id = auth.uid())`).
  - Índices: `cards(qr_token)`, `cards(merchant_id)`, `stamp_events(card_id, created_at desc)`, `apple_registrations(card_id) where active`.
- [x] Crear `supabase/migrations/0002_rpc.sql` con dos funciones RPC transaccionales (`security definer`):
  ```sql
  create or replace function apply_stamp(p_card_id uuid, p_created_by uuid)
  returns cards language plpgsql security definer as $$
  declare v_card cards;
  begin
    update cards set current_stamps = current_stamps + 1,
      total_stamps = total_stamps + 1, last_stamp_at = now(),
      apple_updated_at = now()
    where id = p_card_id returning * into v_card;
    if not found then raise exception 'CARD_NOT_FOUND'; end if;
    insert into stamp_events (card_id, merchant_id, customer_id, type, stamps_delta, created_by)
    values (v_card.id, v_card.merchant_id, v_card.customer_id, 'stamp', 1, p_created_by);
    return v_card;
  end $$;

  create or replace function apply_redeem(p_card_id uuid, p_created_by uuid)
  returns cards language plpgsql security definer as $$
  declare v_card cards; v_required int;
  begin
    select m.stamps_required into v_required
      from cards c join merchants m on m.id = c.merchant_id where c.id = p_card_id;
    if not found then raise exception 'CARD_NOT_FOUND'; end if;
    update cards set current_stamps = current_stamps - v_required,
      prizes_redeemed = prizes_redeemed + 1, apple_updated_at = now()
    where id = p_card_id and current_stamps >= v_required
    returning * into v_card;
    if not found then raise exception 'NO_PRIZE'; end if;
    insert into stamp_events (card_id, merchant_id, customer_id, type, stamps_delta, created_by)
    values (v_card.id, v_card.merchant_id, v_card.customer_id, 'redeem', -v_required, p_created_by);
    return v_card;
  end $$;
  ```
- [x] `npx supabase db push` y verificar en Supabase Studio que las tablas existen.
- [x] Commit: `feat: core schema, RLS and stamp/redeem RPCs`

### Tarea 1.2 — Dominio puro + tests

- [x] Crear `src/lib/domain/card.ts` con tipos (`Card`, `Merchant`, `CardScanState`) y funciones puras:
  ```ts
  export function hasPrize(card: { currentStamps: number }, merchant: { stampsRequired: number }): boolean
  export function maskEmail(email: string): string   // "mar***@gmail.com"
  export function toScanState(card, merchant, customer): CardScanState // shape del GET /api/scan
  ```
- [x] Crear `src/lib/domain/card.test.ts` cubriendo: hasPrize en el límite exacto, por encima, por debajo; maskEmail con emails cortos y largos; toScanState completo.
- [x] Verificar: `npm test` → todo verde.
- [x] Commit: `feat: domain logic with tests`

### Tarea 1.3 — Servicio de enrolamiento

- [x] Crear `src/lib/services/enrollment.ts` exportando:
  ```ts
  // Upsert de customer por email (lowercase/trim) + card única por (customer, merchant).
  // Devuelve la card y si ya existía.
  export async function enrollCustomer(merchantSlug: string, email: string):
    Promise<{ card: Card; merchant: Merchant; existing: boolean }>
  ```
  Implementación: buscar merchant activo por slug (404 si no), upsert customer (`on conflict (email)`), `insert ... on conflict (customer_id, merchant_id) do nothing` + select para detectar existente.
- [x] Test de integración liviano `src/lib/services/enrollment.test.ts` mockeando el cliente de Supabase (verificar: normalización de email, `existing=true` en segundo enroll, error con slug inválido).
- [x] Commit: `feat: enrollment service`

### Tarea 1.4 — Endpoints de negocio

- [x] `src/app/api/merchants/[slug]/route.ts` — GET público (SPEC §7).
- [x] `src/app/api/enroll/route.ts` — POST público. Validar body con zod. Por ahora responde `{ cardId, existing }` (los links de wallet se agregan en Etapas 2 y 4). Rate limit mínimo: máx 10 enrolls por IP por hora (tabla `rate_limits` o chequeo por count de customers creados desde esa IP; MVP simple).
- [x] `src/lib/auth/merchant.ts` — helper `requireMerchantSession(request)` que resuelve sesión Supabase + membership en `merchant_users` → `{ userId, merchantId }` o lanza 401/403.
- [x] `src/app/api/scan/[qrToken]/route.ts` — GET autenticado: busca card por `qr_token`, valida `card.merchant_id === session.merchantId` (403 `WRONG_MERCHANT`), responde `toScanState(...)`.
- [x] `src/app/api/cards/[cardId]/stamp/route.ts` y `.../redeem/route.ts` — POST autenticados: validan pertenencia, llaman al RPC (`supabase.rpc('apply_stamp', ...)`), responden estado nuevo. Dejar un hook vacío `notifyWallets(card)` en `src/lib/services/wallet-sync.ts` (no-op por ahora; Etapas 2 y 4 lo completan).
- [x] Crear `scripts/seed.ts` (correr con `npx tsx scripts/seed.ts`): crea un merchant demo ("Café de Prueba", slug `cafe-prueba`, 5 sellos, premio "Café gratis") + un usuario de dashboard `demo@wafi.test` con password, vinculado en `merchant_users`.
- [x] Verificar por curl contra `npm run dev`:
  ```bash
  curl -s localhost:3000/api/merchants/cafe-prueba            # → datos del merchant
  curl -s -X POST localhost:3000/api/enroll -H 'content-type: application/json' \
    -d '{"merchantSlug":"cafe-prueba","email":"test@test.com","platform":"unknown"}'  # → cardId
  # stamp/redeem: probar con la sesión del dashboard en Etapa 3, o temporalmente via Supabase Studio + RPC
  ```
- [x] Commit: `feat: business endpoints (enroll, scan, stamp, redeem)`

**Definición de terminado Etapa 1:** `npm test` verde; enroll por curl crea customer+card visibles en Supabase Studio; RPCs de stamp/redeem funcionan. — **✅ Cumplida (2026-07-24)**, y se fue más lejos de lo pedido: el flujo autenticado completo quedó verificado por HTTP real, no solo desde el SQL editor.

### Notas de ejecución (2026-07-24)

- **Migraciones aplicadas a mano por el SQL Editor de Supabase**, no con `supabase db push` (evita el login interactivo del CLI y la contraseña de la base). Los archivos en `supabase/migrations/` son la fuente de verdad: si se agrega una nueva, hay que pegarla igual. Se sumó una tercera, `0003_rate_limits.sql`, que el plan original no preveía.
- **Verificación E2E automatizada:** `scripts/e2e-check.ts` (`npm run e2e` con el dev server levantado) simula la sesión del comercio y recorre scan → 5 sellos → canje, más los rechazos. 11 chequeos, todos verdes. Cubre lo que el plan difería a la Etapa 3.
- **Seguridad confirmada por test, no por lectura de código:** tarjeta de otro comercio → 403 `WRONG_MERCHANT` (en scan y en stamp); sin sesión → 401; canje sin premio → 409. El scan no filtra el `qr_token` ni el email completo.
- **Ledger verificado:** 5 eventos `stamp` + 1 `redeem` con `stamps_delta = -5`.
- Credenciales del comercio demo: `demo@wafi.test` / `wafi-demo-1234` (creadas por `npx tsx scripts/seed.ts`).

---

## Etapa 2 — Enrolamiento + Google Wallet

**Objetivo:** un cliente real con Android escanea el QR del local, deja su email y tiene la tarjeta WAFI en Google Wallet. Al sellar (por ahora vía RPC/curl), el pass se actualiza solo.

### Tarea 2.1 — ⚠️ TAREA HUMANA: credenciales Google

- [ ] Confirmar hecho lo de Tarea 0.1 (Issuer ID + service account JSON autorizada en el issuer).
- [ ] Cargar env vars (local y Vercel): `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` (la private key del JSON, con `\n` escapados).

### Tarea 2.2 — Cliente de Google Wallet

- [ ] Crear `src/lib/wallet/google.ts` usando `google-auth-library` (`npm i google-auth-library jsonwebtoken` + `@types/jsonwebtoken`):
  ```ts
  const auth = new GoogleAuth({
    credentials: { client_email: env.GOOGLE_SA_EMAIL, private_key: env.GOOGLE_SA_PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
  const BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';

  export async function ensureLoyaltyClass(merchant: Merchant): Promise<string>
  // id = `${issuerId}.${merchant.slug}`. GET; si 404 → POST con
  // { id, issuerName: 'WAFI', programName: merchant.name, reviewStatus: 'UNDER_REVIEW',
  //   programLogo: { sourceUri: { uri: merchant.logoUrl } },
  //   hexBackgroundColor: merchant.brandColor }
  // Persistir en merchants.google_class_id.

  export async function createLoyaltyObject(card, merchant, customer): Promise<string>
  // id = `${issuerId}.${card.id}`. POST loyaltyObject:
  // { id, classId, state: 'ACTIVE',
  //   accountId: customer.email, accountName: customer.email,
  //   loyaltyPoints: { label: 'Sellos', balance: { string: `${card.currentStamps} / ${merchant.stampsRequired}` } },
  //   barcode: { type: 'QR_CODE', value: card.qrToken },
  //   textModulesData: [{ id: 'prize', header: 'Tu premio', body: merchant.prizeDescription }],
  //   linksModuleData: { uris: [{ uri: `${APP_URL}/mi`, description: 'Ver mi WAFI' }] } }
  // Persistir en cards.google_object_id.

  export async function updateLoyaltyObject(card, merchant): Promise<void>
  // PATCH `${BASE}/loyaltyObject/${card.googleObjectId}` con loyaltyPoints nuevo y,
  // si hasPrize: header del textModule 'prize' → '🎉 Premio disponible'.

  export function buildSaveUrl(objectId: string): string
  // jwt.sign({ iss: SA_EMAIL, aud: 'google', typ: 'savetowallet',
  //   payload: { loyaltyObjects: [{ id: objectId }] } }, PRIVATE_KEY, { algorithm: 'RS256' })
  // → `https://pay.google.com/gp/v/save/${token}`
  ```
- [ ] Integrar en `/api/enroll`: si `platform === 'google'` (o unknown), `ensureLoyaltyClass` + `createLoyaltyObject` (si la card no tiene `google_object_id`) + responder `google.saveUrl`. Si la card ya existía con objeto creado → regenerar saveUrl igual (re-agregar pass es válido).
- [ ] Completar `notifyWallets(card)` en `wallet-sync.ts`: si `card.google_object_id` → `updateLoyaltyObject`. Errores de push NUNCA rompen el stamp (try/catch + log).
- [ ] Test unitario de `buildSaveUrl` (decodificar el JWT y verificar claims) con una key RSA de prueba.
- [ ] Commit: `feat: google wallet integration`

### Tarea 2.3 — Landing de alta `/j/[slug]`

- [ ] Crear `src/app/j/[slug]/page.tsx` (server component que fetchea el merchant; 404 si no existe o inactivo) + form client component:
  - Layout mobile-first: logo del café, nombre, texto del premio con `stamps_required`, acento en `brand_color`.
  - Un input de email (validación zod en cliente y server) + botón primario "Agregar a mi Wallet".
  - Detección de plataforma por user-agent en el server component → prop `platform`.
  - Submit → POST `/api/enroll` → según respuesta: Android: redirect a `saveUrl`; iOS (hasta Etapa 4): mensaje "Apple Wallet muy pronto — te avisamos por email" (guardar el enroll igual, la card queda creada); desktop: mostrar QR (usar `qrcode` npm → dataURL) apuntando a la misma URL `/j/[slug]`.
  - Si `existing: true` → mostrar "Ya tenés esta tarjeta ☕" + botón "Volver a agregarla a mi Wallet" (mismo saveUrl).
- [ ] Estados de error con copy claro ("No pudimos crear tu tarjeta, probá de nuevo").
- [ ] Commit: `feat: enrollment landing /j/[slug]`

### Tarea 2.4 — Prueba end-to-end real

- [ ] Deploy a Vercel prod.
- [ ] ⚠️ TAREA HUMANA: con un Android real: abrir `/{URL}/j/cafe-prueba`, enrolarse, verificar el pass en Google Wallet (color, logo, "0 / 5", QR visible).
- [ ] Ejecutar un sello (SQL editor: `select apply_stamp('<card-id>', null);` + llamar `notifyWallets` vía un endpoint temporal de test o esperando a Etapa 3) y verificar que el pass muestra "1 / 5".
- [ ] Commit de ajustes que hayan surgido: `fix: google wallet e2e adjustments`

**Definición de terminado Etapa 2:** pass real en un Android, creado desde la landing con branding del merchant demo, que se actualiza al sellar.

---

## Etapa 3 — Dashboard + Scanner

**Objetivo:** el comercio opera solo: login, scanner para sellar/canjear desde el celu, configuración y actividad. Con esto cierra el loop completo en Android → **demo-able a un café real**.

### Tarea 3.1 — Auth del dashboard

- [ ] Login en `src/app/dashboard/login/page.tsx`: email + password contra Supabase Auth (`signInWithPassword`). Sin signup público (alta manual, SPEC §5.1).
- [ ] `src/proxy.ts`: proteger `/dashboard/*` (excepto login) — sin sesión → redirect a login. (En Next.js 16 el archivo se llama `proxy.ts`, no `middleware.ts`; misma semántica de interceptación + refresh de sesión de Supabase.)
- [ ] Layout `src/app/dashboard/layout.tsx`: sidebar/topbar con navegación (Scanner · Actividad · Mi tarjeta · Salir), nombre del comercio. Mobile-first: el Scanner es la pantalla que el local usa desde el celu.
- [ ] Verificar: login con `demo@wafi.test` del seed entra; URL directa sin sesión redirige.
- [ ] Commit: `feat: dashboard auth and layout`

### Tarea 3.2 — Scanner (la pantalla más importante del producto)

- [ ] `npm i html5-qrcode`. Crear `src/app/dashboard/scanner/page.tsx` (client component):
  - Cámara ocupando la mitad superior (html5-qrcode con `facingMode: environment`), marco de guía visual.
  - Al detectar QR → pausar cámara → GET `/api/scan/[qrToken]`.
  - **Resultado exitoso** (bottom card): email enmascarado, progreso "7 / 10" con círculos de sellos (activos en brand_color), y acciones:
    - Sin premio: botón grande "**Sellar ☕**".
    - Con premio (`hasPrize`): botón primario "**Canjear premio 🎉**" (con confirmación: "¿Entregaste [premio]?") + botón secundario "Sellar".
  - Tras la acción → POST stamp/redeem → feedback grande e inequívoco (verde "✓ Sello registrado — va 8 / 10" / "🎉 Premio canjeado") → botón "Escanear otro" reactiva la cámara.
  - **Errores con copy exacto**: `WRONG_MERCHANT` → "Esta tarjeta es de otro comercio"; token inválido → "QR no reconocido"; sin conexión → "Sin conexión, reintentá".
- [ ] El flujo cajero completo debe resolverse en ≤ 2 taps por cliente.
- [ ] Verificar en desktop con el QR del pass generado en Etapa 2 en pantalla (o imprimiendo el qr_token como QR con la lib `qrcode`).
- [ ] Commit: `feat: merchant scanner with stamp and redeem`

### Tarea 3.3 — Configuración + QR de alta + Actividad

- [ ] `src/app/dashboard/settings/page.tsx`: form de edición (nombre, dirección, brand_color con color picker, premio, sellos requeridos, logo por URL en MVP) → `PATCH /api/merchants/me`. Preview en vivo de cómo se ve la tarjeta.
  - Nota en UI: cambios de branding aplican a passes nuevos; los existentes se actualizan en el próximo sello (Google) — comportamiento aceptado para MVP.
- [ ] `src/app/dashboard/qr/page.tsx`: muestra el QR de alta del comercio (URL `/j/{slug}`) en grande + botón "Descargar para imprimir" (PNG 1200px generado con `qrcode`) + instrucción de uso ("Imprimilo y pegalo en el mostrador").
- [ ] `src/app/dashboard/activity/page.tsx`: lista de `stamp_events` (GET `/api/merchants/me/events`): fecha, cliente (email enmascarado), tipo con ícono (☕ sello / 🎁 canje), y arriba 3 stats: sellos del mes, canjes del mes, clientes totales.
- [ ] Verificar el ciclo completo local: enrolar → escanear → sellar ×5 → canjear → ver todo en Actividad.
- [ ] Commit: `feat: dashboard settings, join QR and activity`

### Tarea 3.4 — E2E Android real

- [ ] Deploy a prod. ⚠️ TAREA HUMANA: ciclo completo con dos celus (uno como cliente Android, otro como scanner del comercio): enrolar → sellar → ver pass actualizado → llegar al premio → ver "🎉 Premio disponible" en el pass → canjear → pass vuelve a 0/N.
- [ ] Registrar en este archivo cualquier fricción observada como tareas nuevas de Etapa 5.
- [ ] Commit: `fix: e2e polish from real device testing`

**Definición de terminado Etapa 3:** loop completo demostrable en vivo con dos teléfonos, sin tocar la DB a mano.

---

## Etapa 4 — Apple Wallet

**Objetivo:** paridad para iPhone: `.pkpass` desde la landing, y actualización automática del pass vía APNs + PassKit Web Service.

### Tarea 4.1 — ⚠️ TAREA HUMANA: Apple Developer + certificados

- [ ] Inscribirse en Apple Developer Program (USD 99/año).
- [ ] En el portal: Identifiers → crear **Pass Type ID** `pass.app.wafi.card`.
- [ ] Crear certificado para ese Pass Type ID (CSR desde Keychain) → descargar `.cer` → exportar como `.p12` con password.
- [ ] Descargar el certificado intermedio **WWDR G4** de Apple.
- [ ] Convertir y cargar como env vars (local + Vercel):
  ```bash
  # PEM del cert y la key desde el .p12:
  openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem -legacy
  openssl pkcs12 -in pass.p12 -nocerts -out signerKey.pem -legacy   # con passphrase
  base64 -i signerCert.pem | pbcopy   # → APPLE_PASS_CERT_B64
  base64 -i signerKey.pem | pbcopy    # → APPLE_PASS_KEY_B64  (+ APPLE_PASS_KEY_PASSPHRASE)
  base64 -i wwdr.pem | pbcopy         # → APPLE_WWDR_CERT_B64
  ```
  Más: `APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID=pass.app.wafi.card`.

### Tarea 4.2 — Generación del .pkpass

- [ ] `npm i passkit-generator`. Crear assets del template en `src/lib/wallet/apple-assets/` (`icon.png` 29×29·58·87, `logo.png` ~160×50 — wordmark WAFI blanco/negro según contraste).
- [ ] Crear `src/lib/wallet/apple.ts`:
  ```ts
  export async function buildPkpass(card, merchant, customer): Promise<Buffer>
  // PKPass.from({ model: assetsDir, certificates: {
  //   wwdr: b64decode(WWDR), signerCert: b64decode(CERT),
  //   signerKey: b64decode(KEY), signerKeyPassphrase } },
  // {
  //   formatVersion: 1, passTypeIdentifier: APPLE_PASS_TYPE_ID,
  //   teamIdentifier: APPLE_TEAM_ID, serialNumber: card.id,
  //   organizationName: 'WAFI', description: `Tarjeta ${merchant.name}`,
  //   webServiceURL: `${APP_URL}/api/apple-wallet`, authenticationToken: card.appleAuthToken,
  //   backgroundColor: merchant.brandColor (→ rgb()), foregroundColor/labelColor por contraste,
  //   locations: merchant.lat ? [{ latitude, longitude, relevantText: `Sumá un sello en ${merchant.name} ☕` }] : [],
  // })
  // pass.type = 'storeCard'
  // headerFields: [{ key: 'stamps', label: 'SELLOS', value: `${current}/${required}` }]
  // primaryFields:  [{ key: 'progress', label: hasPrize ? '🎉 PREMIO DISPONIBLE' : 'Tu progreso',
  //                    value: hasPrize ? merchant.prizeDescription : `${current} de ${required} sellos` }]
  // secondaryFields: [{ key: 'prize', label: 'PREMIO', value: merchant.prizeDescription }]
  // backFields: link a /mi + '¿Cómo funciona?' + contacto
  // pass.setBarcodes({ format: 'PKBarcodeFormatQR', message: card.qrToken, messageEncoding: 'iso-8859-1' })
  ```
- [ ] Endpoint de descarga `src/app/api/passes/apple/[cardId]/route.ts`: valida query `?t=` contra `apple_auth_token`, responde el buffer con `Content-Type: application/vnd.apple.pkpass` y `Content-Disposition: attachment; filename="wafi.pkpass"`.
- [ ] Integrar en `/api/enroll` (`platform === 'apple'`) → responder `apple.pkpassUrl`. Actualizar la landing `/j/[slug]`: en iOS el botón pasa a "Agregar a Apple Wallet" → navega al pkpassUrl (Safari abre el sheet nativo).
- [ ] Verificar: descargar el .pkpass, validarlo (abrir en un iPhone o con un validador); el pass se agrega y muestra QR + campos.
- [ ] Commit: `feat: apple wallet pkpass generation`

### Tarea 4.3 — PassKit Web Service

- [ ] Crear los route handlers bajo `src/app/api/apple-wallet/v1/` implementando el contrato del SPEC §7 (rutas y semántica fijadas por Apple):
  - `devices/[deviceId]/registrations/[passTypeId]/[serial]/route.ts` → POST (auth `ApplePass` token vs card; upsert en `apple_registrations` con `pushToken` del body; 201 nuevo / 200 existente) y DELETE (marca `active=false`; 200).
  - `devices/[deviceId]/registrations/[passTypeId]/route.ts` → GET: serials de cards con `apple_updated_at > passesUpdatedSince` registradas a ese device; responde `{ serialNumbers, lastUpdated: <max apple_updated_at en epoch string> }`; 204 si no hay cambios.
  - `passes/[passTypeId]/[serial]/route.ts` → GET (auth token): regenera y devuelve el `.pkpass` actual con header `Last-Modified`.
  - `log/route.ts` → POST: `console.error('[apple-wallet]', body.logs)`; 200.
- [ ] Todos con auth estricta del header `Authorization: ApplePass {token}` (comparar contra `cards.apple_auth_token` del serial) salvo `/log`.
- [ ] Commit: `feat: passkit web service endpoints`

### Tarea 4.4 — Push APNs + cierre E2E

- [ ] Crear `src/lib/wallet/apns.ts`: cliente HTTP/2 (`node:http2`) contra `https://api.push.apple.com` con mTLS usando el **mismo cert/key del Pass Type ID**:
  ```ts
  export async function pushPassUpdate(pushToken: string): Promise<void>
  // http2.connect('https://api.push.apple.com', { cert, key, passphrase })
  // POST `/3/device/${pushToken}` · headers: { 'apns-topic': APPLE_PASS_TYPE_ID } · body: '{}'
  // 200 = ok · 410 (Unregistered) → marcar registration active=false
  ```
- [ ] Completar `notifyWallets(card)`: además de Google, buscar `apple_registrations` activas de la card y pushear a cada una (en paralelo, errores solo logueados).
- [ ] Deploy. ⚠️ TAREA HUMANA: E2E con iPhone real: enrolar desde `/j/cafe-prueba` → pass en Apple Wallet → sellar desde el Scanner → **el pass se actualiza solo** (verificar también la notificación de cambio en lockscreen) → canje → pass vuelve a 0.
- [ ] Commit: `feat: apns push and apple e2e`

**Definición de terminado Etapa 4:** mismo loop de la Etapa 3 funcionando en iPhone, con actualización automática del pass.

---

## Etapa 5 — Landing del cliente + pulido de piloto

**Objetivo:** cerrar lo que falta para poner WAFI en 2–3 cafés reales.

### Tarea 5.1 — Landing personal `/mi`

- [ ] Login del cliente por **magic link** (Supabase Auth `signInWithOtp`) en `src/app/mi/login/page.tsx`. Al primer login, vincular `customers.auth_user_id = auth.uid()` por match de email y setear `email_verified_at`.
- [ ] `src/app/mi/page.tsx` (mobile-first, design system §9): sus tarjetas como cards con la fila de sellos (círculos, brand_color), premio, y estado destacado si hay premio disponible. Detalle expandible con historial (`stamp_events` propios) y datos del café.
- [ ] Botones "Agregar de nuevo a mi Wallet" por tarjeta (saveUrl / pkpassUrl).
- [ ] RLS: policies para que el customer autenticado lea solo sus `cards` y `stamp_events`.
- [ ] Commit: `feat: customer landing /mi with magic link`

### Tarea 5.2 — Strip image con sellos (identidad visual del pass)

- [ ] Crear `src/lib/wallet/strip-image.ts`: genera PNG (1125×432 para Apple strip @3x; reutilizable como hero de Google) con los círculos de sellos — activos rellenos en brand_color con check, vacíos en `#E8E4DF` — sobre fondo derivado del brand_color. Implementar con `@vercel/og` (JSX → PNG) o `sharp` + SVG. Cachear por estado `(merchantId, current, required)` en Vercel Blob o regenerar on-the-fly (medir; on-the-fly alcanza para el piloto).
- [ ] Integrar: `buildPkpass` agrega `strip.png`; `updateLoyaltyObject` setea `heroImage` con la URL de un endpoint `GET /api/passes/strip/[cardId]?v={current}`.
- [ ] Verificar en ambos wallets que los sellos se ven y actualizan.
- [ ] Commit: `feat: stamp strip image on passes`

### Tarea 5.3 — Emails transaccionales

- [ ] `npm i resend`. Crear `src/lib/email.ts` + templates (react-email o HTML simple, tokens del design system): (1) bienvenida al enrolarse con link al pass y a `/mi`; (2) "🎉 Tenés un premio en [café]" cuando `hasPrize` pasa a true.
- [ ] ⚠️ TAREA HUMANA: cuenta Resend + `RESEND_API_KEY` (+ dominio verificado si ya se definió).
- [ ] Envíos siempre no-bloqueantes (fire and forget con log de error).
- [ ] Commit: `feat: transactional emails`

### Tarea 5.4 — Hardening de piloto

- [ ] Rate limiting real en enroll y scan (Upstash Redis vía marketplace de Vercel, o ventanas por Postgres si se quiere evitar la dependencia).
- [ ] Página de error global + 404 con branding.
- [ ] Revisar todos los copys en voseo y consistencia de tokens visuales.
- [ ] `README.md` del repo: qué es, cómo correr local, cómo deployar, mapa de env vars completo.
- [ ] Checklist Google: pedir aprobación de publicación del issuer (salir de modo demo) — ⚠️ TAREA HUMANA.
- [ ] Correr `npm test` + build de prod limpia + smoke E2E en ambas plataformas.
- [ ] Commit: `chore: pilot hardening`

### Tarea 5.5 — ⚠️ TAREA HUMANA: piloto

- [ ] Elegir 2–3 cafés, crearles merchant + usuario (script `scripts/seed.ts` generalizado o Supabase Studio).
- [ ] Imprimir QRs de alta. Onboarding presencial del cajero (5 min: escanear → sellar → canjear).
- [ ] Definir métricas de éxito del piloto (sugerido: % de clientes del local que se enrolan, % que vuelve con el pass, canjes completados) y revisarlas a las 2 y 4 semanas en Actividad.

**Definición de terminado Etapa 5:** WAFI operando en cafés reales con clientes reales.

---

## Después del piloto (no planificar todavía)

Self-service de comercios y billing · analytics avanzadas · rotación de qr_token si aparece abuso · multi-premio · y la **app del cliente**, que consume esta misma API (SPEC §11). Planificar recién con los aprendizajes del piloto.

## Auto-chequeo para el ejecutor

Antes de dar por cerrada cada etapa: (1) ¿la "Definición de terminado" se cumple literalmente?, (2) ¿`npm test` y `npm run build` pasan?, (3) ¿checkboxes marcados y commits hechos?, (4) ¿el estado en `CLAUDE.md` está actualizado?
