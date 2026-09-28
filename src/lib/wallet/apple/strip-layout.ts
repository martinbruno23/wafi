/**
 * Distribución de los sellos en la franja (strip) del pass de Apple.
 * Módulo puro: solo geometría, sin imágenes. `images.ts` dibuja con esto.
 */

export type StampBox = { x: number; y: number; w: number; h: number };

/** Filas según la cantidad de sellos: hasta 6 en una, hasta 12 en dos. */
export function rowsFor(count: number): number {
  if (count <= 6) return 1;
  if (count <= 12) return 2;
  return Math.ceil(count / 10);
}

/**
 * Cajas de cada sello dentro de una imagen de `width` × `height`.
 * `aspect` es ancho/alto del sello (1 para un círculo; una batata es ~2,5).
 * Cada sello entra en su celda respetando su forma; la última fila, si queda
 * incompleta, se centra.
 */
export function stampLayout(
  count: number,
  width: number,
  height: number,
  aspect = 1,
): StampBox[] {
  if (count <= 0) return [];

  const rows = rowsFor(count);
  const perRow = Math.ceil(count / rows);
  const padX = width * 0.06;
  const padY = height * 0.14;
  const cellW = (width - 2 * padX) / perRow;
  const cellH = (height - 2 * padY) / rows;

  // El sello ocupa el 84% de su celda, sin deformarse.
  const maxW = cellW * 0.84;
  const maxH = cellH * 0.84;
  const w = Math.min(maxW, maxH * aspect);
  const h = w / aspect;

  const boxes: StampBox[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(perRow, count - r * perRow);
    const rowOffset = ((perRow - inRow) * cellW) / 2; // centra la fila incompleta
    for (let c = 0; c < inRow; c++) {
      const cx = padX + rowOffset + cellW * c + cellW / 2;
      const cy = padY + cellH * r + cellH / 2;
      boxes.push({
        x: Math.round(cx - w / 2),
        y: Math.round(cy - h / 2),
        w: Math.round(w),
        h: Math.round(h),
      });
    }
  }
  return boxes;
}
