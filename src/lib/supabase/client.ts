import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file. Need help? Contact support at support@2ndlook.app",
      );
    }
    throw new Error("Configuration error. Contact support at support@2ndlook.app");
  }

  return createBrowserClient(url, anon);
}
