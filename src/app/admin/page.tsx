"use client";

import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
    FilmIcon, UsersIcon, ZapIcon, ClockIcon, Loader2Icon,
    TrendingUpIcon, AlertTriangleIcon, LayersIcon, TimerIcon, MessageSquareIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopUser {
    _id: string;
    userEmail: string;
    videoCount: number;
    totalTokens: number;
    totalDurationSeconds: number;
    lastActivity: string | null;
}

interface FeedbackItem {
    _id: string;
    userId: string;
    userEmail: string;
    name?: string;
    email?: string;
    subject?: string;
    rating?: number;
    message: string;
    createdAt: string;
}

interface AdminStats {
    totalUsers: number;
    totalVideos: number;
    totalTokens: number;
    avgDurationSeconds: number;
    totalDurationMinutes: number;
    avgSegments: number;
    errorRate: number;
    statusBreakdown: { done: number; processing: number; error: number };
    last30Days: { _id: string; count: number; tokens: number }[];
    topUsers: TopUser[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

function fmtDuration(sec: number) {
    if (!sec) return "—";
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}m ${s}s`;
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchStats(): Promise<AdminStats> {
    const res = await fetch("/api/admin/stats");
    if (!res.ok) throw new Error("Failed to load stats");
    return res.json();
}

async function fetchFeedbacks(): Promise<{ feedbacks: FeedbackItem[] }> {
    const res = await fetch("/api/feedback");
    if (!res.ok) throw new Error("Failed to load feedback");
    return res.json();
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "bg-primary/10 text-primary" }: {
    icon: React.FC<{ className?: string }>;
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
}) {
    return (
        <div className="flex items-start gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4">
            <div className={`p-2.5 rounded-lg shrink-0 ${color}`}>
                <Icon className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold mt-0.5">{value}</p>
                {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
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

    const { data: feedbackData } = useQuery({
        queryKey: ["admin-feedback"],
        queryFn: fetchFeedbacks,
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

    const avgDuration = fmtDuration(stats.avgDurationSeconds);
    const totalHours = stats.totalDurationMinutes >= 60
        ? `${(stats.totalDurationMinutes / 60).toFixed(1)}h`
        : `${stats.totalDurationMinutes}m`;

    const userBarData = (stats.topUsers ?? [])
        .filter(u => u.userEmail)
        .map(u => ({
            name: u.userEmail.split("@")[0],
            tokens: u.totalTokens,
            videos: u.videoCount,
        }));

    return (
        <div className="p-6 space-y-8">
            <div>
                <h1 className="text-2xl font-semibold">Analytics</h1>
                <p className="text-sm text-muted-foreground mt-1">Platform-wide statistics and trends</p>
            </div>

            {/* ── Stat Cards row 1 ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={UsersIcon}        label="Total Users"          value={stats.totalUsers} />
                <StatCard icon={FilmIcon}          label="Total Videos"         value={stats.totalVideos}  color="bg-blue-500/10 text-blue-400" />
                <StatCard icon={ZapIcon}           label="Total Tokens"         value={fmtTokens(stats.totalTokens)} color="bg-yellow-500/10 text-yellow-400" />
                <StatCard icon={ClockIcon}         label="Avg Duration"         value={stats.avgDurationSeconds > 0 ? avgDuration : "—"} color="bg-purple-500/10 text-purple-400" />
            </div>

            {/* ── Stat Cards row 2 ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={TimerIcon}         label="Total Video Time"     value={stats.totalDurationMinutes > 0 ? totalHours : "—"} color="bg-cyan-500/10 text-cyan-400" />
                <StatCard icon={LayersIcon}        label="Avg Segments / Video" value={stats.avgSegments > 0 ? stats.avgSegments : "—"}  color="bg-indigo-500/10 text-indigo-400" />
                <StatCard icon={TrendingUpIcon}    label="Success Rate"         value={`${100 - (stats.errorRate ?? 0)}%`} color="bg-green-500/10 text-green-400" sub={`${stats.statusBreakdown.done} completed`} />
                <StatCard icon={AlertTriangleIcon} label="Error Rate"           value={`${stats.errorRate ?? 0}%`} color="bg-red-500/10 text-red-400" sub={`${stats.statusBreakdown.error} failed`} />
            </div>

            {/* ── Charts row 1: line + pie ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
                    <h2 className="text-sm font-semibold mb-4">Videos Processed — Last 30 Days</h2>
                    {stats.last30Days.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={stats.last30Days}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="_id" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickFormatter={d => d.slice(5)} />
                                <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#fff" }} />
                                <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={false} name="Videos" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
                    <h2 className="text-sm font-semibold mb-4">Job Status Distribution</h2>
                    {pieData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value"
                                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* ── Charts row 2: token usage bar ── */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
                <h2 className="text-sm font-semibold mb-4">Token Usage — Last 30 Days</h2>
                {stats.last30Days.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stats.last30Days}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="_id" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickFormatter={d => d.slice(5)} />
                            <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickFormatter={fmtTokens} />
                            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#fff" }}
                                formatter={(v: number) => [fmtTokens(v), "Tokens"]} />
                            <Bar dataKey="tokens" fill="#f59e0b" name="Tokens" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* ── Per-user token horizontal bar ── */}
            {userBarData.length > 0 && (
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
                    <h2 className="text-sm font-semibold mb-1">Top Users — Token Usage</h2>
                    <p className="text-xs text-muted-foreground mb-4">Top 10 users by AI token consumption</p>
                    <ResponsiveContainer width="100%" height={Math.max(200, userBarData.length * 36)}>
                        <BarChart data={userBarData} layout="vertical" margin={{ left: 8, right: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} tickFormatter={fmtTokens} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} width={90} />
                            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                formatter={(v: number) => [fmtTokens(v), "Tokens"]} />
                            <Bar dataKey="tokens" fill="#7c3aed" name="Tokens" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── User Feedback messages ── */}
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] overflow-hidden">
                <div className="px-5 py-4 border-b border-foreground/10 flex items-center gap-2">
                    <MessageSquareIcon className="size-4 text-primary" />
                    <div>
                        <h2 className="text-sm font-semibold">User Feedback</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Messages sent by users from the dashboard</p>
                    </div>
                </div>
                {!feedbackData?.feedbacks?.length ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">No feedback yet</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-foreground/10 bg-foreground/[0.02] text-muted-foreground text-xs">
                                <th className="px-4 py-3 text-left font-medium">User</th>
                                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Subject</th>
                                <th className="px-4 py-3 text-left font-medium w-[40%]">Message</th>
                                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Rating</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-foreground/[0.06]">
                            {feedbackData.feedbacks.map(fb => (
                                <tr key={fb._id} className="hover:bg-foreground/[0.02] transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="size-7 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                                {(fb.name?.[0] ?? fb.userEmail?.[0] ?? "?").toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium truncate max-w-[140px]">{fb.name || fb.userEmail}</p>
                                                <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{fb.userEmail}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">{fb.subject || "—"}</td>
                                    <td className="px-4 py-3 text-sm text-foreground/80 whitespace-pre-wrap break-words">{fb.message}</td>
                                    <td className="px-4 py-3 hidden md:table-cell">
                                        {fb.rating ? (
                                            <span className="text-xs text-yellow-400">{"★".repeat(Number(fb.rating))}</span>
                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                                        {new Date(fb.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Top Users table ── */}
            {(stats.topUsers ?? []).length > 0 && (
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] overflow-hidden">
                    <div className="px-5 py-4 border-b border-foreground/10">
                        <h2 className="text-sm font-semibold">Top Users by Activity</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Ranked by total token usage</p>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-foreground/10 bg-foreground/[0.02] text-muted-foreground text-xs">
                                <th className="px-4 py-3 text-left font-medium">#</th>
                                <th className="px-4 py-3 text-left font-medium">User</th>
                                <th className="px-4 py-3 text-left font-medium">Videos</th>
                                <th className="px-4 py-3 text-left font-medium">Tokens Used</th>
                                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Video Time</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Last Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-foreground/[0.06]">
                            {stats.topUsers.map((u, i) => {
                                const pct = stats.totalTokens > 0 ? Math.round((u.totalTokens / stats.totalTokens) * 100) : 0;
                                return (
                                    <tr key={u._id} className="hover:bg-foreground/[0.02] transition-colors">
                                        <td className="px-4 py-3 text-muted-foreground/60 tabular-nums">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="size-7 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                                    {(u.userEmail?.[0] ?? "?").toUpperCase()}
                                                </div>
                                                <span className="text-xs text-muted-foreground truncate max-w-[180px]">{u.userEmail || "Unknown"}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="flex items-center gap-1 text-sm font-medium">
                                                <FilmIcon className="size-3.5 text-blue-400" />
                                                {u.videoCount}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <ZapIcon className="size-3.5 text-yellow-500 shrink-0" />
                                                    <span className="text-sm font-medium">{fmtTokens(u.totalTokens)}</span>
                                                    <span className="text-xs text-muted-foreground/60">{pct}%</span>
                                                </div>
                                                <div className="h-1 w-28 rounded-full bg-foreground/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-yellow-500/70" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                                            {fmtDuration(u.totalDurationSeconds)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs">
                                            {u.lastActivity
                                                ? new Date(u.lastActivity).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                                : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}