import { NextRequest, NextResponse } from "next/server";
import type { SearchResult } from "@/lib/types";

export const runtime = "nodejs";
const cache = new Map<string, { at: number; data: SearchResult[] }>();
const limits = new Map<string, { at: number; hits: number }>();

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const limit = limits.get(ip);
  if (limit && now - limit.at < 60_000 && limit.hits >= 30) {
    return NextResponse.json({ error: "Muitas buscas. Tente novamente em um minuto." }, { status: 429 });
  }
  limits.set(ip, limit && now - limit.at < 60_000 ? { ...limit, hits: limit.hits + 1 } : { at: now, hits: 1 });
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const bias = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const cacheKey = [q.toLowerCase(), bias ? lat.toFixed(2) : "", bias ? lng.toFixed(2) : ""].join("|");
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < 300_000) return NextResponse.json({ results: hit.data });
  try {
    const base = process.env.PHOTON_BASE_URL || "https://photon.komoot.io";
    const url = new URL("/api", base);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "6");
    url.searchParams.set("lang", "pt");
    if (bias) { url.searchParams.set("lat", String(lat)); url.searchParams.set("lon", String(lng)); }
    const response = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Provedor de locais indisponível (" + response.status + ").");
    const data = await response.json();
    const results: SearchResult[] = (data.features || []).filter((f: any) =>
      f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates) &&
      Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1])
    ).map((f: any) => {
      const p = f.properties || {};
      const address = [p.street ? p.street + (p.housenumber ? ", " + p.housenumber : "") : p.name, p.city || p.locality, p.state].filter(Boolean).join(" · ");
      return { name: String(p.name || p.street || p.city || "Endereço"), address: address || q, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    });
    if (cache.size > 300) cache.clear();
    cache.set(cacheKey, { at: now, data: results });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Não foi possível buscar endereços agora." }, { status: 502 });
  }
}
