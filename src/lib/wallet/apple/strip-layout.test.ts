import { describe, it, expect } from "vitest";
import { bestRows, stampLayout, type StampBox } from "./strip-layout";

const W = 1125; // strip @3x de Apple
const H = 369;

const overlaps = (a: StampBox, b: StampBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("bestRows", () => {
  it("círculos: una fila hasta 6, dos para más", () => {
    expect(bestRows(5, W, H, 1)).toBe(1);
    expect(bestRows(6, W, H, 1)).toBe(1);
    expect(bestRows(8, W, H, 1)).toBe(2);
  });

  it("siluetas apaisadas (una batata) rinden en más filas", () => {
    expect(bestRows(5, W, H, 2.5)).toBeGreaterThan(1);
  });

  it("elige las filas que dan el sello más grande", () => {
    for (const count of [3, 5, 8, 10, 15, 20]) {
      for (const aspect of [1, 2.5]) {
        const chosen = stampLayout(count, W, H, aspect)[0];
        for (let rows = 1; rows <= 4; rows++) {
          // Ninguna otra cantidad de filas da sellos más grandes.
          const perRow = Math.ceil(count / rows);
          const cellW = (W * 0.88) / perRow;
          const cellH = (H * 0.72) / rows;
          const w = Math.min(cellW * 0.84, cellH * 0.84 * aspect);
          expect(chosen.w).toBeGreaterThanOrEqual(Math.floor(w) - 1);
        }
      }
    }
  });

  it("nunca más filas que sellos", () => {
    expect(bestRows(1, W, H, 2.5)).toBe(1);
    expect(bestRows(2, W, H, 2.5)).toBeLessThanOrEqual(2);
  });
});

describe("stampLayout", () => {
  for (const count of [1, 5, 6, 8, 10, 13, 20]) {
    for (const aspect of [1, 2.5]) {
      it(`${count} sellos (forma ${aspect}:1) entran sin superponerse`, () => {
        const boxes = stampLayout(count, W, H, aspect);
        expect(boxes).toHaveLength(count);
        for (const b of boxes) {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(W);
          expect(b.y + b.h).toBeLessThanOrEqual(H);
        }
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++)
            expect(overlaps(boxes[i], boxes[j])).toBe(false);
      });
    }
  }

  it("respeta la forma del sello", () => {
    const [b] = stampLayout(5, W, H, 2.5);
    expect(b.w / b.h).toBeCloseTo(2.5, 1);
  });

  it("una sola fila queda centrada en la franja", () => {
    const boxes = stampLayout(5, W, H, 1); // círculos: una fila
    const left = boxes[0].x;
    const right = W - (boxes[4].x + boxes[4].w);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  });

  it("la última fila incompleta también se centra", () => {
    for (const [count, aspect, top] of [[9, 1, 5], [5, 2.5, 3]] as const) {
      expect(bestRows(count, W, H, aspect)).toBe(2);
      const bottom = stampLayout(count, W, H, aspect).slice(top);
      const left = bottom[0].x;
      const right = W - (bottom[bottom.length - 1].x + bottom[bottom.length - 1].w);
      expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
    }
  });

  it("sin sellos no hay cajas", () => {
    expect(stampLayout(0, W, H)).toEqual([]);
  });
});
