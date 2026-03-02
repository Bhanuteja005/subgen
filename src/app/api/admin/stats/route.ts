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

/** GET /api/admin/stats */
export async function GET(request: NextRequest) {
    try {
        const session = await requireAdmin();
        if (!session) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectDB();

        // Aggregate stats
        const [totalVideos, statusBreakdown, tokenAgg, last30Days, topUsersAgg, segmentAgg] = await Promise.all([
            VideoJob.countDocuments(),
            VideoJob.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            VideoJob.aggregate([
                { $group: { _id: null, totalTokens: { $sum: "$tokenUsage" }, avgDurationSeconds: { $avg: "$durationSeconds" }, totalDurationSeconds: { $sum: "$durationSeconds" } } },
            ]),
            // Videos per day for last 30 days
            VideoJob.aggregate([
                {
                    $match: {
                        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        count: { $sum: 1 },
                        tokens: { $sum: "$tokenUsage" },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            // Top 10 users by token usage
            VideoJob.aggregate([
                {
                    $group: {
                        _id: "$userId",
                        userEmail: { $first: "$userEmail" },
                        videoCount: { $sum: 1 },
                        totalTokens: { $sum: "$tokenUsage" },
                        totalDurationSeconds: { $sum: "$durationSeconds" },
                        lastActivity: { $max: "$createdAt" },
                    },
                },
                { $sort: { totalTokens: -1 } },
                { $limit: 10 },
            ]),
            // Average segments per video
            VideoJob.aggregate([
                { $group: { _id: null, avgSegments: { $avg: "$segmentCount" } } },
            ]),
        ]);

        // Get total user count from Better Auth
        let totalUsers = 0;
        try {
            const usersResult = await auth.api.listUsers({
                query: { limit: 1 },
                headers: request.headers,
            });
            totalUsers = (usersResult as any)?.total ?? 0;
        } catch {
            // non-fatal
        }

        const totalTokens = tokenAgg[0]?.totalTokens ?? 0;
        const avgDuration = tokenAgg[0]?.avgDurationSeconds ?? 0;
        const totalDurationMinutes = Math.round((tokenAgg[0]?.totalDurationSeconds ?? 0) / 60);
        const avgSegments = Math.round(segmentAgg[0]?.avgSegments ?? 0);

        const statusMap: Record<string, number> = {};
        for (const s of statusBreakdown) {
            statusMap[s._id] = s.count;
        }

        const done       = statusMap["done"]       ?? 0;
        const processing = statusMap["processing"] ?? 0;
        const errorCount = statusMap["error"]      ?? 0;
        const errorRate  = totalVideos > 0 ? Math.round((errorCount / totalVideos) * 100) : 0;

        return NextResponse.json({
            totalUsers,
            totalVideos,
            totalTokens,
            avgDurationSeconds: Math.round(avgDuration),
            totalDurationMinutes,
            avgSegments,
            errorRate,
            statusBreakdown: { done, processing, error: errorCount },
            last30Days,
            topUsers: topUsersAgg,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
