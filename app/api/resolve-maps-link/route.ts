import { NextRequest, NextResponse } from "next/server";
import { allowedMapsLink, parseMapsLink } from "@/lib/google-maps-links";

export const runtime = "nodejs";
const hits = new Map<string, { since: number; count: number }>();
const cache = new Map<string, { time: number; expanded: string }>();
const MAX_HOPS = 4;
const TTL = 6 * 60 * 60 * 1000;

async function expandMapsUrl(input: string): Promise<string> {
  let current = input;
  for (let i = 0; i < MAX_HOPS; i++) {
    const { url, short } = allowedMapsLink(current);
    if (!short) return url.toString();
    const cached = cache.get(url.toString());
    if (cached && Date.now() - cached.time < TTL) return cached.expanded;
    const response = await fetch(url, {
      redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(7500),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RotasGO/1.0; +https://rotas-go.vercel.app)" }
    });
    const location = response.headers.get("location");
    if (!location || ![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error("O link abreviado não pôde ser expandido. Abra o local no Maps e copie o endereço completo.");
    }
    const next = new URL(location, url).toString();
    const nextLink = allowedMapsLink(next); // Validate each hop; never follow external/private URLs.
    if (!nextLink.short) {
      if (cache.size > 300) cache.clear();
      cache.set(input, { time: Date.now(), expanded: next });
      return next;
    }
    current = next;
  }
  throw new Error("O link fez redirecionamentos demais.");
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now(), record = hits.get(ip);
  const count = record && now - record.since < 60000 ? record.count + 1 : 1;
  hits.set(ip, { since: count === 1 ? now : record!.since, count });
  if (hits.size > 700) hits.clear();
  if (count > 40) return NextResponse.json({ error: "Muitos links em pouco tempo. Aguarde e tente novamente." }, { status: 429 });
  let body: { url?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Envie um link do Google Maps." }, { status: 400 }); }
  if (typeof body.url !== "string") return NextResponse.json({ error: "Link inválido." }, { status: 400 });
  try {
    allowedMapsLink(body.url);
    const expanded = await expandMapsUrl(body.url);
    const result = parseMapsLink(expanded, body.url);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Não foi possível interpretar o link."
    }, { status: 422 });
  }
}
