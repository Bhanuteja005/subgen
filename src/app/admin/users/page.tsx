"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, FilmIcon, ZapIcon } from "lucide-react";

interface AdminUser {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    videoCount: number;
    totalTokens: number;
    lastActivity: string | null;
}

async function fetchUsers(): Promise<AdminUser[]> {
    const res = await fetch("/api/admin/users");
    if (!res.ok) throw new Error("Failed to load users");
    const data = await res.json();
    return data.users ?? [];
}

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsersPage() {
    const { data: users = [], isLoading, isError } = useQuery({
        queryKey: ["admin-users"],
        queryFn: fetchUsers,
        refetchInterval: 30_000,
    });

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Users</h1>
                <p className="text-sm text-muted-foreground mt-1">{users.length} registered users</p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Loader2Icon className="size-5 animate-spin" /> Loading users…
                </div>
            ) : isError ? (
                <div className="flex items-center justify-center py-20 text-red-400">
                    Failed to load users.
                </div>
            ) : (
                <div className="rounded-xl border border-foreground/10 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-foreground/10 bg-foreground/[0.03] text-muted-foreground">
                                <th className="px-4 py-3 text-left font-medium">User</th>
                                <th className="px-4 py-3 text-left font-medium">Role</th>
                                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Joined</th>
                                <th className="px-4 py-3 text-left font-medium">Videos</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Tokens</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Last Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-foreground/[0.06]">
                            {users.map((u) => (
                                <tr key={u.id} className="hover:bg-foreground/[0.02] transition-colors">
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="font-medium">{u.name}</p>
                                            <p className="text-xs text-muted-foreground">{u.email}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                                            u.role === "admin"
                                                ? "bg-purple-500/10 text-purple-400"
                                                : "bg-foreground/10 text-muted-foreground"
                                        }`}>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                        {fmtDate(u.createdAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="flex items-center gap-1 text-muted-foreground">
                                            <FilmIcon className="size-3.5" />
                                            {u.videoCount}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                        <span className="flex items-center gap-1">
                                            <ZapIcon className="size-3.5 text-yellow-500" />
                                            {u.totalTokens > 999 ? `${(u.totalTokens / 1000).toFixed(1)}k` : u.totalTokens}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                        {fmtDate(u.lastActivity)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {users.length === 0 && (
                        <div className="text-center py-16 text-muted-foreground text-sm">No users found</div>
                    )}
                </div>
            )}
        </div>
    );
}
