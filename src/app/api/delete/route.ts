import { NextRequest, NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";

export async function DELETE(request: NextRequest) {
    try {
        const { key } = await request.json();

        if (!key) {
            return NextResponse.json(
                { error: "Video key is required" },
                { status: 400 }
            );
        }

        // Only allow deleting files in the telugu-subtitles/ prefix for safety
        if (!key.startsWith("telugu-subtitles/")) {
            return NextResponse.json(
                { error: "Invalid key prefix" },
                { status: 400 }
            );
        }

        await deleteFromR2(key);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete error:", error);
        return NextResponse.json(
            { error: "Failed to delete video" },
            { status: 500 }
        );
    }
}
