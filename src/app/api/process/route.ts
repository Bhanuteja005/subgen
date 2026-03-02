import { NextRequest, NextResponse } from "next/server";
import { getObjectStream, getPublicUrl, uploadBufferToR2 } from "@/lib/r2";
import { extractAudio, cleanupTempFile } from "@/lib/ffmpeg";
import { transcribeTeluguAudio } from "@/lib/fastrouter";
import { segmentsToSrt, segmentsToVtt, segmentsToOriginalSrt } from "@/lib/srt";
import { Readable } from "stream";
import path from "path";
import os from "os";
import fs from "fs";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import VideoJob from "@/models/video-job";

export const runtime = "nodejs";
// Allow up to 5 minutes for processing
export const maxDuration = 300;

/** Retry a function on 503 / high-demand errors with exponential back-off. */
async function withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    baseDelayMs = 3000
): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const is503 =
                msg.includes("503") ||
                msg.includes("UNAVAILABLE") ||
                msg.includes("high demand") ||
                msg.includes("overloaded");
            if (is503 && attempt < retries) {
                const delay = baseDelayMs * (attempt + 1); // 3s, 6s, 9s
                console.warn(
                    `AI model overloaded (attempt ${attempt + 1}/${retries + 1}). Retrying in ${delay / 1000}s…`
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
    // Should never reach here
    throw new Error("withRetry: exhausted all attempts");
}

export async function POST(request: NextRequest) {
    let videoTempPath: string | null = null;
    let audioTempPath: string | null = null;

    try {
        const { key, fileName, fileSize } = await request.json();

        if (!key) {
            return NextResponse.json(
                { error: "Video key is required" },
                { status: 400 }
            );
        }

        // Get session (optional – we save job even if unauthenticated, with empty userId)
        let userId = "";
        let userEmail = "";
        try {
            const session = await auth.api.getSession({ headers: request.headers });
            userId = session?.user?.id ?? "";
            userEmail = session?.user?.email ?? "";
        } catch {
            // non-fatal
        }

        // Step 1: Download video from R2 to a temp file
        console.log("Downloading video from R2...");
        let objectStream: Awaited<ReturnType<typeof getObjectStream>>;
        try {
            objectStream = await getObjectStream(key);
        } catch (r2Err: unknown) {
            const r2Msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
            const isNotFound =
                r2Msg.includes("NoSuchKey") ||
                r2Msg.includes("does not exist") ||
                (r2Err as any)?.Code === "NoSuchKey";
            return NextResponse.json(
                {
                    error: isNotFound
                        ? "Video not found in storage — the upload may have failed. Please try uploading again."
                        : `Storage error: ${r2Msg}`,
                },
                { status: isNotFound ? 404 : 502 }
            );
        }

        if (!objectStream) {
            return NextResponse.json(
                { error: "Video not found in storage — please try uploading again." },
                { status: 404 }
            );
        }

        const ext = key.split(".").pop() ?? "mp4";
        videoTempPath = path.join(os.tmpdir(), `video_${Date.now()}.${ext}`);

        // Write stream to temp file
        await new Promise<void>((resolve, reject) => {
            const writeStream = fs.createWriteStream(videoTempPath!);
            // AWS SDK v3 Body is a SdkStreamMixin; cast to Node.js Readable
            const readable = objectStream as unknown as Readable;
            readable.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            readable.on("error", reject);
        });

        console.log("Video downloaded to:", videoTempPath);

        // Step 2: Extract audio using ffmpeg
        console.log("Extracting audio...");
        audioTempPath = await extractAudio(videoTempPath);
        console.log("Audio extracted to:", audioTempPath);

        // Step 3: Transcribe with FastRouter AI (Telugu → transliterated Latin)
        // Wrap in retry to handle 503 "model overloaded" transient errors
        console.log("Transcribing audio...");
        const segments = await withRetry(() => transcribeTeluguAudio(audioTempPath!));
        console.log(`Got ${segments.length} segments`);

        // Step 4: Generate SRT and VTT content
        const srtContent = segmentsToSrt(segments);       // transliterated (Latin)
        const vttContent = segmentsToVtt(segments);       // transliterated (Latin) — for video overlay
        const teluguSrtContent = segmentsToOriginalSrt(segments); // original Telugu script

        // Step 5: Persist SRT to R2 so the burn endpoint can use it as a fallback
        try {
            const base = key.replace(/\.[^/.]+$/, "");
            await uploadBufferToR2(`${base}.srt`, Buffer.from(srtContent, "utf-8"), "text/plain");
        } catch (uploadErr) {
            console.warn("Failed to save SRT to R2 (non-fatal):", uploadErr);
        }

        // Step 5b: Save VideoJob to MongoDB (non-fatal)
        try {
            await connectDB();
            const audioSizeBytes = audioTempPath ? fs.statSync(audioTempPath).size : 0;
            const tokenUsage = Math.round(audioSizeBytes / 1024 * 4); // ~4 tokens per audio KB
            const lastSeg = segments[segments.length - 1];
            const durationSeconds = lastSeg ? Math.ceil(lastSeg.end) : 0;
            await VideoJob.create({
                userId,
                userEmail,
                fileName: fileName ?? key.split("/").pop() ?? key,
                fileSize: fileSize ?? 0,
                r2Key: key,
                status: "done",
                durationSeconds,
                segmentCount: segments.length,
                tokenUsage,
                srtContent,
            });
        } catch (dbErr) {
            console.warn("Failed to save VideoJob to MongoDB (non-fatal):", dbErr);
        }

        // Step 6: Get the public video URL
        const videoUrl = getPublicUrl(key);

        return NextResponse.json({
            success: true,
            videoUrl,
            srtContent,
            vttContent,
            teluguSrtContent,
            segments,
            key,
        });
    } catch (error) {
        console.error("Processing error:", error);
        const message =
            error instanceof Error ? error.message : "Processing failed";
        return NextResponse.json({ error: message }, { status: 500 });
    } finally {
        // Clean up temp files
        if (videoTempPath) cleanupTempFile(videoTempPath);
        if (audioTempPath) cleanupTempFile(audioTempPath);
    }
}
