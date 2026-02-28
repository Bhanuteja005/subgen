import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import fs from "fs";

// Resolve the real ffmpeg binary path at runtime.
// Priority: require('ffmpeg-static') → manual path candidates → system PATH
function resolveFfmpegPath(): string {
    // 1. Use require() since ffmpeg-static is in serverExternalPackages — works on all platforms
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ffmpegPath = require("ffmpeg-static") as string;
        if (ffmpegPath && fs.existsSync(ffmpegPath)) {
            console.log("[ffmpeg] resolved via require:", ffmpegPath);
            return ffmpegPath;
        }
    } catch { /* fall through */ }

    // 2. Manual search across known install locations
    const ext = process.platform === "win32" ? ".exe" : "";
    const candidates = [
        path.join(process.cwd(), "node_modules", "ffmpeg-static", `ffmpeg${ext}`),
        path.join("/var/task", "node_modules", "ffmpeg-static", `ffmpeg${ext}`), // Vercel Lambda
        path.join("/opt", "ffmpeg"),                                                // Lambda Layer
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            console.log("[ffmpeg] resolved via candidate:", candidate);
            return candidate;
        }
    }

    // 3. Rely on system PATH (local dev / Docker)
    console.warn("[ffmpeg] binary not found in node_modules, falling back to PATH");
    return "ffmpeg";
}

let _ffmpegConfigured = false;
function ensureFfmpegConfigured(): void {
    if (_ffmpegConfigured) return;
    const ffPath = resolveFfmpegPath();
    try {
        // On Lambda/Linux ensure the binary has the executable bit set
        if (process.platform !== "win32") {
            try { fs.chmodSync(ffPath, 0o755); } catch { /* already executable */ }
        }
        ffmpeg.setFfmpegPath(ffPath);
        _ffmpegConfigured = true;
    } catch (e) {
        console.warn('[ffmpeg] failed to set ffmpeg path during runtime configuration', e);
    }
}

/**
 * Extracts audio from a video file and saves it as a WAV file.
 * Returns the path to the extracted audio file.
 */
export async function extractAudio(videoPath: string): Promise<string> {
    ensureFfmpegConfigured();
    // Use forward slashes — ffmpeg on Windows can choke on backslash paths
    const audioPath = path.join(os.tmpdir(), `audio_${Date.now()}.wav`).replace(/\\/g, "/");
    const inputPath = videoPath.replace(/\\/g, "/");

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioChannels(1)
            .audioFrequency(16000)
            .outputOptions(["-acodec pcm_s16le", "-ar 16000", "-ac 1"])
            .format("wav")
            .on("end", () => resolve(audioPath))
            .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
            .save(audioPath);
    });
}

/**
 * Cleans up a temporary file silently.
 */
export function cleanupTempFile(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch {
        // Ignore cleanup errors
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtitle embedding — mov_text soft subtitle track (MP4 container)
//
// Instead of re-encoding pixels we mux the SRT directly into the MP4 as a
// closed-caption track (codec: mov_text).  This works on EVERY ffmpeg build
// because it requires no filters, no libfreetype, no libass — just the core
// muxer that ships in all builds.
//
// Result: the downloaded MP4 has a built-in subtitle track that all common
// players surface automatically:
//   • VLC   → always shown (can be toggled)
//   • QuickTime / macOS player → shown with CC button
//   • iOS native video player  → shown with CC button (mov_text is the
//                                  native iOS closed-caption format)
//   • Windows Movies & TV      → shown as captions
//   • ffplay / mpv              → shown by default
//
// Processing is near-instant (stream copy, no decode/re-encode).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Embed an SRT subtitle file into an MP4 as a soft subtitle track.
 *
 * Uses `mov_text` codec (the MP4-native subtitle format).  No video
 * re-encoding — every stream is copied as-is.  Works on any ffmpeg build.
 *
 * Returns the path to the output MP4 file.
 */
export async function burnSubtitles(videoPath: string, srtPath: string): Promise<string> {
    ensureFfmpegConfigured();
    const outputPath = path.join(os.tmpdir(), `cap${Date.now()}.mp4`);

    console.log("[ffmpeg] embedding SRT as mov_text track");
    console.log("[ffmpeg] video:", videoPath);
    console.log("[ffmpeg] srt:  ", srtPath);
    console.log("[ffmpeg] out:  ", outputPath);

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .input(srtPath)
            .outputOptions([
                "-c:v", "copy",      // copy video stream — no re-encode
                "-c:a", "copy",      // copy audio stream — no re-encode
                "-c:s", "mov_text",  // encode SRT → MP4 closed-caption track
            ])
            .on("start", (cmd: string) =>
                console.log("[ffmpeg] spawn:", cmd.slice(0, 300))
            )
            .on("end", () => {
                console.log("[ffmpeg] subtitle embed complete →", outputPath);
                resolve(outputPath);
            })
            .on("error", (err: Error, _stdout?: unknown, stderr?: unknown) => {
                console.error("[ffmpeg] EMBED ERROR:", err.message);
                console.error("[ffmpeg] stderr:", String(stderr ?? "").slice(0, 1000));
                reject(
                    new Error(
                        `FFmpeg embed error: ${err.message}\n${String(stderr ?? "").slice(0, 500)}`
                    )
                );
            })
            .save(outputPath);
    });
}

