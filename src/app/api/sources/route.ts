import { type NextRequest, NextResponse } from "next/server";

import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const body = await request.json();
    const { source_type, source_name } = body;

    if (!source_type || !source_name) {
      return NextResponse.json({ error: "source_type and source_name are required" }, { status: 400 });
    }

    const { data: source, error } = await supabase
      .from("sources")
      .insert({
        installation_id: installationId,
        source_type,
        source_name,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create source: ${error.message}`);
    }

    return NextResponse.json({ source_id: source.id }, { status: 201 });
  } catch (error) {
    console.error("Source creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
