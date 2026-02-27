import { NextRequest, NextResponse } from "next/server";
import { generatePresignedUploadUrl } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
    try {
        const { filename, contentType } = await request.json();

        if (!filename || !contentType) {
            return NextResponse.json(
                { error: "filename and contentType are required" },
                { status: 400 }
            );
        }

        // Validate that it's a video file
        if (!contentType.startsWith("video/")) {
            return NextResponse.json(
                { error: "Only video files are accepted" },
                { status: 400 }
            );
        }

        // Generate a unique key with timestamp for easy TTL tracking
        const ext = filename.split(".").pop() ?? "mp4";
        const key = `telugu-subtitles/${uuidv4()}.${ext}`;

        const uploadUrl = await generatePresignedUploadUrl(key, contentType, 300);

        return NextResponse.json({ uploadUrl, key });
    } catch (error) {
        console.error("Presigned URL error:", error);
        return NextResponse.json(
            { error: "Failed to generate upload URL" },
            { status: 500 }
        );
    }
}
