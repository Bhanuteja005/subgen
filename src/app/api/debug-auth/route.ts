import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Temporary debug endpoint to inspect server-side auth session and headers.
 * GET /api/debug-auth
 */
export async function GET(request: NextRequest) {
    try {
        const hdrs = await headers();
        const raw: Record<string, string> = {};
        for (const [k, v] of hdrs) raw[k] = String(v);

        const session = await auth.api.getSession({ headers: hdrs });

        return NextResponse.json({
            ok: true,
            session: session?.user ? {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
            } : null,
            headers: raw,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
