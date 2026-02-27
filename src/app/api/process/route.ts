import { NextRequest, NextResponse } from "next/server";
import { getObjectStream, getPublicUrl } from "@/lib/r2";
import { extractAudio, cleanupTempFile } from "@/lib/ffmpeg";
import { transcribeTeluguAudio } from "@/lib/fastrouter";
import { segmentsToSrt, segmentsToVtt, segmentsToOriginalSrt } from "@/lib/srt";
import { Readable } from "stream";
import path from "path";
import os from "os";
import fs from "fs";

// Allow up to 5 minutes for processing
export const maxDuration = 300;

export async function POST(request: NextRequest) {
    let videoTempPath: string | null = null;
    let audioTempPath: string | null = null;

    try {
        const { key } = await request.json();

        if (!key) {
            return NextResponse.json(
                { error: "Video key is required" },
                { status: 400 }
            );
        }

        // Step 1: Download video from R2 to a temp file
        console.log("Downloading video from R2...");
        const objectStream = await getObjectStream(key);

        if (!objectStream) {
            return NextResponse.json(
                { error: "Video not found in storage" },
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
        console.log("Transcribing audio...");
        const segments = await transcribeTeluguAudio(audioTempPath);
        console.log(`Got ${segments.length} segments`);

        // Step 4: Generate SRT and VTT content
        const srtContent = segmentsToSrt(segments);       // transliterated (Latin)
        const vttContent = segmentsToVtt(segments);       // transliterated (Latin) — for video overlay
        const teluguSrtContent = segmentsToOriginalSrt(segments); // original Telugu script

        // Step 5: Get the public video URL
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
