import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

// Use the current origin in the browser so the auth client always calls the
// correct port (dev / prod) instead of a hard-coded URL.
const baseURL =
    typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");

export const authClient = createAuthClient({
    baseURL,
    plugins: [adminClient()],
});

export const {
    signIn,
    signUp,
    signOut,
    useSession,
    getSession,
} = authClient;
