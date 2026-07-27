# WAFI v2 — Guía para el agente

WAFI es una plataforma de fidelización para cafés de especialidad. **No hay app del cliente**: la tarjeta de sellos vive en Apple Wallet / Google Wallet, y el comercio opera todo desde un dashboard web.

## Documentos fuente (leer en este orden)

1. [docs/01-SPEC.md](docs/01-SPEC.md) — Qué es el producto, arquitectura, flujos, modelo de datos, API, diseño. **La fuente de verdad de toda decisión.**
2. [docs/02-PLAN.md](docs/02-PLAN.md) — Manual de ejecución por etapas con tareas y checkboxes. **Ejecutar en orden, sin saltear etapas.**

## Reglas del proyecto

- **Idioma**: código y nombres en inglés; UI, copys y documentación en español rioplatense (voseo: "Juntá", "Escaneá").
- **Stack**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Supabase (Postgres + Auth), deploy en Vercel. No introducir otras tecnologías sin registrarlo en el SPEC.
- **Orden de wallets**: Google Wallet primero (Etapa 2), Apple Wallet después (Etapa 4). No invertir.
- **El backend es la única fuente de verdad** del estado de las tarjetas. Los passes de wallet son proyecciones de solo lectura que se actualizan por push.
- **Los sellos solo los escribe el servidor**, siempre iniciados por un comercio autenticado que escaneó el QR del cliente. Nunca exponer un endpoint que permita al cliente auto-sellarse.
- **Migraciones**: los `.sql` de `supabase/migrations/` son la fuente de verdad, pero se aplican **pegándolos en el SQL Editor de Supabase** (no con `supabase db push`, que exige login interactivo del CLI + contraseña de la base). Al crear una migración nueva, avisarle a Martín para que la corra y **verificar después con una consulta real** que quedó aplicada — un `select` con `head: true` da falsos positivos.
- **Verificación**: `npm test` (unit) y, con `npm run dev` levantado, `npm run e2e` (flujo real contra la API: scan → sellar → canjear + casos de rechazo). Correr ambos antes de cerrar una tarea.
- Al completar una tarea del plan, marcar su checkbox `- [x]` en `docs/02-PLAN.md` y commitear.
- Las tareas marcadas **⚠️ TAREA HUMANA** requieren acción de Martín (cuentas, certificados, pagos). Si una está pendiente y bloquea, avisarle y avanzar con lo no bloqueado.

## Estado actual

- [x] Spec y plan documentados (2026-07-13)
- [x] Etapa 0 — Setup del proyecto (deploy en `https://wafi-iota.vercel.app/`, repo en `github.com/martinbruno23/wafi`; pendiente confirmar `NEXT_PUBLIC_APP_URL` en Vercel — ver notas en el plan)
- [x] Etapa 1 — Core de dominio (schema + RLS + RPCs aplicados; 5 endpoints; 21 unit tests + E2E `npm run e2e` en verde)
- [ ] Etapa 2 — Enrolamiento + Google Wallet
- [ ] Etapa 3 — Dashboard + Scanner
- [ ] Etapa 4 — Apple Wallet
- [ ] Etapa 5 — Landing del cliente + piloto

Actualizar esta lista al cerrar cada etapa.
