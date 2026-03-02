"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FilmIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

interface AdminVideo {
    _id: string;
    userId: string;
    userEmail: string;
    fileName: string;
    fileSize: number;
    status: "processing" | "done" | "error";
    durationSeconds: number;
    segmentCount: number;
    tokenUsage: number;
    createdAt: string;
}

async function fetchAllVideos(): Promise<AdminVideo[]> {
    const res = await fetch("/api/admin/videos");
    if (!res.ok) throw new Error("Failed to load videos");
    const data = await res.json();
    return data.videos ?? [];
}

async function deleteAdminVideo(id: string): Promise<void> {
    const res = await fetch(`/api/admin/videos?id=${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete video");
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDuration(sec: number) {
    if (!sec) return "—";
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function fmtSize(bytes: number) {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: AdminVideo["status"] }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
            status === "done"       && "bg-green-500/10 text-green-400",
            status === "processing" && "bg-yellow-500/10 text-yellow-400",
            status === "error"      && "bg-red-500/10 text-red-400",
        )}>
            <span className={cn(
                "size-1.5 rounded-full inline-block",
                status === "done" && "bg-green-400",
                status === "processing" && "bg-yellow-400",
                status === "error" && "bg-red-400",
            )} />
            {status}
        </span>
    );
}

export default function AdminVideosPage() {
    const queryClient = useQueryClient();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const { data: videos = [], isLoading, isError } = useQuery({
        queryKey: ["admin-videos"],
        queryFn: fetchAllVideos,
        refetchInterval: 30_000,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteAdminVideo,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-videos"] }),
        onSettled: () => setDeletingId(null),
    });

    const handleDelete = (id: string) => {
        setDeletingId(id);
        deleteMutation.mutate(id);
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">All Videos</h1>
                <p className="text-sm text-muted-foreground mt-1">{videos.length} total video jobs</p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Loader2Icon className="size-5 animate-spin" /> Loading videos…
                </div>
            ) : isError ? (
                <div className="flex items-center justify-center py-20 text-red-400">
                    Failed to load videos.
                </div>
            ) : (
                <div className="rounded-xl border border-foreground/10 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-foreground/10 bg-foreground/[0.03] text-muted-foreground">
                                <th className="px-4 py-3 text-left font-medium">File</th>
                                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">User</th>
                                <th className="px-4 py-3 text-left font-medium">Status</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Duration</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Segs</th>
                                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Date</th>
                                <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-foreground/[0.06]">
                            {videos.map((v) => (
                                <tr key={v._id} className="hover:bg-foreground/[0.02] transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <FilmIcon className="size-3.5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <p className="font-medium truncate max-w-[160px]">{v.fileName}</p>
                                                <p className="text-xs text-muted-foreground">{fmtSize(v.fileSize)}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                                        {v.userEmail}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={v.status} />
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                        {fmtDuration(v.durationSeconds)}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                        {v.segmentCount || "—"}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                        {fmtDate(v.createdAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                onClick={() => handleDelete(v._id)}
                                                disabled={deletingId === v._id}
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
                    {videos.length === 0 && (
                        <div className="text-center py-16 text-muted-foreground text-sm">No videos yet</div>
                    )}
                </div>
            )}
        </div>
    );
}
