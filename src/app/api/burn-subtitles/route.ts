import { NextResponse } from "next/server";
import path from "path";
import os from "os";
import fs from "fs";
import { Readable } from "stream";
import { getObjectStream, uploadStreamToR2, generatePresignedGetUrl } from "@/lib/r2";
import { burnSubtitles } from "@/lib/ffmpeg";
import { cleanupTempFile } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300; // allow up to 5 min for ffmpeg encoding

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { key, srtContent } = body as { key?: string; srtContent?: string };
        if (!key) return NextResponse.json({ error: "Missing video key" }, { status: 400 });

        // Download video from R2
        const objectStream = await getObjectStream(key);
        if (!objectStream) return NextResponse.json({ error: "Video not found" }, { status: 404 });

        const ext = key.split(".").pop() ?? "mp4";
        const videoTemp = path.join(os.tmpdir(), `video_burn_${Date.now()}.${ext}`);

        await new Promise<void>((resolve, reject) => {
            const writeStream = fs.createWriteStream(videoTemp);
            const readable = objectStream as unknown as Readable;
            readable.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            readable.on("error", reject);
        });

        // Prepare SRT: either use provided content or attempt to fetch <base>.edited.srt from R2
        const base = key.replace(/\.[^/.]+$/, "");
        const srtTemp = path.join(os.tmpdir(), `subs_${Date.now()}.srt`);

        if (srtContent) {
            fs.writeFileSync(srtTemp, srtContent, "utf-8");
        } else {
            // Try edited SRT first, then fall back to original
            const editedKey = `${base}.edited.srt`;
            const originalKey = `${base}.srt`;
            let fetched = false;

            for (const srtKey of [editedKey, originalKey]) {
                try {
                    const sStream = await getObjectStream(srtKey);
                    if (!sStream) continue;
                    await new Promise<void>((resolve, reject) => {
                        const ws = fs.createWriteStream(srtTemp);
                        (sStream as unknown as Readable).pipe(ws);
                        ws.on("finish", resolve);
                        ws.on("error", reject);
                    });
                    console.log("[burn] fetched SRT from R2:", srtKey);
                    fetched = true;
                    break;
                } catch {
                    // try next key
                }
            }

            if (!fetched) {
                cleanupTempFile(videoTemp);
                return NextResponse.json({ error: "No SRT content provided — please regenerate subtitles" }, { status: 400 });
            }
        }

        // Verify SRT file was written correctly before burning
        const srtStats = fs.statSync(srtTemp);
        console.log("[burn] srtTemp:", srtTemp, "size:", srtStats.size);
        console.log("[burn] videoTemp:", videoTemp);

        // Burn subtitles
        const outPath = await burnSubtitles(videoTemp, srtTemp);

        // Upload captioned video back to R2
        const outKey = `${base}.captioned.mp4`;
        const stat = fs.statSync(outPath);
        const read = fs.createReadStream(outPath);
        await uploadStreamToR2(outKey, read as any, "video/mp4", stat.size);

        // Clean up
        cleanupTempFile(videoTemp);
        cleanupTempFile(srtTemp);
        cleanupTempFile(outPath);

        // Return a presigned GET URL so production/private R2 buckets can be fetched by browsers
        const presignedUrl = await generatePresignedGetUrl(outKey, 60 * 10);
        return NextResponse.json({ ok: true, key: outKey, url: presignedUrl });
    } catch (err: any) {
        console.error("burn-subtitles error", err);
        return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
    }
}
