/**
 * Distribución de los sellos en la franja (strip) del pass de Apple.
 * Módulo puro: solo geometría, sin imágenes. `images.ts` dibuja con esto.
 */

export type StampBox = { x: number; y: number; w: number; h: number };

const PAD_X = 0.06;
const PAD_Y = 0.14;
const FILL = 0.84; // el sello ocupa el 84% de su celda
const MAX_ROWS = 4;

/** Tamaño de cada sello si se reparten en `rows` filas. */
function stampSize(count: number, rows: number, width: number, height: number, aspect: number) {
  const perRow = Math.ceil(count / rows);
  const cellW = (width * (1 - 2 * PAD_X)) / perRow;
  const cellH = (height * (1 - 2 * PAD_Y)) / rows;
  const w = Math.min(cellW * FILL, cellH * FILL * aspect);
  return { perRow, cellW, cellH, w, h: w / aspect };
}

/**
 * Cuántas filas usar: las que hacen los sellos más grandes para su forma.
 * Un círculo rinde en una fila; una silueta apaisada (una batata) rinde en
 * dos o tres, porque en una sola queda chica y sobra alto.
 */
export function bestRows(count: number, width: number, height: number, aspect = 1): number {
  let best = 1;
  let bestArea = 0;
  for (let rows = 1; rows <= Math.min(MAX_ROWS, count); rows++) {
    const { w, h } = stampSize(count, rows, width, height, aspect);
    if (w * h > bestArea * 1.0001) {
      best = rows;
      bestArea = w * h;
    }
  }
  return best;
}

/**
 * Cajas de cada sello dentro de una imagen de `width` × `height`.
 * `aspect` es ancho/alto del sello (1 para un círculo; una batata es ~2,5).
 * Elige las filas que hacen los sellos más grandes; cada sello entra en su
 * celda respetando su forma, y la última fila, si queda incompleta, se centra.
 */
export function stampLayout(
  count: number,
  width: number,
  height: number,
  aspect = 1,
): StampBox[] {
  if (count <= 0) return [];

  const rows = bestRows(count, width, height, aspect);
  const { perRow, cellW, cellH, w, h } = stampSize(count, rows, width, height, aspect);
  const padX = width * PAD_X;
  const padY = height * PAD_Y;

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
