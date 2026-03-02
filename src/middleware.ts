import { NextRequest, NextResponse } from "next/server";

// Better Auth sets this cookie when a session exists
const SESSION_COOKIE = "better-auth.session_token";

// Routes that require login
const PROTECTED_PATHS = ["/dashboard", "/admin"];
// Routes that logged-in users should not see
const AUTH_PATHS = ["/auth/sign-in", "/auth/sign-up"];

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Check session by reading the cookie directly — no server-side fetch needed.
    // The cookie is HttpOnly so JS can't read it, but middleware can.
    const sessionCookie = req.cookies.get(SESSION_COOKIE);
    const isLoggedIn = !!sessionCookie?.value;

    // For admin role check we still need the API — but only when accessing /admin
    let isAdmin = false;
    if (isLoggedIn && pathname.startsWith("/admin")) {
        try {
            const url = new URL("/api/auth/get-session", req.url).toString();
            const resp = await fetch(url, { headers: req.headers, cache: "no-store" });
            if (resp.ok) {
                const data = await resp.json();
                isAdmin = data?.user?.role === "admin";
            }
        } catch { /* treat as non-admin */ }
    }

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
