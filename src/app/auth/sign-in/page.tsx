import Icons from "@/components/global/icons";
import SignInForm from "@/components/auth/signin-form";
import Link from "next/link";

const SignInPage = () => {
    return (
        <div className="flex flex-col items-start max-w-sm mx-auto h-dvh overflow-hidden pt-4 md:pt-20">
            <div className="flex items-center w-full py-8 border-b border-border/80">
                <Link href="/" className="flex items-center gap-x-2">
                    <Icons.wordmark className="h-7 w-auto" />
                </Link>
            </div>
            <SignInForm />
            <div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
                <p className="text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link href="/auth/sign-up" className="text-primary">Sign up</Link>
                </p>
            </div>
        </div>
    );
};

export default SignInPage;
