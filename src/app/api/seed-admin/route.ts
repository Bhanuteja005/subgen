import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/seed-admin
 * Creates the admin user (admin@subgen.com / Admin@123456) if they don't already exist.
 * Should be called once after deployment.
 *
 * Protected by a simple secret header to avoid abuse:
 *   Authorization: Bearer <BETTER_AUTH_SECRET>
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.BETTER_AUTH_SECRET ?? "subgen-super-secret-key-32-chars!";

    if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Sign up the admin user via the Better Auth API
        const result = await auth.api.signUpEmail({
            body: {
                email: "admin@subgen.com",
                password: "Admin@123456",
                name: "SubGen Admin",
            },
            asResponse: false,
        });

        // Promote to admin role using the admin plugin
        if (result?.user?.id) {
            await auth.api.setRole({
                body: {
                    userId: result.user.id,
                    role: "admin",
                },
                // admin operations require an admin session header — bypass with internal call
                headers: new Headers({ "x-better-auth-internal": "1" }),
                asResponse: false,
            });
        }

        return NextResponse.json({
            success: true,
            message: "Admin user created successfully",
            email: "admin@subgen.com",
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // If the user already exists, that's fine
        if (message.toLowerCase().includes("already") || message.toLowerCase().includes("exist") || message.toLowerCase().includes("duplicate")) {
            return NextResponse.json({
                success: true,
                message: "Admin user already exists",
                email: "admin@subgen.com",
            });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
