/**
 * Only analyzes the URL that the user pasted (including the target URL
 * of an HTTP redirect). No Google Maps HTML, place details or search results
 * are scraped or stored.
 */
export type MapsLocation = {
  input: string;
  title: string;
  address: string;
  lat: number | null;
  lng: number | null;
  accurate: boolean;
  reason: string;
};

const shortHosts = new Set(["maps.app.goo.gl", "goo.gl"]);
const longHosts = new Set(["google.com", "www.google.com", "maps.google.com", "google.com.br", "www.google.com.br"]);

export function allowedMapsLink(input: string): { url: URL; short: boolean } {
  if (input.length > 12000) throw new Error("Link muito longo.");
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Link inválido. Cole o endereço completo https:// do Google Maps."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash.length > 6000) {
    throw new Error("Use um link HTTPS normal do Google Maps.");
  }
  const host = url.hostname.toLowerCase();
  if (shortHosts.has(host)) {
    if (host === "goo.gl" && !url.pathname.startsWith("/maps/")) throw new Error("Este não é um link de mapas.");
    return { url, short: true };
  }
  if (!longHosts.has(host) || !url.pathname.includes("/maps")) {
    throw new Error("Esse link não é do Google Maps.");
  }
  return { url, short: false };
}

function labelFromPath(path: string): string {
  const segment = path.split("/").filter(Boolean);
  const index = segment.findIndex(piece => piece === "place");
  if (index < 0 || !segment[index + 1]) return "";
  try { return decodeURIComponent(segment[index + 1]).replace(/\+/g, " ").trim().slice(0, 160); }
  catch { return segment[index + 1].replace(/\+/g, " ").slice(0, 160); }
}
function validCoords(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0);
}
function coordsFrom(value: string): [number, number] | null {
  const match = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return validCoords(lat, lng) ? [lat, lng] : null;
}
function queryLabel(url: URL): string {
  const raw = url.searchParams.get("query") || url.searchParams.get("q") ||
    url.searchParams.get("destination") || "";
  return raw.trim().slice(0, 160);
}

export function parseMapsLink(expanded: string, original = expanded): MapsLocation {
  const { url, short } = allowedMapsLink(expanded);
  if (short) throw new Error("Este link é abreviado e precisa ser expandido primeiro.");
  const path = url.pathname;
  // Google's Maps place data uses !3dLAT!4dLNG. This is a pin, unlike /@LAT,LNG
  // which is only the *camera center* and may be miles away from the shop.
  const pin = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(path + url.search);
  const precise: [number, number] | null = pin && validCoords(Number(pin[1]), Number(pin[2])) ?
    [Number(pin[1]), Number(pin[2])] : null;
  const query = queryLabel(url);
  let label = labelFromPath(path);
  if (!label) {
    const segments = path.split("/").filter(Boolean);
    const index = segments.findIndex(segment => segment === "search" || segment === "dir");
    if (index >= 0 && segments[index] === "search" && segments[index + 1]) {
      try { label = decodeURIComponent(segments[index + 1]).replace(/\+/g, " "); } catch { /* ignore */ }
    }
  }
  const queryPoint = coordsFrom(query) || coordsFrom(label);
  const point = precise || queryPoint;
  const name = label && !coordsFrom(label) ? label : query && !coordsFrom(query) ? query : "Local do Google Maps";
  const note = precise ? "Coordenadas do marcador no link do Google Maps." :
    queryPoint ? "Coordenadas informadas no próprio link." :
      /\/@-?\d/.test(path) ? "O link informa apenas o centro do mapa, não o ponto exato da loja. Confira antes de adicionar." :
        "Sem coordenadas no link. Escolha um resultado na busca antes de adicionar.";
  return {
    input: original,
    title: name.trim().slice(0, 160),
    address: label || query || "",
    lat: point?.[0] ?? null,
    lng: point?.[1] ?? null,
    accurate: Boolean(point),
    reason: note
  };
}

export function extractMapsUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return [...new Set(found.map(s => s.replace(/[)\].,;]+$/g, "")))].slice(0, 61);
}
