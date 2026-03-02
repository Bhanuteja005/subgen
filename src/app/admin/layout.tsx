"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import {
    LayoutGridIcon,
    UsersIcon,
    FilmIcon,
    LogOutIcon,
    Loader2Icon,
    ShieldAlertIcon,
} from "lucide-react";
import Icons from "@/components/global/icons";
import { cn } from "@/utils";

const navItems = [
    { href: "/admin",         label: "Analytics", icon: LayoutGridIcon },
    { href: "/admin/users",   label: "Users",     icon: UsersIcon },
    { href: "/admin/videos",  label: "Videos",    icon: FilmIcon },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { data: session, isPending } = useSession();

    useEffect(() => {
        if (!isPending) {
            if (!session?.user) {
                router.replace("/auth/sign-in");
            } else if ((session.user as Record<string, unknown>).role !== "admin") {
                router.replace("/dashboard");
            }
        }
    }, [session, isPending, router]);

    if (isPending || !session?.user || (session.user as Record<string, unknown>).role !== "admin") {
        return (
            <div className="flex items-center justify-center h-screen gap-3 text-muted-foreground">
                <Loader2Icon className="size-5 animate-spin" />
                <span>Verifying admin access…</span>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Sidebar */}
            <aside className="w-56 border-r border-foreground/10 flex flex-col shrink-0">
                <div className="p-4 border-b border-foreground/10">
                    <Icons.wordmark className="h-5 w-auto text-foreground" />
                    <div className="mt-1 flex items-center gap-1 text-xs text-primary">
                        <ShieldAlertIcon className="size-3" />
                        <span>Admin Panel</span>
                    </div>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {navItems.map(({ href, label, icon: Icon }) => (
                        <button
                            key={href}
                            onClick={() => router.push(href)}
                            className={cn(
                                "w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors cursor-pointer text-left",
                                pathname === href
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                            )}
                        >
                            <Icon className="size-4" />
                            {label}
                        </button>
                    ))}
                </nav>

                <div className="p-3 border-t border-foreground/10">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="w-full px-3 py-2 rounded-lg flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer mb-1"
                    >
                        <LayoutGridIcon className="size-4" />
                        User Dashboard
                    </button>
                    <button
                        onClick={async () => { await signOut(); router.push("/auth/sign-in"); }}
                        className="w-full px-3 py-2 rounded-lg flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
                    >
                        <LogOutIcon className="size-4" />
                        Sign out
                    </button>
                    <div className="mt-3 px-2">
                        <p className="text-xs font-medium truncate">{session.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
                    </div>
                </div>
            </aside>

            {/* Content */}
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
