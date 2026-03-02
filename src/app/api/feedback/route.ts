import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Feedback from "@/models/feedback";

export const runtime = "nodejs";

async function requireAdmin() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    const role = (session.user as Record<string, unknown>).role;
    if (role !== "admin") return null;
    return session;
}

/** POST /api/feedback — submit feedback (requires auth) */
export async function POST(request: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { message, name, email, subject, rating } = await request.json();
        if (!message || typeof message !== "string" || !message.trim()) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        await connectDB();

        await Feedback.create({
            userId:    session.user.id,
            userEmail: session.user.email,
            name:      typeof name === "string" ? name.trim() : undefined,
            email:     typeof email === "string" ? email.trim() : undefined,
            subject:   typeof subject === "string" ? subject.trim() : undefined,
            rating:    typeof rating === "number" && rating >= 1 && rating <= 5 ? rating : undefined,
            message:   message.trim(),
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** GET /api/feedback — admin only, returns all feedback messages */
export async function GET() {
    try {
        const session = await requireAdmin();
        if (!session) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectDB();

        const feedbacks = await Feedback.find()
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();

        return NextResponse.json({ feedbacks });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
