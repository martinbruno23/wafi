/**
 * Utilidades de color para el brand_color de cada comercio.
 * El brand_color es dato del comercio (SPEC §9): puede ser claro u oscuro,
 * así que todo texto que se apoye sobre él necesita contraste calculado.
 */

/**
 * Devuelve el color de texto (blanco o casi-negro del design system) que
 * mejor contrasta sobre un fondo hex dado. Ante un hex inválido, blanco
 * sobre el fallback oscuro es lo más seguro.
 */
export function contrastForeground(hex: string): "#FFFFFF" | "#1A1A1A" {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#FFFFFF";

  const int = parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;

  // Luminancia perceptual (aproximación WCAG, alcanza para elegir texto).
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 150 ? "#1A1A1A" : "#FFFFFF";
}
