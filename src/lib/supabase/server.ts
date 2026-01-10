import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createClient() {
  const cookieStore = cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file. Need help? Contact support at support@2ndlook.app"
      );
    }
    throw new Error("Configuration error. Contact support at support@2ndlook.app");
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Next.js server components can't directly set cookies.
        // Supabase will set cookies in Route Handlers / Middleware.
        try {
          cookiesToSet.forEach(() => {
            // No-op: cookies handled by Route Handlers/Middleware
          });
        } catch {
          // Silently ignore cookie setting errors in server components
        }
      },
    },
  });
}
