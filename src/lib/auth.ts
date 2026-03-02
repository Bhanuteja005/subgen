import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin } from "better-auth/plugins";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;

// Singleton MongoClient — MongoDB Node.js driver auto-connects on first op
declare global {
    // eslint-disable-next-line no-var
    var _mongoAuthClient: MongoClient | undefined;
}
const mongoClient: MongoClient =
    global._mongoAuthClient ?? (global._mongoAuthClient = new MongoClient(MONGODB_URI));

export const auth = betterAuth({
    database: mongodbAdapter(mongoClient.db()),
    secret: process.env.BETTER_AUTH_SECRET ?? "subgen-super-secret-key-32-chars!",
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        requireEmailVerification: false,
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_SECRET_KEY ?? "",
        },
    },
    plugins: [
        admin({
            adminRole: "admin",
            defaultRole: "user",
        }),
    ],
    trustedOrigins: [
        "http://localhost:3000",
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    ],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
