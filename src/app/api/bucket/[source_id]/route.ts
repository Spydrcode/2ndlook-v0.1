import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { source_id: string } }
) {
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { source_id } = params;

    // Verify source ownership
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, user_id")
      .eq("id", source_id)
      .single();

    if (sourceError || !source || source.user_id !== user.id) {
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
