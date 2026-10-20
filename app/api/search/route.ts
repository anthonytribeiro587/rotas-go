import { NextRequest, NextResponse } from "next/server";
import type { SearchResult } from "@/lib/types";
import { searchGooglePlaces } from "@/lib/google-places-server";

export const runtime = "nodejs";

type PhotonFeature = {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, string | number | undefined>;
};
type CacheEntry = { at: number; data: SearchResult[] };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SearchResult[]>>();
const limits = new Map<string, { at: number; hits: number }>();
const TTL = 10 * 60_000;

function norm(v: unknown) {
  return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlng = (b.lng - a.lng) * rad;
  const x = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(x)));
}
function mapPlace(feature: PhotonFeature, query: string, center: { lat: number; lng: number } | null): SearchResult | null {
  const coord = feature.geometry?.coordinates;
  if (feature.geometry?.type !== "Point" || !Array.isArray(coord) || coord.length < 2) return null;
  const [lng, lat] = coord;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const p = feature.properties || {};
  const name = String(p.name || p.street || p.city || p.locality || query).trim();
  const street = String(p.street || "").trim();
  const number = String(p.housenumber || "").trim();
  const city = String(p.city || p.locality || p.county || "").trim();
  const state = String(p.state || "").trim();
  const neighborhood = String(p.district || p.suburb || "").trim();
  const main = street ? street + (number ? ", " + number : "") : "";
  const address = [main, neighborhood, city, state].filter(Boolean).join(" · ") || [city, state].filter(Boolean).join(" · ") || name;
  const place: SearchResult = { name, address, lat, lng, city, state };
  if (center) place.distanceKm = Math.round(distanceKm(center, place) * 10) / 10;
  return place;
}
function relevance(place: SearchResult, query: string, center: { lat: number; lng: number } | null) {
  const q = norm(query);
  const name = norm(place.name), whole = norm(place.name + " " + place.address);
  const terms = q.split(/\s+/).filter(Boolean);
  let score = 0;
  if (name === q) score += 70;
  else if (name.startsWith(q)) score += 50;
  else if (name.includes(q)) score += 30;
  else if (whole.includes(q)) score += 20;
  score += terms.reduce((n, t) => n + (name.startsWith(t) ? 10 : name.includes(t) ? 7 : whole.includes(t) ? 4 : -7), 0);
  if (center) {
    const km = place.distanceKm ?? distanceKm(center, place);
    // Resultados da região vêm antes de lojas homônimas em outras cidades.
    score += km <= 5 ? 55 : km <= 15 ? 42 : km <= 35 ? 28 : km <= 75 ? 14 : km <= 150 ? 3 : -Math.min(35, Math.floor(km / 25));
  }
  return score;
}

async function searchPhoton(q: string, center: { lat: number; lng: number } | null, cityOnly: boolean): Promise<SearchResult[]> {
  const base = process.env.PHOTON_BASE_URL || "https://photon.komoot.io";
  const url = new URL("/api/", base);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "15");
  url.searchParams.set("countrycode", "BR");
  if (cityOnly) url.searchParams.set("layer", "city");
  if (center) {
    url.searchParams.set("lat", String(center.lat));
    url.searchParams.set("lon", String(center.lng));
    url.searchParams.set("zoom", "12");
    url.searchParams.set("location_bias_scale", "0.05");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(6500), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("Geocodificador indisponível (" + response.status + ")");
  const data: { features?: PhotonFeature[] } = await response.json();
  const unique = new Set<string>();
  const places = (data.features || []).map(f => mapPlace(f, q, center)).filter((p): p is SearchResult => p !== null);
  const important = norm(q).split(/\s+/).filter(t => t.length >= 3 && !["rua", "avenida", "av", "das", "dos", "para", "com"].includes(t));
  return places
    // Evita sugerir, por exemplo, uma loja a 110 km em outra cidade com nome parecido.
    .filter(p => cityOnly ? norm(p.name).includes(norm(q)) : !center || (p.distanceKm ?? 0) < 50 || important.every(t => norm(p.name + " " + p.address).includes(t)))
    .sort((a, b) => relevance(b, q, center) - relevance(a, q, center))
    .filter(p => {
      const key = norm(p.name) + "|" + p.lat.toFixed(4) + "|" + p.lng.toFixed(4);
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    })
    .slice(0, 7);
}

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_MAP_PROVIDER === "google") return searchGooglePlaces(request);
  const cityOnly = request.nextUrl.searchParams.get("mode") === "city";
  const rawQ = (request.nextUrl.searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const q = cityOnly ? rawQ.replace(/[,\s]+(?:RS|SC|PR|SP|RJ|MG|ES|BA|DF|GO|MT|MS|PA|AM|AC|AP|AL|CE|MA|PB|PE|PI|RN|RO|RR|SE|TO)$/i, "").trim() : rawQ;
  if (q.length < 2) return NextResponse.json({ results: [] });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const limit = limits.get(ip);
  if (limit && now - limit.at < 60_000 && limit.hits >= 45) {
    return NextResponse.json({ error: "Muitas buscas. Aguarde um minuto e tente novamente." }, { status: 429 });
  }
  limits.set(ip, limit && now - limit.at < 60_000 ? { ...limit, hits: limit.hits + 1 } : { at: now, hits: 1 });
  if (limits.size > 800) limits.clear();

  const latStr = request.nextUrl.searchParams.get("lat"), lngStr = request.nextUrl.searchParams.get("lng");
  const lat = Number(latStr), lng = Number(lngStr);
  const center = latStr !== null && lngStr !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  const key = [cityOnly ? "city" : "all", norm(q), center?.lat.toFixed(3) || "", center?.lng.toFixed(3) || ""].join("|");
  const prior = cache.get(key);
  if (prior && now - prior.at < TTL) return NextResponse.json({ results: prior.data }, { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=120" } });
  try {
    let pending = inflight.get(key);
    if (!pending) { pending = searchPhoton(q, center, cityOnly); inflight.set(key, pending); }
    const results = await pending;
    if (cache.size > 250) cache.clear();
    cache.set(key, { at: now, data: results });
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=120" } });
  } catch (error) {
    console.error("Geocoding failed:", error instanceof Error ? error.message : "unknown");
    if (prior) return NextResponse.json({ results: prior.data, stale: true });
    return NextResponse.json({ error: "A busca de endereços demorou ou ficou indisponível. Tente novamente." }, { status: 503 });
  } finally {
    inflight.delete(key);
  }
}
