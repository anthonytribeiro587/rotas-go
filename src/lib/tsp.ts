/** TSP de caminho ABERTO: índice 0 = origem fixa; 1..n = visitas; n+1 = fim fixo.
 * A matriz pode ser assimétrica (ruas e travessias) e mede metros caminháveis.
 * Para até 11 visitas usa Held–Karp exato. Acima disso usa vizinho mais próximo
 * com melhoria 2-opt, sem prometer ótimo global.
 */
export function shortestVisitOrder(distances: (number | null)[][]) {
  const n = distances.length - 2;
  if (n < 0 || n > 18 || distances.some((r) => r.length !== n + 2)) {
    throw new Error("Matriz inválida: máximo de 18 visitas.");
  }
  const d = (a: number, b: number) => {
    const v = distances[a]?.[b];
    return v !== null && Number.isFinite(v) && (v as number) >= 0 ? (v as number) : Infinity;
  };
  if (n === 0) {
    if (!Number.isFinite(d(0, 1))) throw new Error("Não existe caminho caminhável entre os pontos.");
    return { order: [] as number[], exact: true, cost: d(0, 1) };
  }
  const pathCost = (order: number[]) => {
    let total = 0;
    let prev = 0;
    for (const visit of order) {
      total += d(prev, visit + 1);
      prev = visit + 1;
    }
    return total + d(prev, n + 1);
  };
  if (n <= 11) {
    const size = 1 << n;
    const dp = Array.from({ length: size }, () => Array<number>(n).fill(Infinity));
    const parent = Array.from({ length: size }, () => Array<number>(n).fill(-1));
    for (let j = 0; j < n; j++) dp[1 << j][j] = d(0, j + 1);
    for (let mask = 1; mask < size; mask++) {
      for (let last = 0; last < n; last++) {
        if ((mask & (1 << last)) === 0 || !Number.isFinite(dp[mask][last])) continue;
        for (let next = 0; next < n; next++) {
          if (mask & (1 << next)) continue;
          const nextMask = mask | (1 << next);
          const score = dp[mask][last] + d(last + 1, next + 1);
          if (score < dp[nextMask][next]) {
            dp[nextMask][next] = score;
            parent[nextMask][next] = last;
          }
        }
      }
    }
    const full = size - 1;
    let best = Infinity;
    let last = -1;
    for (let j = 0; j < n; j++) {
      const score = dp[full][j] + d(j + 1, n + 1);
      if (score < best) { best = score; last = j; }
    }
    if (last < 0 || !Number.isFinite(best)) throw new Error("Algumas visitas não têm acesso por trajeto a pé.");
    const order: number[] = [];
    let mask = full;
    while (last >= 0) {
      order.push(last);
      const previous = parent[mask][last];
      mask ^= 1 << last;
      last = previous;
    }
    order.reverse();
    return { order, exact: true, cost: best };
  }
  const unvisited = new Set(Array.from({ length: n }, (_, i) => i));
  const order: number[] = [];
  let current = 0;
  while (unvisited.size) {
    let nearest = -1, best = Infinity;
    for (const i of unvisited) {
      if (d(current, i + 1) < best) { nearest = i; best = d(current, i + 1); }
    }
    if (nearest < 0 || !Number.isFinite(best)) throw new Error("Algumas visitas não têm acesso a pé.");
    order.push(nearest);
    unvisited.delete(nearest);
    current = nearest + 1;
  }
  let currentCost = pathCost(order);
  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const score = pathCost(candidate);
        if (score + 0.01 < currentCost) {
          order.splice(0, n, ...candidate);
          currentCost = score;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  if (!Number.isFinite(currentCost)) throw new Error("Não foi possível ligar todas as visitas a pé.");
  return { order, exact: false, cost: currentCost };
}
