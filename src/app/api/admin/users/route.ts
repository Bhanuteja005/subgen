import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import VideoJob from "@/models/video-job";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return null;
    const role = (session.user as any).role;
    if (role !== "admin") return null;
    return session;
}

/** GET /api/admin/users — list all users with their video stats */
export async function GET(request: NextRequest) {
    try {
        const session = await requireAdmin(request);
        if (!session) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectDB();

        // Get users from Better Auth
        let betterAuthUsers: any[] = [];
        try {
            const result = await auth.api.listUsers({
                query: { limit: 500 },
                headers: request.headers,
            });
            betterAuthUsers = (result as any)?.users ?? [];
        } catch {
            // non-fatal
        }

        // Get per-user video stats from MongoDB
        const userStats = await VideoJob.aggregate([
            {
                $group: {
                    _id: "$userId",
                    videoCount: { $sum: 1 },
                    totalTokens: { $sum: "$tokenUsage" },
                    lastActivity: { $max: "$createdAt" },
                },
            },
        ]);

        const statsMap = new Map(userStats.map((s) => [s._id, s]));

        const users = betterAuthUsers.map((u) => {
            const stats = statsMap.get(u.id) ?? { videoCount: 0, totalTokens: 0, lastActivity: null };
            return {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role ?? "user",
                createdAt: u.createdAt,
                videoCount: stats.videoCount,
                totalTokens: stats.totalTokens,
                lastActivity: stats.lastActivity,
            };
        });

        return NextResponse.json({ users });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
