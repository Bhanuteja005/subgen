import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { mongoClientPromise } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/profile — return current user's profile */
export async function GET() {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({
            id:    session.user.id,
            name:  session.user.name,
            email: session.user.email,
            image: session.user.image,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** PATCH /api/profile — update user's display name */
export async function PATCH(request: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { name } = await request.json();
        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        // Update name directly in the Better Auth `user` collection
        const client = await mongoClientPromise;
        const db = client.db();
        await db.collection("user").updateOne(
            { id: session.user.id },
            { $set: { name: name.trim(), updatedAt: new Date() } }
        );

        return NextResponse.json({ success: true, name: name.trim() });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
