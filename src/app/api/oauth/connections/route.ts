import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getInstallationId } from "@/lib/installations/cookie";
import { listConnectionStatuses } from "@/lib/oauth/connections";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const installationId = await getInstallationId();
  if (!installationId) {
    return NextResponse.json({ installation_id: null, connections: [] });
  }

  const connections = await listConnectionStatuses(installationId);
  return NextResponse.json({ installation_id: installationId, connections });
}
