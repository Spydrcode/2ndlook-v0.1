import type { NextRequest } from "next/server";

import { handleOAuthStart } from "@/lib/oauth/handlers";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleOAuthStart(request, "wave");
}
