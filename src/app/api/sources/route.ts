import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { source_type, source_name } = body;

    if (!source_type || !source_name) {
      return NextResponse.json(
        { error: "source_type and source_name are required" },
        { status: 400 }
      );
    }

    const { data: source, error } = await supabase
      .from("sources")
      .insert({
        user_id: user.id,
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
