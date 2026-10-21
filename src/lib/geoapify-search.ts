import type { SearchResult } from "@/lib/types";
type Candidate = {
  lat?: number; lon?: number; name?: string; formatted?: string; address_line1?: string;
  address_line2?: string; street?: string; city?: string; town?: string; village?: string;
  state?: string; result_type?: string; country_code?: string;
};
export type LocationCenter = { lat: number; lng: number } | null;
export function mapGeoapifyResults(data: { results?: Candidate[] }, q: string, center: LocationCenter, cityOnly: boolean): SearchResult[] {
  const result: SearchResult[] = [];
  const seen = new Set<string>();
  for (const p of data.results || []) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const lat = p.lat!, lng = p.lon!;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;
    if (p.country_code && p.country_code.toLowerCase() !== "br") continue;
    if (cityOnly && !["city", "town", "village", "municipality", "administrative"].includes(p.result_type || "")) continue;
    const city = p.city || p.town || p.village || "";
    const name = (cityOnly ? city || p.name : p.name || p.address_line1 || p.street || city || q) || q;
    const address = p.formatted || [p.address_line1 || p.street, p.address_line2 || city, p.state].filter(Boolean).join(" · ") || name;
    const id = lat.toFixed(5) + "|" + lng.toFixed(5) + "|" + name.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const place: SearchResult = { name, address, lat, lng, city, state: p.state || "", provider: "geoapify", kind: p.result_type };
    if (center) {
      const rad = Math.PI / 180, dLat = (lat - center.lat) * rad, dLng = (lng - center.lng) * rad;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(center.lat * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
      place.distanceKm = Math.round(12742 * Math.asin(Math.min(1, Math.sqrt(a))) * 10) / 10;
    }
    result.push(place);
  }
  if (cityOnly) {
    // Reject unrelated municipalities that happen to contain a similarly named street.
    const normalizeCity = (value: string) => value.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const requested = normalizeCity(q);
    const exact = result.filter(place => normalizeCity(place.name) === requested);
    if (exact.length) return exact.slice(0, 8);
    return result.filter(place => normalizeCity(place.name).startsWith(requested)).slice(0, 8);
  }
  return result.slice(0, 8);
}
export async function searchGeoapify(query: string, center: LocationCenter, cityOnly: boolean, key: string): Promise<SearchResult[]> {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "pt");
  url.searchParams.set("filter", "countrycode:br");
  url.searchParams.set("limit", "10");
  url.searchParams.set("apiKey", key);
  if (cityOnly) url.searchParams.set("type", "city");
  if (center) url.searchParams.set("bias", "proximity:" + center.lng + "," + center.lat);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7500) });
  if (!res.ok) {
    if ([401, 403].includes(res.status)) throw new Error("Chave Geoapify inválida ou sem permissão.");
    if (res.status === 429) throw new Error("Limite gratuito de buscas atingido.");
    throw new Error("Geoapify temporariamente indisponível.");
  }
  return mapGeoapifyResults(await res.json(), query, center, cityOnly);
}
