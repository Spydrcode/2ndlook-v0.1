import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateInstallationId } from "@/lib/installations/cookie";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ source_id: string }> }
) {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const { source_id } = await params;

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return NextResponse.json({ error: "Invalid source_id" }, { status: 403 });
    }

    // Fetch bucket data
    const { data: bucket, error: bucketError } = await supabase
      .from("estimate_buckets")
      .select("*")
      .eq("source_id", source_id)
      .single();

    if (bucketError || !bucket) {
      return NextResponse.json(
        { error: "No bucket data found" },
        { status: 404 }
      );
    }

    return NextResponse.json(bucket, { status: 200 });
  } catch (error) {
    console.error("Bucket fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

