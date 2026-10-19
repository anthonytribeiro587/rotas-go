import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Cache-first same-origin raster tile delivery.
 * Respect OSM tile policy: a stable identifying User-Agent/Referer,
 * no bulk-prefetching and >=7-day CDN cache. Tile requests are triggered
 * only by the interactive Leaflet viewport.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z: rawZ, x: rawX, y: rawY } = await context.params;
  const yMatch = /^(\d+)\.png$/.exec(rawY);
  if (!/^\d+$/.test(rawZ) || !/^\d+$/.test(rawX) || !yMatch) {
    return new Response("Invalid tile", { status: 400 });
  }
  const z = Number(rawZ), x = Number(rawX), y = Number(yMatch[1]);
  const limit = 2 ** z;
  if (z < 0 || z > 18 || x < 0 || y < 0 || x >= limit || y >= limit) {
    return new Response("Tile out of range", { status: 400 });
  }

  try {
    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "RotasGO-Maps/1.0 (+https://rotas-go.vercel.app)",
        Referer: "https://rotas-go.vercel.app/",
        Accept: "image/png"
      },
      next: { revalidate: 604800 },
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok || !upstream.headers.get("content-type")?.includes("image/png")) {
      console.error("OSM tile unavailable", { z, x, y, status: upstream.status });
      return new Response("Tile provider unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Tile proxy error", error instanceof Error ? error.message : "unknown");
    return new Response("Tile provider timed out", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
