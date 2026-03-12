"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquareIcon } from "lucide-react";

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

async function fetchFeedbacks(): Promise<{ feedbacks: FeedbackItem[] }> {
    const res = await fetch("/api/feedback");
    if (!res.ok) throw new Error("Failed to load feedback");
    return res.json();
}

export default function AdminFeedbackPage() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["admin-feedback"],
        queryFn: fetchFeedbacks,
        refetchInterval: 30_000,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full p-12 text-muted-foreground">
                Loading…
            </div>
        );
    }
    if (isError) {
        return (
            <div className="flex items-center justify-center h-full p-12 text-red-400">
                Unable to load feedback.
            </div>
        );
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <MessageSquareIcon className="size-5 text-primary" /> User Feedback
            </h1>
            {data?.feedbacks?.length === 0 ? (
                <div className="text-sm text-muted-foreground">No messages yet.</div>
            ) : (
                <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] overflow-hidden">
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
                            {data?.feedbacks?.map(fb => (
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
                </div>
            )}
        </div>
    );
}