import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import VideoJob from "@/models/video-job";

export const runtime = "nodejs";

/** GET /api/dashboard/videos/srt?id=<jobId> — return the SRT content for a video */
export async function GET(request: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = request.nextUrl.searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "Job ID required" }, { status: 400 });
        }

        await connectDB();

        const job = await VideoJob.findOne({ _id: id, userId: session.user.id })
            .select("srtContent fileName")
            .lean();

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        return NextResponse.json({ srtContent: job.srtContent, fileName: job.fileName });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
