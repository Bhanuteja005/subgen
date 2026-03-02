"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signUp, signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LoaderIcon, Chrome } from "lucide-react";

const SignUpForm = () => {
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !password) { toast.error("All fields are required!"); return; }
        if (password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
        setIsLoading(true);
        try {
            const result = await signUp.email({ name, email, password, callbackURL: "/dashboard" });
            if (result?.error) {
                toast.error(result.error.message ?? "Sign up failed.");
            } else {
                toast.success("Account created!");
                router.push("/dashboard");
                router.refresh();
            }
        } catch { toast.error("An error occurred. Please try again."); }
        finally { setIsLoading(false); }
    };

    const handleGoogleSignUp = async () => {
        setIsGoogleLoading(true);
        try { await signIn.social({ provider: "google", callbackURL: "/dashboard" }); }
        catch { toast.error("Google sign-in failed."); setIsGoogleLoading(false); }
    };

    return (
        <div className="flex flex-col items-start gap-y-6 py-8 w-full px-0.5">
            <div>
                <h2 className="text-2xl font-semibold">Create an account</h2>
                <p className="text-sm text-muted-foreground mt-1">Start generating subtitles for free</p>
            </div>

            <Button type="button" variant="outline" className="w-full" disabled={isGoogleLoading} onClick={handleGoogleSignUp}>
                {isGoogleLoading ? <LoaderIcon className="w-4 h-4 mr-2 animate-spin" /> : <Chrome className="w-4 h-4 mr-2" />}
                Continue with Google
            </Button>

            <div className="flex items-center w-full gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSignUp} className="w-full space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" type="text" value={name} disabled={isLoading} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" className="w-full focus-visible:border-foreground" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} disabled={isLoading} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" className="w-full focus-visible:border-foreground" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative w-full">
                        <Input id="password" type={showPassword ? "text" : "password"} value={password} disabled={isLoading} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" className="w-full focus-visible:border-foreground" />
                        <Button type="button" size="icon" variant="ghost" disabled={isLoading} className="absolute top-1 right-1" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">
                    {isLoading ? <LoaderIcon className="w-5 h-5 animate-spin" /> : "Create account"}
                </Button>
            </form>
        </div>
    );
};

export default SignUpForm;
