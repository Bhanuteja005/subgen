"use client";

import { useEffect } from "react";
import { getSession } from '@/lib/auth-client';

const AuthCallbackPage = () => {
    // After the auth callback sets the cookie, fetch the session and redirect
    // admins to the admin area and everyone else to the regular dashboard.
    useEffect(() => {
        (async () => {
            // Sometimes the session role may not be immediately available after
            // the auth callback writes the cookie. Poll briefly for the role
            // to avoid routing admins to /dashboard when they should go to /admin.
            const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
            const maxAttempts = 10;
            let sess: any = null;
            for (let i = 0; i < maxAttempts; i++) {
                try {
                    sess = await getSession();
                    const role = (sess?.user as any)?.role as string | undefined;
                    if (role === "admin") {
                        window.location.href = "/admin";
                        return;
                    }
                    if (sess?.user && role && role !== "admin") {
                        // Non-admin user
                        window.location.href = "/dashboard";
                        return;
                    }
                } catch (e) {
                    // ignore and retry
                }
                await sleep(300);
            }

            // Final fallback: if we have a session (even without role), send to dashboard
            if (sess?.user) window.location.href = "/dashboard";
            else window.location.href = "/auth/sign-in";
        })();
    }, []);

    return (
        <div className="flex items-center justify-center flex-col h-screen gap-4">
            <div className="w-9 h-9 rounded-full border-[3px] border-muted border-t-foreground animate-spin" />
            <p className="text-base font-medium text-muted-foreground">Signing you in…</p>
        </div>
    );
};

export default AuthCallbackPage;
