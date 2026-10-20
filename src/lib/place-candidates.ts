import type { SearchResult } from "@/lib/types";

/** When Google Autocomplete returns a place ID, coordinate resolution happens only on selection. */
export async function selectCandidate(
  candidate: SearchResult,
  sessionToken?: string,
  signal?: AbortSignal
): Promise<SearchResult> {
  if (candidate.source !== "google" || !candidate.placeId) return candidate;
  const response = await fetch("/api/place-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({ placeId: candidate.placeId, name: candidate.name, sessionToken })
  });
  const data = await response.json();
  if (!response.ok || !data.result) throw new Error(data.error || "Não foi possível confirmar o local.");
  const result = data.result as SearchResult;
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng) || (result.lat === 0 && result.lng === 0)) {
    throw new Error("O local não tem coordenadas confiáveis.");
  }
  return result;
}
