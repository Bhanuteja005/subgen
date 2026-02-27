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

ffmpeg.setFfmpegPath(resolveFfmpegPath());

/**
 * Extracts audio from a video file and saves it as a WAV file.
 * Returns the path to the extracted audio file.
 */
export async function extractAudio(videoPath: string): Promise<string> {
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

/**
 * Burn subtitles from an SRT file into a video and save as a new file.
 * Returns the path to the output file.
 */
export async function burnSubtitles(videoPath: string, srtPath: string): Promise<string> {
    const outputPath = path.join(os.tmpdir(), `captioned_${Date.now()}.mp4`).replace(/\\/g, "/");
    const input = videoPath.replace(/\\/g, "/");
    const subs = srtPath.replace(/\\/g, "/");

    return new Promise((resolve, reject) => {
        ffmpeg(input)
            .outputOptions(["-c:v libx264", "-crf 18", "-preset veryfast", "-c:a copy"])
            .videoFilters(`subtitles=${subs}`)
            .on("end", () => resolve(outputPath))
            .on("error", (err) => reject(new Error(`FFmpeg burn error: ${err.message}`)))
            .save(outputPath);
    });
}
