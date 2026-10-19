import { describe, expect, it } from "vitest";
import { shortestVisitOrder } from "../src/lib/tsp";

describe("TSP com origem e fim fixos", () => {
  it("prioriza percurso mais curto, não ordem de inserção", () => {
    // [início, A, B, fim]. A rota ótima é início -> B -> A -> fim
    const matrix = [
      [0, 20, 1, 99],
      [99, 0, 10, 1],
      [99, 1, 0, 20],
      [99, 99, 99, 0]
    ];
    expect(shortestVisitOrder(matrix)).toEqual({ order: [1, 0], exact: true, cost: 3 });
  });

  it("respeita a direção da matriz em ruas de mão única", () => {
    const matrix = [
      [0, 1, 5, 20],
      [20, 0, 50, 1],
      [20, 1, 0, 9],
      [20, 20, 20, 0]
    ];
    const answer = shortestVisitOrder(matrix);
    expect(answer.order).toEqual([1, 0]);
    expect(answer.cost).toBe(7);
  });

  it("suporta origem e fim sem visitas", () => {
    expect(shortestVisitOrder([[0, 80], [80, 0]])).toEqual({ order: [], cost: 80, exact: true });
  });

  it("não fabrica trajeto quando há trecho inacessível", () => {
    expect(() => shortestVisitOrder([[0, null, 9], [9, 0, 9], [9, 9, 0]])).toThrow();
  });

  it("usa aproximação para 12 ou mais paradas", () => {
    const n = 14;
    const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Math.abs(j - i) * 100));
    expect(shortestVisitOrder(m).exact).toBe(false);
  });
});
