"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, FilmIcon, ZapIcon, UsersIcon, ShieldIcon } from "lucide-react";

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

function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

export default function AdminUsersPage() {
    const { data: rawUsers = [], isLoading, isError } = useQuery({
        queryKey: ["admin-users"],
        queryFn: fetchUsers,
        refetchInterval: 30_000,
    });

    // Sort by token usage descending
    const users = [...rawUsers].sort((a, b) => b.totalTokens - a.totalTokens);
    const maxTokens = users[0]?.totalTokens ?? 1;
    const totalTokens = users.reduce((s, u) => s + u.totalTokens, 0);
    const adminCount = users.filter(u => u.role === "admin").length;

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Users</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {users.length} registered · {adminCount} admin · {fmtTokens(totalTokens)} total tokens
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
                        <UsersIcon className="size-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">{users.length}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
                        <ShieldIcon className="size-4 text-purple-400" />
                        <span className="text-sm font-semibold">{adminCount}</span>
                    </div>
                </div>
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
                            <tr className="border-b border-foreground/10 bg-foreground/[0.03] text-muted-foreground text-xs">
                                <th className="px-4 py-3 text-left font-medium">#</th>
                                <th className="px-4 py-3 text-left font-medium">User</th>
                                <th className="px-4 py-3 text-left font-medium">Role</th>
                                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Joined</th>
                                <th className="px-4 py-3 text-left font-medium">Videos</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Token Usage</th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Last Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-foreground/[0.06]">
                            {users.map((u, i) => {
                                const barPct = maxTokens > 0 ? Math.round((u.totalTokens / maxTokens) * 100) : 0;
                                const sharePct = totalTokens > 0 ? Math.round((u.totalTokens / totalTokens) * 100) : 0;
                                return (
                                    <tr key={u.id} className="hover:bg-foreground/[0.02] transition-colors">
                                        <td className="px-4 py-3 text-muted-foreground/50 tabular-nums text-xs">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="size-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                                    {(u.name?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-xs leading-tight">{u.name}</p>
                                                    <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                                u.role === "admin"
                                                    ? "bg-purple-500/10 text-purple-400"
                                                    : "bg-foreground/10 text-muted-foreground"
                                            }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                                            {fmtDate(u.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                                                <FilmIcon className="size-3.5 text-blue-400" />
                                                {u.videoCount}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <ZapIcon className="size-3.5 text-yellow-500 shrink-0" />
                                                    <span className="text-xs font-medium">{fmtTokens(u.totalTokens)}</span>
                                                    <span className="text-[11px] text-muted-foreground/60">{sharePct}% of total</span>
                                                </div>
                                                <div className="h-1.5 w-32 rounded-full bg-foreground/10 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-yellow-500/80 to-yellow-400/60 transition-all"
                                                        style={{ width: `${barPct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs">
                                            {fmtDate(u.lastActivity)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {users.length > 0 && (
                            <tfoot>
                                <tr className="border-t border-foreground/10 bg-foreground/[0.02] text-xs text-muted-foreground font-medium">
                                    <td className="px-4 py-3" colSpan={4}>Totals</td>
                                    <td className="px-4 py-3">
                                        <span className="flex items-center gap-1">
                                            <FilmIcon className="size-3.5 text-blue-400" />
                                            {users.reduce((s, u) => s + u.videoCount, 0)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 hidden lg:table-cell">
                                        <span className="flex items-center gap-1">
                                            <ZapIcon className="size-3.5 text-yellow-500" />
                                            {fmtTokens(totalTokens)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 hidden lg:table-cell" />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                    {users.length === 0 && (
                        <div className="text-center py-16 text-muted-foreground text-sm">No users found</div>
                    )}
                </div>
            )}
        </div>
    );
}
