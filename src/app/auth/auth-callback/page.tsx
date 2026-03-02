"use client";

import { useEffect } from "react";

const AuthCallbackPage = () => {
    // We don't need to wait for the session hook; the cookie has been set by
    // the /api/auth callback. Redirect immediately so users land in dashboard.
    useEffect(() => {
        // Hard navigation ensures fresh session cookie is sent to middleware
        window.location.href = "/dashboard";
    }, []);

    return (
        <div className="flex items-center justify-center flex-col h-screen gap-4">
            <div className="w-9 h-9 rounded-full border-[3px] border-muted border-t-foreground animate-spin" />
            <p className="text-base font-medium text-muted-foreground">Signing you in…</p>
        </div>
    );
};

export default AuthCallbackPage;
