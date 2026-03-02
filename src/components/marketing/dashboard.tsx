"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    LayoutGrid,
    UploadCloudIcon,
    Loader2Icon,
    LogOutIcon,
    Trash2Icon,
    DownloadIcon,
    FilmIcon,
    ZapIcon,
    FileTextIcon,
    RefreshCwIcon,
    ShieldAlertIcon,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import Icons from "../global/icons";
import { Button } from "../ui/button";
import { cn } from "@/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoJob {
    _id: string;
    fileName: string;
    fileSize: number;
    r2Key: string;
    status: "processing" | "done" | "error";
    durationSeconds: number;
    segmentCount: number;
    tokenUsage: number;
    createdAt: string;
    errorMessage?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDuration(sec: number) {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtSize(bytes: number) {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchVideos(): Promise<VideoJob[]> {
    const res = await fetch("/api/dashboard/videos");
    if (!res.ok) throw new Error("Failed to load videos");
    const data = await res.json();
    return data.videos ?? [];
}

async function deleteVideo(id: string): Promise<void> {
    const res = await fetch(`/api/dashboard/videos?id=${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete video");
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: { icon: React.FC<{ className?: string }>; label: string; value: string | number; sub?: string }) {
    return (
        <div className="flex items-center gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Icon className="size-5" />
            </div>
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </div>
        </div>
    );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VideoJob["status"] }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
            status === "done"       && "bg-green-500/10 text-green-400",
            status === "processing" && "bg-yellow-500/10 text-yellow-400",
            status === "error"      && "bg-red-500/10 text-red-400",
        )}>
            {status === "processing" && <Loader2Icon className="size-3 animate-spin" />}
            {status === "done"       && <span className="size-1.5 rounded-full bg-green-400 inline-block" />}
            {status === "error"      && <span className="size-1.5 rounded-full bg-red-400 inline-block" />}
            {status}
        </span>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
    const router = useRouter();
    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const { data: videos = [], isLoading, isError, refetch } = useQuery({
        queryKey: ["dashboard-videos"],
        queryFn: fetchVideos,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteVideo,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-videos"] }),
        onSettled: () => setDeletingId(null),
    });

    const handleLogout = async () => {
        await signOut();
        router.push("/auth/sign-in");
    };

    const handleDelete = (id: string) => {
        setDeletingId(id);
        deleteMutation.mutate(id);
    };

    const handleDownloadSRT = async (jobId: string, fileName: string) => {
        try {
            const res = await fetch(`/api/dashboard/videos/srt?id=${jobId}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.srtContent) return;
            const blob = new Blob([data.srtContent], { type: "text/plain" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = fileName.replace(/\.[^/.]+$/, "") + ".srt";
            a.click();
        } catch {
            // silently fail
        }
    };

    const totalTokens = videos.reduce((acc, v) => acc + (v.tokenUsage ?? 0), 0);
    const doneCount   = videos.filter(v => v.status === "done").length;
    const isAdmin     = (session?.user as Record<string, unknown>)?.role === "admin";

    return (
        <div className="w-full min-h-screen bg-background flex flex-col">
            {/* ── Header ── */}
            <header className="border-b border-foreground/10 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Icons.wordmark className="h-6 w-auto text-foreground" />
                    <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground border-l border-foreground/10 pl-3">
                        <LayoutGrid className="size-4" />
                        <span>Dashboard</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => router.push("/admin")}>
                            <ShieldAlertIcon className="size-3.5 mr-1.5" />
                            Admin
                        </Button>
                    )}
                    <div className="hidden sm:block text-right">
                        <p className="text-sm font-medium leading-tight">{session?.user?.name}</p>
                        <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={handleLogout}>
                        <LogOutIcon className="size-4 mr-1.5" />
                        Sign out
                    </Button>
                </div>
            </header>

            {/* ── Body ── */}
            <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-8">
                {/* Greeting */}
                <div>
                    <h1 className="text-2xl font-semibold">
                        Welcome back{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}!
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Here&apos;s an overview of your Telugu subtitle jobs.
                    </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard icon={FilmIcon}     label="Total Videos"     value={videos.length} />
                    <StatCard icon={LayoutGrid}   label="Completed"        value={doneCount} />
                    <StatCard icon={ZapIcon}      label="Tokens Used"      value={totalTokens > 999 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} />
                    <StatCard icon={FileTextIcon} label="SRT Files Ready"  value={doneCount} sub="ready to download" />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">My Videos</h2>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => refetch()}>
                            <RefreshCwIcon className="size-3.5 mr-1.5" />
                            Refresh
                        </Button>
                        <Button size="sm" onClick={() => router.push("/")}>
                            <UploadCloudIcon className="size-3.5 mr-1.5" />
                            New Upload
                        </Button>
                    </div>
                </div>

                {/* Table */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                        <Loader2Icon className="size-5 animate-spin" />
                        <span>Loading your videos…</span>
                    </div>
                ) : isError ? (
                    <div className="flex items-center justify-center py-20 text-red-400">
                        Failed to load videos. Please refresh.
                    </div>
                ) : videos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4 border border-dashed border-foreground/10 rounded-2xl">
                        <div className="p-4 rounded-2xl bg-primary/10 text-primary">
                            <UploadCloudIcon className="size-8" />
                        </div>
                        <div className="text-center">
                            <p className="font-medium">No videos yet</p>
                            <p className="text-sm text-muted-foreground mt-1">Upload your first Telugu video to get started</p>
                        </div>
                        <Button onClick={() => router.push("/")}>
                            <UploadCloudIcon className="size-4 mr-2" />
                            Upload Video
                        </Button>
                    </div>
                ) : (
                    <div className="rounded-xl border border-foreground/10 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-foreground/10 bg-foreground/[0.03] text-muted-foreground">
                                    <th className="px-4 py-3 text-left font-medium">File</th>
                                    <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Status</th>
                                    <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Duration</th>
                                    <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Segments</th>
                                    <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Date</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-foreground/[0.06]">
                                {videos.map((v) => (
                                    <tr key={v._id} className="hover:bg-foreground/[0.02] transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="p-1.5 rounded-lg bg-foreground/5 text-muted-foreground shrink-0">
                                                    <FilmIcon className="size-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate max-w-[200px]">{v.fileName}</p>
                                                    <p className="text-xs text-muted-foreground">{fmtSize(v.fileSize)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            <StatusBadge status={v.status} />
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                            {fmtDuration(v.durationSeconds)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                            {v.segmentCount > 0 ? v.segmentCount : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                                            {fmtDate(v.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 justify-end">
                                                {v.status === "done" && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleDownloadSRT(v._id, v.fileName)}
                                                        title="Download SRT"
                                                    >
                                                        <DownloadIcon className="size-3.5 mr-1" />
                                                        <span className="hidden sm:inline">SRT</span>
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                    onClick={() => handleDelete(v._id)}
                                                    disabled={deletingId === v._id}
                                                    title="Delete"
                                                >
                                                    {deletingId === v._id ? (
                                                        <Loader2Icon className="size-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2Icon className="size-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
