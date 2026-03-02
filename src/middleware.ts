import { NextRequest, NextResponse } from "next/server";

// Better Auth sets this cookie when a session exists
const SESSION_COOKIE = "better-auth.session_token";

// Routes that require login
const PROTECTED_PATHS = ["/dashboard", "/admin"];

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Fast-path: if there is no session cookie at all, skip the API call.
    const sessionCookie = req.cookies.get(SESSION_COOKIE);
    if (!sessionCookie?.value) {
        if (PROTECTED_PATHS.some(p => pathname.startsWith(p))) {
            return NextResponse.redirect(new URL("/auth/sign-in", req.url));
        }
        return NextResponse.next();
    }

    // Cookie exists — but it may be stale/expired.
    // Always validate against the auth API so we never let an invalid session through.
    let isLoggedIn = false;
    let isAdmin = false;
    try {
        const url = new URL("/api/auth/get-session", req.url).toString();
        const resp = await fetch(url, {
            headers: req.headers,
            cache: "no-store",
        });
        if (resp.ok) {
            const data = await resp.json();
            isLoggedIn = !!data?.user;
            isAdmin = data?.user?.role === "admin";
        }
    } catch {
        // Network error — treat as unauthenticated (safer than allowing through)
        isLoggedIn = false;
    }

    if (PROTECTED_PATHS.some(p => pathname.startsWith(p))) {
        if (!isLoggedIn) {
            // Invalid / expired session — clear the stale cookie and redirect to sign-in
            const response = NextResponse.redirect(new URL("/auth/sign-in", req.url));
            response.cookies.delete(SESSION_COOKIE);
            return response;
        }
        // Logged-in but not admin → send to user dashboard
        if (pathname.startsWith("/admin") && !isAdmin) {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/admin/:path*",
    ],
};
