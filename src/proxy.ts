import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16: this file replaces the old `middleware.ts` (renamed to `proxy`).
// Lightweight gate: redirect logged-out visitors to /login based on the
// Auth.js session cookie. Real validation happens in the pages/server actions
// via currentContext() — never trust the proxy alone.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth");

  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
