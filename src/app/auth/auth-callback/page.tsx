"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const AuthCallbackPage = () => {
    const router = useRouter();
    const { data: session, isPending } = useSession();

    useEffect(() => {
        if (!isPending && session?.user) {
            const role = (session.user as any).role;
            router.push(role === "admin" ? "/admin" : "/dashboard");
        }
    }, [session, isPending, router]);

    return (
        <div className="flex items-center justify-center flex-col h-screen">
            <div className="border-[3px] border-neutral-800 rounded-full border-b-neutral-200 animate-spin w-8 h-8" />
            <p className="text-lg font-medium text-center mt-3">Verifying your account…</p>
        </div>
    );
};

export default AuthCallbackPage;
