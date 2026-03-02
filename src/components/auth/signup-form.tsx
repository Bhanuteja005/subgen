"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signUp, signIn, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LoaderIcon } from "lucide-react";

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2 shrink-0" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const SignUpForm = () => {
    const isLoaded = true;
    const router = useRouter();
    const { data: session, isPending } = useSession();

    // If the user is already signed in, redirect to dashboard
    useEffect(() => {
        if (!isPending && session?.user) {
            router.replace("/dashboard");
        }
    }, [session, isPending, router]);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded) return;
        if (!name || !email || !password) {
            toast.error("Name, email and password are required!");
            return;
        }
        if (password.length < 8) {
            toast.error("Password must be at least 8 characters.");
            return;
        }
        setIsLoading(true);
        try {
            const result = await signUp.email({ name, email, password, callbackURL: "/auth/auth-callback" });
            if (result?.error) {
                toast.error(result.error.message ?? "Sign up failed.");
            } else {
                toast.success("Account created! Taking you to your dashboard…");
                // Hard navigation so the browser sends the fresh session cookie
                window.location.href = "/dashboard";
            }
        } catch {
            toast.error("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        if (!isLoaded) return;
        setIsGoogleLoading(true);
        try {
            // Go directly to dashboard — no intermediate auth-callback page
            await signIn.social({ provider: "google", callbackURL: "/dashboard" });
        } catch {
            toast.error("Google sign-up failed.");
            setIsGoogleLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-start gap-y-8 py-8 w-full px-0.5">
            <div className="space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight">Create an account</h2>
                <p className="text-sm text-muted-foreground">Start generating subtitles for free</p>
            </div>

            {/* Google */}
            <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                disabled={!isLoaded || isGoogleLoading}
                onClick={handleGoogleSignUp}
            >
                {isGoogleLoading
                    ? <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                    : <GoogleIcon />}
                Continue with Google
            </Button>

            <div className="flex items-center w-full gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or continue with email</span>
                <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSignUp} className="w-full space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                        id="name"
                        type="text"
                        value={name}
                        disabled={!isLoaded || isLoading}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your name"
                        className="w-full h-10 focus-visible:border-foreground"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        disabled={!isLoaded || isLoading}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="w-full h-10 focus-visible:border-foreground"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative w-full">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            disabled={!isLoaded || isLoading}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 8 characters"
                            className="w-full h-10 focus-visible:border-foreground"
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute top-1 right-1"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>

                <Button
                    type="submit"
                    disabled={!isLoaded || isLoading}
                    className="w-full h-10"
                >
                    {isLoading ? <LoaderIcon className="w-5 h-5 animate-spin" /> : "Create account"}
                </Button>
            </form>
        </div>
    );
};

export default SignUpForm;
