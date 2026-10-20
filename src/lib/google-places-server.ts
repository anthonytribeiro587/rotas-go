import { NextRequest, NextResponse } from "next/server";

const hits = new Map<string, { at: number; count: number }>();
const MAX_PER_MINUTE = 35;
const BR_STATES = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);

type Prediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

function limitRequest(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const old = hits.get(ip);
  const count = old && now - old.at < 60000 ? old.count + 1 : 1;
  hits.set(ip, { at: count === 1 ? now : old!.at, count });
  if (hits.size > 750) hits.clear();
  return count <= MAX_PER_MINUTE;
}

function safeToken(raw: string | null) {
  return raw && /^[a-zA-Z0-9_-]{8,36}$/.test(raw) ? raw : undefined;
}

export async function searchGooglePlaces(request: NextRequest) {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) return NextResponse.json({ error: "Google Maps não está configurado. Contate o administrador." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!limitRequest(request)) return NextResponse.json({ error: "Muitas buscas. Aguarde um minuto." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const q = (request.nextUrl.searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0,110);
  const city = request.nextUrl.searchParams.get("mode") === "city";
  if (q.length < 3) return NextResponse.json({ results: [], provider: "google" }, { headers: { "Cache-Control": "no-store" } });
  const body: Record<string, unknown> = {
    input: q,
    languageCode: "pt-BR",
    regionCode: "BR",
    includedRegionCodes: ["br"]
  };
  if (city) body.includedPrimaryTypes = ["(cities)"];
  const token = safeToken(request.nextUrl.searchParams.get("sessionToken"));
  if (token) body.sessionToken = token;
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (request.nextUrl.searchParams.has("lat") && request.nextUrl.searchParams.has("lng") &&
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000.0 } };
  }
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(8500)
    });
    if (!response.ok) {
      const err = await response.text();
      console.error("Places autocomplete error", response.status, err.slice(0, 350));
      return NextResponse.json({
        error: response.status === 403 ? "A chave Google não está autorizada para Places API (New)." :
          response.status === 429 ? "Limite de buscas Google atingido. Aguarde." : "Não foi possível consultar o Google Maps."
      }, { status: response.status === 429 ? 429 : 503, headers: { "Cache-Control": "no-store" } });
    }
    const payload: { suggestions?: Prediction[] } = await response.json();
    const results = (payload.suggestions || []).map(({ placePrediction: p }) => {
      if (!p?.placeId) return null;
      return {
        name: p.structuredFormat?.mainText?.text || p.text?.text || q,
        address: p.structuredFormat?.secondaryText?.text || p.text?.text || "",
        lat: 0, lng: 0, // Placeholder only; never add to a route before Place Details resolves it.
        placeId: p.placeId,
        source: "google" as const
      };
    }).filter((v): v is NonNullable<typeof v> => v !== null).slice(0, 8);
    return NextResponse.json({ results, provider: "google" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Google Maps demorou a responder. Tente novamente." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function resolveGooglePlace(request: NextRequest) {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) return NextResponse.json({ error: "Google Maps não configurado." }, { status: 503 });
  if (!limitRequest(request)) return NextResponse.json({ error: "Limite de consultas atingido." }, { status: 429 });
  let body: { placeId?: unknown; name?: unknown; sessionToken?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 }); }
  const placeId = body.placeId;
  if (typeof placeId !== "string" || !/^[a-zA-Z0-9_-]{1,240}$/.test(placeId)) {
    return NextResponse.json({ error: "Identificador do local inválido." }, { status: 400 });
  }
  const token = typeof body.sessionToken === "string" ? safeToken(body.sessionToken) : undefined;
  const url = new URL("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId));
  if (token) url.searchParams.set("sessionToken", token);
  url.searchParams.set("languageCode", "pt-BR");
  url.searchParams.set("regionCode", "BR");
  try {
    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": key,
        // Essentials only: don't request displayName here (it triggers Pro billing).
        "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents"
      },
      cache: "no-store", signal: AbortSignal.timeout(8500)
    });
    if (!response.ok) {
      console.error("Places details failed", response.status);
      return NextResponse.json({ error: "Não foi possível confirmar a localização selecionada." }, { status: 503 });
    }
    type Component = { types?: string[]; longText?: string; shortText?: string };
    const data: {
      id?: string; formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: Component[];
    } = await response.json();
    const lat = data.location?.latitude, lng = data.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: "Google Maps não retornou coordenadas para este local." }, { status: 422 });
    }
    const components = data.addressComponents || [];
    const city = components.find(c => c.types?.includes("locality"))?.longText ||
      components.find(c => c.types?.includes("administrative_area_level_2"))?.longText || "";
    const state = components.find(c => c.types?.includes("administrative_area_level_1"))?.shortText || "";
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 160) : data.formattedAddress || "Local selecionado";
    return NextResponse.json({
      result: { name, address: data.formattedAddress || name, lat, lng, city, state, placeId: data.id || placeId, source: "google" }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Google Maps demorou a confirmar o endereço." }, { status: 503 });
  }
}
