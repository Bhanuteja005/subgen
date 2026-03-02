import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import VideoJob from "@/models/video-job";

export const runtime = "nodejs";

async function requireAdmin() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    const role = (session.user as any).role;
    if (role !== "admin") return null;
    return session;
}

/** GET /api/admin/videos — all video jobs across all users */
export async function GET(_request: NextRequest) {
    try {
        const session = await requireAdmin();
        if (!session) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectDB();

        const videos = await VideoJob.find()
            .sort({ createdAt: -1 })
            .select("-srtContent")
            .limit(500)
            .lean();

        return NextResponse.json({ videos });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/** DELETE /api/admin/videos?id=<jobId> — admin can delete any job */
export async function DELETE(request: NextRequest) {
    try {
        const session = await requireAdmin();
        if (!session) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const id = request.nextUrl.searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "Job ID required" }, { status: 400 });
        }

        await connectDB();

        const job = await VideoJob.findByIdAndDelete(id);
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
