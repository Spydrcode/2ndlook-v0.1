import { type NextRequest, NextResponse } from "next/server";

/**
 * NO-LOGIN MODE: Middleware no longer enforces authentication.
 * All routes are accessible without login.
 * Anonymous users are tracked via installation_id cookie (set in route handlers).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Redirect root to /dashboard/connect (main entry point for no-login mode)
  if (path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/connect";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
