import { NextRequest } from "next/server";
import { resolveGooglePlace } from "@/lib/google-places-server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return resolveGooglePlace(request);
}
