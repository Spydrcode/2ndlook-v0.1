import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has any snapshots
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  // Redirect based on whether user has snapshots
  if (snapshots && snapshots.length > 0) {
    redirect("/dashboard/snapshots");
  } else {
    redirect("/dashboard/connect");
  }
}
