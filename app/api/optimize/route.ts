import { NextResponse } from "next/server";
import { z } from "zod";
import { shortestVisitOrder } from "@/lib/tsp";

export const runtime = "nodejs";
const point = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(250),
  address: z.string().max(500),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180)
});
const requestSchema = z.object({
  start: point,
  end: point,
  stops: z.array(point).max(18),
  mode: z.enum(["optimize", "manual"]).optional()
});
const hits = new Map<string, { at: number; count: number }>();
const BASE = "https://api.openrouteservice.org/v2";

async function ors<T>(endpoint: string, body: object, key: string): Promise<T> {
  const response = await fetch(BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key, Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
    cache: "no-store"
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Limite de consultas do serviço de rotas atingido. Tente novamente mais tarde.");
    if (response.status === 401 || response.status === 403) throw new Error("Chave ORS inválida ou sem permissão.");
    throw new Error("O roteador não conseguiu calcular o trajeto a pé (" + response.status + ").");
  }
  return response.json() as Promise<T>;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const usage = hits.get(ip);
  if (usage && now - usage.at < 60_000 && usage.count >= 8) {
    return NextResponse.json({ error: "Limite de otimizações por minuto atingido." }, { status: 429 });
  }
  hits.set(ip, usage && now - usage.at < 60_000 ? { ...usage, count: usage.count + 1 } : { at: now, count: 1 });
  const key = process.env.ORS_API_KEY;
  if (!key) return NextResponse.json({ error: "Configure ORS_API_KEY no servidor para habilitar rotas a pé." }, { status: 503 });
  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await request.json();
    body = requestSchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "Informe origem, destino e até 18 visitas válidas." }, { status: 400 });
  }
  try {
    const points = [body.start, ...body.stops, body.end];
    const locations = points.map((p) => [p.lng, p.lat]);
    let solution: { order: number[]; exact: boolean };
    if (body.mode === "manual") {
      solution = { order: body.stops.map((_, i) => i), exact: false };
    } else {
      const matrix = await ors<{ distances: (number | null)[][]; durations: (number | null)[][] }>(
        "/matrix/foot-walking",
        { locations, metrics: ["distance", "duration"], units: "m" },
        key
      );
      if (!Array.isArray(matrix.distances) || matrix.distances.length !== points.length) {
        throw new Error("A matriz de distâncias retornou dados incompletos.");
      }
      solution = shortestVisitOrder(matrix.distances);
    }
    const ordered = [body.start, ...solution.order.map((i) => body.stops[i]), body.end];
    const route = await ors<{
      features: { geometry: { type: string; coordinates: number[][] }; properties: { summary: { distance: number; duration: number } } }[];
    }>("/directions/foot-walking/geojson", { coordinates: ordered.map((p) => [p.lng, p.lat]) }, key);
    const feature = route.features?.[0];
    if (feature?.geometry?.type !== "LineString" || !feature.geometry.coordinates?.length) {
      throw new Error("Não foi possível traçar a rota pelas ruas.");
    }
    return NextResponse.json({
      order: solution.order,
      exact: solution.exact,
      distanceMeters: feature.properties.summary.distance,
      durationSeconds: feature.properties.summary.duration,
      geometry: feature.geometry.coordinates.map(([lng, lat]) => [lat, lng])
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Falha ao calcular percurso."
    }, { status: 422 });
  }
}
