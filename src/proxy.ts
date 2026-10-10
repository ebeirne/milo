import { NextResponse, type NextRequest } from "next/server";
import { caregiverAuthorized } from "./lib/access";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const publicRoute = pathname === "/access" || pathname === "/api/access" || pathname.startsWith("/r/") || /^\/api\/record-links\/[\w-]{43}$/.test(pathname);
  // These POST routes enforce a scoped recording token or caregiver session themselves.
  const ownerPost = request.method === "POST" && (pathname === "/api/voices" || /^\/api\/voices\/[\da-f-]{36}\/preview$/.test(pathname));
  if (publicRoute || ownerPost || caregiverAuthorized(request)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ message: "Please unlock Familiar first." }, { status: 401 });
  return NextResponse.redirect(new URL("/access", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|icon.svg|icons/|manifest.webmanifest).*)"] };
