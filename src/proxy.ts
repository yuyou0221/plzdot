import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/permissions";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const publicPrefixes = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health", "/_next", "/favicon.ico"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, message: "请先登录。" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/favicon.ico"],
};
