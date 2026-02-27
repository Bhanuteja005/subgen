import { NextRequest, NextResponse } from "next/server";
import { uploadStreamToR2, uploadBufferToR2, getPublicUrl } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Server-side upload fallback — accepts the raw video body from the browser and
 * stores it in R2.  This bypasses the CORS requirement that the presigned-URL
 * (XHR PUT) approach needs, at the cost of going through Vercel's network.
 *
 * For files whose Content-Length is known the body is piped directly to R2
 * without buffering.  When the size is unknown (or 0) the body is fully
 * buffered first — practical only for smaller files (≤ Vercel's request limit).
 */
export async function POST(request: NextRequest) {
    try {
        const contentType = (
            request.headers.get("x-file-type") ??
            request.headers.get("content-type") ??
            "video/mp4"
        ).toLowerCase().split(";")[0].trim();

        const filename = decodeURIComponent(
            request.headers.get("x-file-name") ?? "upload.mp4"
        );
        const contentLength = parseInt(
            request.headers.get("x-file-size") ??
            request.headers.get("content-length") ?? "0",
            10
        );

        if (!contentType.startsWith("video/")) {
            return NextResponse.json(
                { error: "Only video files are accepted" },
                { status: 400 }
            );
        }

        if (!request.body) {
            return NextResponse.json(
                { error: "No file body received" },
                { status: 400 }
            );
        }

        const ext = filename.split(".").pop()?.toLowerCase() ?? "mp4";
        const key = `telugu-subtitles/${uuidv4()}.${ext}`;

        if (contentLength > 0) {
            // Stream directly to R2 — no Lambda memory overhead
            console.log(`[upload] streaming ${(contentLength / 1024 / 1024).toFixed(2)} MB → ${key}`);
            const nodeStream = Readable.fromWeb(request.body as any);
            await uploadStreamToR2(key, nodeStream, contentType, contentLength);
        } else {
            // Content-Length unknown — buffer and upload
            const arrayBuffer = await request.arrayBuffer();
            console.log(`[upload] buffered ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB → ${key}`);
            await uploadBufferToR2(key, Buffer.from(arrayBuffer), contentType);
        }

        console.log("[upload] done:", key);
        return NextResponse.json({ key, url: getPublicUrl(key) });
    } catch (error) {
        console.error("[upload] error:", error);
        const message = error instanceof Error ? error.message : "Upload failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
