import { redirect } from "next/navigation";

export default function DashboardNotFound() {
  // Redirect any unrecognized dashboard routes to /dashboard
  // This guards against direct URL access to legacy template routes
  redirect("/dashboard");
}
