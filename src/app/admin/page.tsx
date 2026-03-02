"use client";

import { useQuery } from "@tanstack/react-query";
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { FilmIcon, UsersIcon, ZapIcon, ClockIcon, Loader2Icon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
    totalUsers: number;
    totalVideos: number;
    totalTokens: number;
    avgDurationSeconds: number;
    statusBreakdown: { done: number; processing: number; error: number };
    last30Days: { _id: string; count: number; tokens: number }[];
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchStats(): Promise<AdminStats> {
    const res = await fetch("/api/admin/stats");
    if (!res.ok) throw new Error("Failed to load stats");
    return res.json();
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
    icon: React.FC<{ className?: string }>;
    label: string;
    value: string | number;
    color?: string;
}) {
    return (
        <div className="flex items-center gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4">
            <div className={`p-2.5 rounded-lg shrink-0 ${color ?? "bg-primary/10 text-primary"}`}>
                <Icon className="size-5" />
            </div>
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444"];

export default function AdminAnalyticsPage() {
    const { data: stats, isLoading, isError } = useQuery({
        queryKey: ["admin-stats"],
        queryFn: fetchStats,
        refetchInterval: 30_000,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full gap-3 text-muted-foreground p-12">
                <Loader2Icon className="size-5 animate-spin" /> Loading analytics…
            </div>
        );
    }

    if (isError || !stats) {
        return (
            <div className="flex items-center justify-center h-full text-red-400 p-12">
                Failed to load analytics. Please refresh.
            </div>
        );
    }

    const pieData = [
        { name: "Done",       value: stats.statusBreakdown.done },
        { name: "Processing", value: stats.statusBreakdown.processing },
        { name: "Error",      value: stats.statusBreakdown.error },
    ].filter(d => d.value > 0);

    const avgDuration = Math.floor(stats.avgDurationSeconds / 60) + "m " + (stats.avgDurationSeconds % 60) + "s";

    return (
        <div className="p-6 space-y-8">
            <div>
                <h1 className="text-2xl font-semibold">Analytics</h1>
                <p className="text-sm text-muted-foreground mt-1">Platform-wide statistics and trends</p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={UsersIcon} label="Total Users"       value={stats.totalUsers} />
                <StatCard icon={FilmIcon}  label="Total Videos"      value={stats.totalVideos} color="bg-blue-500/10 text-blue-400" />
                <StatCard icon={ZapIcon}   label="Total Tokens"      value={stats.totalTokens > 999 ? `${(stats.totalTokens / 1000).toFixed(1)}k` : stats.totalTokens} color="bg-yellow-500/10 text-yellow-400" />
                <StatCard icon={ClockIcon} label="Avg Duration"      value={stats.avgDurationSeconds > 0 ? avgDuration : "—"} color="bg-purple-500/10 text-purple-400" />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Videos per day — Line */}
                <div className="lg:col-span-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
                    <h2 className="text-sm font-semibold mb-4">Videos Processed (Last 30 Days)</h2>
                    {stats.last30Days.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={stats.last30Days}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="_id" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickFormatter={d => d.slice(5)} />
                                <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                    labelStyle={{ color: "#fff" }}
                                />
                                <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={false} name="Videos" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Status Pie */}
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
                    <h2 className="text-sm font-semibold mb-4">Status Distribution</h2>
                    {pieData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={85}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                                    labelLine={false}
                                >
                                    {pieData.map((_, index) => (
                                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
                <h2 className="text-sm font-semibold mb-4">Token Usage (Last 30 Days)</h2>
                {stats.last30Days.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stats.last30Days}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="_id" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickFormatter={d => d.slice(5)} />
                            <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} />
                            <Tooltip
                                contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: "#fff" }}
                            />
                            <Bar dataKey="tokens" fill="#f59e0b" name="Tokens" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
