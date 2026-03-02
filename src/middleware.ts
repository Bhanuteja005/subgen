import { NextRequest, NextResponse } from "next/server";

// Routes that require login
const PROTECTED_PATHS = ["/dashboard", "/admin"];
// Routes that logged-in users should not see
const AUTH_PATHS = ["/auth/sign-in", "/auth/sign-up"];

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Resolve session by calling the Node.js auth API route so middleware
    // doesn't import Node-only modules (middleware runs on the edge).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let session: any = null;
    try {
        const url = new URL("/api/auth/get-session", req.url).toString();
        const resp = await fetch(url, { method: "GET", headers: req.headers, cache: "no-store" });
        if (resp.ok) session = await resp.json();
        else session = null;
    } catch {
        session = null;
    }

    const isLoggedIn = session !== null;
    const isAdmin = session?.user?.role === "admin";

    // Redirect unauthenticated users away from protected pages
    if (PROTECTED_PATHS.some(p => pathname.startsWith(p))) {
        if (!isLoggedIn) {
            return NextResponse.redirect(new URL("/auth/sign-in", req.url));
        }
        // Non-admins cannot access /admin
        if (pathname.startsWith("/admin") && !isAdmin) {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
    }

    // Redirect logged-in users away from auth pages
    if (AUTH_PATHS.some(p => pathname.startsWith(p))) {
        if (isLoggedIn) {
            return NextResponse.redirect(new URL(isAdmin ? "/admin" : "/dashboard", req.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/admin/:path*",
        "/auth/sign-in",
        "/auth/sign-up",
    ],
};
