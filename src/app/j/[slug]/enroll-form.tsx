"use client";

import { useState } from "react";
import { z } from "zod";

export type Platform = "google" | "apple" | "unknown";

type EnrollResponse = {
  cardId: string;
  existing: boolean;
  google?: { saveUrl: string };
  apple?: { pkpassUrl: string };
};

type Phase =
  | { name: "form" }
  | { name: "submitting" }
  | { name: "redirecting" }
  | { name: "done"; existing: boolean; saveUrl?: string }
  | { name: "qr"; dataUrl: string; existing: boolean }
  | { name: "error"; message: string };

const emailSchema = z.email();

type Props = {
  merchantSlug: string;
  platform: Platform;
  brand: string;
  brandFg: string;
};

export function EnrollForm({ merchantSlug, platform, brand, brandFg }: Props) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "form" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = email.trim();
    if (!emailSchema.safeParse(trimmed).success) {
      setEmailError("Ese email no parece válido. Revisalo y probá de nuevo.");
      return;
    }
    setEmailError(null);
    setPhase({ name: "submitting" });

    let body: EnrollResponse;
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchantSlug, email: trimmed, platform }),
      });

      if (!res.ok) {
        setPhase({
          name: "error",
          message:
            res.status === 429
              ? "Demasiados intentos. Esperá un ratito y volvé a probar."
              : "No pudimos crear tu tarjeta. Probá de nuevo.",
        });
        return;
      }
      body = (await res.json()) as EnrollResponse;
    } catch {
      setPhase({
        name: "error",
        message: "Parece que no hay conexión. Probá de nuevo.",
      });
      return;
    }

    // Android con save link listo → directo al sheet de Google Wallet.
    if (platform === "google" && body.google?.saveUrl) {
      setPhase({ name: "redirecting" });
      window.location.href = body.google.saveUrl;
      return;
    }

    // Desktop → QR para seguir desde el celular. Import dinámico: qrcode no
    // viaja en el bundle de los teléfonos, que son casi todo el tráfico.
    if (platform === "unknown") {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(window.location.href, {
        width: 240,
        margin: 1,
        color: { dark: "#1A1A1A", light: "#FFFFFF" },
      });
      setPhase({ name: "qr", dataUrl, existing: body.existing });
      return;
    }

    // iPhone (hasta Etapa 4) o Android sin saveUrl todavía (hasta Tarea 2.2).
    setPhase({
      name: "done",
      existing: body.existing,
      saveUrl: body.google?.saveUrl,
    });
  }

  if (phase.name === "redirecting") {
    return (
      <p
        className="text-center text-[15px] text-muted-foreground"
        role="status"
      >
        Abriendo Google Wallet…
      </p>
    );
  }

  if (phase.name === "qr") {
    return (
      <section className="flex w-full flex-col items-center gap-4 text-center">
        <h2 className="text-[17px] font-semibold">
          {phase.existing ? "Ya tenés esta tarjeta ☕" : "¡Tu tarjeta está lista! 🎉"}
        </h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={phase.dataUrl}
          alt="Código QR de esta página"
          className="rounded-[20px] border border-border bg-white p-2"
          width={240}
          height={240}
        />
        <p className="max-w-[280px] text-[15px] text-muted-foreground">
          Escaneá este código con la cámara de tu celular para sumarla a tu
          wallet.
        </p>
      </section>
    );
  }

  if (phase.name === "done") {
    return (
      <section
        className="flex w-full flex-col items-center gap-3 text-center"
        role="status"
      >
        <h2 className="text-[17px] font-semibold">
          {phase.existing
            ? "Ya tenés esta tarjeta ☕"
            : "¡Listo! Tu tarjeta quedó creada 🎉"}
        </h2>
        {phase.saveUrl ? (
          <a
            href={phase.saveUrl}
            className="w-full rounded-[14px] px-5 py-3.5 text-center text-[15px] font-semibold"
            style={{ background: brand, color: brandFg }}
          >
            {phase.existing
              ? "Volver a agregarla a mi Wallet"
              : "Agregar a mi Wallet"}
          </a>
        ) : (
          <p className="max-w-[280px] text-[15px] text-muted-foreground">
            {platform === "apple"
              ? "Apple Wallet llega muy pronto — te avisamos por email. Tu progreso ya cuenta desde hoy."
              : "Google Wallet se habilita en unos días — te avisamos por email. Tu progreso ya cuenta desde hoy."}
          </p>
        )}
      </section>
    );
  }

  const submitting = phase.name === "submitting";

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-medium text-muted-foreground">
          Tu email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="vos@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className="w-full rounded-[14px] border border-border bg-card px-4 py-3.5 text-[15px] outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-transparent focus:ring-2"
          style={{ "--tw-ring-color": brand } as React.CSSProperties}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
        />
        {emailError && (
          <p id="email-error" className="text-[13px] text-destructive">
            {emailError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[14px] px-5 py-3.5 text-[15px] font-semibold transition-opacity disabled:opacity-60"
        style={{ background: brand, color: brandFg }}
      >
        {submitting ? "Creando tu tarjeta…" : "Agregar a mi Wallet"}
      </button>

      {phase.name === "error" && (
        <p className="text-center text-[13px] text-destructive" role="alert">
          {phase.message}
        </p>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Solo usamos tu email para tu tarjeta. Sin spam.
      </p>
    </form>
  );
}
