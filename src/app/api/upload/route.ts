import { NextRequest, NextResponse } from "next/server";
import { uploadStreamToR2, getPublicUrl } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";

// Allow up to 5 minutes; no formData buffering — body is streamed directly to R2
export const maxDuration = 300;

export async function POST(request: NextRequest) {
    try {
        // Read metadata from headers — avoids multipart/formData body parsing entirely
        const contentType = (request.headers.get("x-file-type") ?? "video/mp4").toLowerCase();
        const filename = decodeURIComponent(request.headers.get("x-file-name") ?? "upload.mp4");
        const contentLength = parseInt(request.headers.get("x-file-size") ?? "0", 10);

        if (!contentType.startsWith("video/")) {
            return NextResponse.json({ error: "Only video files are accepted" }, { status: 400 });
        }

        if (!request.body) {
            return NextResponse.json({ error: "No file body received" }, { status: 400 });
        }

        const ext = filename.split(".").pop()?.toLowerCase() ?? "mp4";
        const key = `telugu-subtitles/${uuidv4()}.${ext}`;

        // Convert Web ReadableStream → Node.js Readable for AWS SDK
        const nodeStream = Readable.fromWeb(request.body as any);

        await uploadStreamToR2(key, nodeStream, contentType, contentLength);

        return NextResponse.json({ key, url: getPublicUrl(key) });
    } catch (error) {
        console.error("Upload error:", error);
        const message = error instanceof Error ? error.message : "Upload failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
