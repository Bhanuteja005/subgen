import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import VideoJob from "@/models/video-job";

export const runtime = "nodejs";

/** GET /api/dashboard/videos — return videos for the current user */
export async function GET(request: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();

        const videos = await VideoJob.find({ userId: session.user.id })
            .sort({ createdAt: -1 })
            .select("-srtContent") // omit large field from list view
            .lean();

        return NextResponse.json({ videos });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/** DELETE /api/dashboard/videos?id=<jobId> */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = request.nextUrl.searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "Job ID required" }, { status: 400 });
        }

        await connectDB();

        const job = await VideoJob.findOneAndDelete({ _id: id, userId: session.user.id });
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
