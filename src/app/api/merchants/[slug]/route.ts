import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRoute, HttpError } from "@/lib/api/response";

/**
 * GET /api/merchants/[slug] — público.
 * Datos de branding que consume la landing de alta `/j/[slug]` (SPEC §7).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handleRoute(async () => {
    const { slug } = await params;
    const db = createAdminClient();

    const { data, error } = await db
      .from("merchants")
      .select("name, brand_color, logo_url, stamps_required, prize_description")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw new HttpError(500, "DB_ERROR", error.message);
    if (!data) {
      throw new HttpError(404, "MERCHANT_NOT_FOUND", "No encontramos este comercio.");
    }

    return NextResponse.json({
      name: data.name,
      brandColor: data.brand_color,
      logoUrl: data.logo_url,
      stampsRequired: data.stamps_required,
      prizeDescription: data.prize_description,
    });
  });
}
