import type { NextRequest } from "next/server";

import { handleOAuthCallback } from "@/lib/oauth/handlers";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, "wave");
}
