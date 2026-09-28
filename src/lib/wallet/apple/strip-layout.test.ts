import { describe, it, expect } from "vitest";
import { rowsFor, stampLayout, type StampBox } from "./strip-layout";

const W = 1125; // strip @3x de Apple
const H = 369;

const overlaps = (a: StampBox, b: StampBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("rowsFor", () => {
  it("una fila hasta 6, dos hasta 12, más para tarjetas largas", () => {
    expect(rowsFor(5)).toBe(1);
    expect(rowsFor(6)).toBe(1);
    expect(rowsFor(7)).toBe(2);
    expect(rowsFor(12)).toBe(2);
    expect(rowsFor(20)).toBe(2);
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
    const boxes = stampLayout(5, W, H, 1);
    const left = boxes[0].x;
    const right = W - (boxes[4].x + boxes[4].w);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  });

  it("la última fila incompleta también se centra", () => {
    const boxes = stampLayout(7, W, H, 1); // 4 arriba, 3 abajo
    const bottom = boxes.slice(4);
    const left = bottom[0].x;
    const right = W - (bottom[2].x + bottom[2].w);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  });

  it("sin sellos no hay cajas", () => {
    expect(stampLayout(0, W, H)).toEqual([]);
  });
});
