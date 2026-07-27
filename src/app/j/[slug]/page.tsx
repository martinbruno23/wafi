import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { contrastForeground } from "@/lib/color";
import { EnrollForm, type Platform } from "./enroll-form";

/**
 * Landing de alta /j/[slug] — SPEC §5.2.
 * El momento más crítico del producto: el cliente escaneó el QR del mostrador
 * y tiene que salir con la tarjeta en su wallet en ~15 segundos.
 * Un solo campo (email), branding del café, cero fricción.
 */

type LandingMerchant = {
  name: string;
  address: string | null;
  logo_url: string | null;
  brand_color: string;
  stamps_required: number;
  prize_description: string;
};

// cache() dedupe entre generateMetadata y la página en un mismo request.
const getMerchant = cache(async (slug: string): Promise<LandingMerchant | null> => {
  const db = createAdminClient();
  const { data } = await db
    .from("merchants")
    .select("name, address, logo_url, brand_color, stamps_required, prize_description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
});

function detectPlatform(userAgent: string): Platform {
  if (/android/i.test(userAgent)) return "google";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "apple";
  return "unknown"; // desktop u otros → camino QR
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const merchant = await getMerchant(slug);
  return {
    title: merchant ? `Sumate a ${merchant.name} · WAFI` : "WAFI",
    description: merchant
      ? `Juntá ${merchant.stamps_required} sellos en ${merchant.name} y llevate tu premio.`
      : undefined,
  };
}

export default async function JoinPage({ params }: Props) {
  const { slug } = await params;
  const merchant = await getMerchant(slug);
  if (!merchant) notFound();

  const userAgent = (await headers()).get("user-agent") ?? "";
  const platform = detectPlatform(userAgent);

  const brand = merchant.brand_color;
  const brandFg = contrastForeground(brand);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Hilo de color del comercio */}
      <div className="h-1.5 w-full shrink-0" style={{ background: brand }} />

      <main className="flex flex-1 flex-col items-center px-5 py-10">
        <div className="flex w-full max-w-sm flex-1 flex-col items-center gap-8">
          {/* Identidad del café */}
          <header className="flex flex-col items-center gap-3 text-center">
            {merchant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={merchant.logo_url}
                alt={`Logo de ${merchant.name}`}
                className="h-20 w-20 rounded-full border border-border object-cover"
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full text-[32px] font-bold"
                style={{ background: brand, color: brandFg }}
                aria-hidden
              >
                {merchant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-[22px] font-bold leading-tight">{merchant.name}</h1>
              {merchant.address && (
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {merchant.address}
                </p>
              )}
            </div>
          </header>

          {/* La propuesta: sellos y premio */}
          <section className="w-full rounded-[20px] border border-border bg-card px-6 py-6 text-center shadow-[0_1px_2px_rgba(26,26,26,0.04)]">
            <div
              className="mx-auto flex max-w-[280px] flex-wrap items-center justify-center gap-2"
              aria-hidden
            >
              {Array.from({ length: merchant.stamps_required }).map((_, i) =>
                i === 0 ? (
                  <span
                    key={i}
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: brand, color: brandFg }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M2.5 7.5L5.5 10.5L11.5 3.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : (
                  <span key={i} className="h-8 w-8 rounded-full bg-stamp-empty" />
                ),
              )}
            </div>
            <h2 className="mt-5 text-[17px] font-semibold leading-snug">
              Juntá {merchant.stamps_required} sellos y llevate tu premio
            </h2>
            <p className="mt-1 text-[15px] text-muted-foreground">
              {merchant.prize_description}
            </p>
          </section>

          {/* Alta */}
          <EnrollForm
            merchantSlug={slug}
            platform={platform}
            brand={brand}
            brandFg={brandFg}
          />
        </div>

        <footer className="pt-10 text-[11px] font-medium tracking-wide text-muted-foreground">
          WAFI · Tu tarjeta de sellos, en tu wallet
        </footer>
      </main>
    </div>
  );
}
