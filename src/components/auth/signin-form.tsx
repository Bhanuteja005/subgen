"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LoaderIcon, Chrome } from "lucide-react";

const SignInForm = () => {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) { toast.error("Email and password are required!"); return; }
        setIsLoading(true);
        try {
            const result = await signIn.email({ email, password, callbackURL: "/dashboard" });
            if (result?.error) {
                toast.error(result.error.message ?? "Invalid email or password");
            } else {
                router.push("/dashboard");
                router.refresh();
            }
        } catch { toast.error("An error occurred. Please try again."); }
        finally { setIsLoading(false); }
    };

    const handleGoogleSignIn = async () => {
        setIsGoogleLoading(true);
        try { await signIn.social({ provider: "google", callbackURL: "/dashboard" }); }
        catch { toast.error("Google sign-in failed."); setIsGoogleLoading(false); }
    };

    return (
        <div className="flex flex-col items-start gap-y-6 py-8 w-full px-0.5">
            <div>
                <h2 className="text-2xl font-semibold">Sign in to SubGen</h2>
                <p className="text-sm text-muted-foreground mt-1">Generate subtitles for your Telugu videos</p>
            </div>

            <Button type="button" variant="outline" className="w-full" disabled={isGoogleLoading} onClick={handleGoogleSignIn}>
                {isGoogleLoading ? <LoaderIcon className="w-4 h-4 mr-2 animate-spin" /> : <Chrome className="w-4 h-4 mr-2" />}
                Continue with Google
            </Button>

            <div className="flex items-center w-full gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSignIn} className="w-full space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} disabled={isLoading} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" className="w-full focus-visible:border-foreground" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative w-full">
                        <Input id="password" type={showPassword ? "text" : "password"} value={password} disabled={isLoading} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="w-full focus-visible:border-foreground" />
                        <Button type="button" size="icon" variant="ghost" disabled={isLoading} className="absolute top-1 right-1" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">
                    {isLoading ? <LoaderIcon className="w-5 h-5 animate-spin" /> : "Sign in with email"}
                </Button>
            </form>
        </div>
    );
};

export default SignInForm;
