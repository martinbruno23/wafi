import "server-only";
import type { Card } from "@/lib/domain/card";

/**
 * Propaga el estado de una tarjeta a los passes de wallet del cliente.
 *
 * Los passes son proyecciones de solo lectura del backend (SPEC §2): cada vez
 * que cambia una card hay que pushear la actualización.
 *
 * - Etapa 2 completa la parte de Google Wallet (PATCH del LoyaltyObject).
 * - Etapa 4 completa la de Apple (APNs a cada device registrado).
 *
 * Contrato: **nunca lanza**. Un fallo de push no puede tumbar un sellado que
 * ya se registró en la base; se loguea y sigue.
 */
export async function notifyWallets(card: Card): Promise<void> {
  void card;
  // No-op hasta la Etapa 2.
}
