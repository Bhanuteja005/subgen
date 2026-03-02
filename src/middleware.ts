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

    // Cookie exists — assume authenticated for normal protected pages to avoid
    // making an internal fetch from Edge middleware (which can fail in some
    // deployment environments). Only validate admin role by calling the
    // internal session endpoint when the requested path is under `/admin`.
    let isLoggedIn = true;
    let isAdmin = false;
    if (pathname.startsWith("/admin")) {
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
            } else {
                isLoggedIn = false;
            }
        } catch {
            // If the validation call fails, deny admin access but allow non-admin
            // pages to proceed based on the presence of the cookie.
            isLoggedIn = false;
            isAdmin = false;
        }
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
