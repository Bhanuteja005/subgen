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

/**
 * Burn subtitles from an SRT file into a video and save as a new file.
 * Returns the path to the output file.
 */
export async function burnSubtitles(videoPath: string, srtPath: string): Promise<string> {
    ensureFfmpegConfigured();
    const outputPath = path.join(os.tmpdir(), `captioned_${Date.now()}.mp4`).replace(/\\/g, "/");
    const input = videoPath.replace(/\\/g, "/");
    const subsRaw = srtPath.replace(/\\/g, "/");
    // FFmpeg subtitles filter needs special escaping on Windows paths (drive letters, backslashes)
    // Escape single quotes, backslashes and colons for use inside single-quoted filter argument.
    const subsEscaped = subsRaw.replace(/'/g, "\\'").replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    const subs = subsEscaped;

    return new Promise((resolve, reject) => {
        // Use ASS/force_style to ensure a readable white-on-black box and lift subtitles above controls
        const forceStyle = "Fontname=Arial,Fontsize=28,PrimaryColour=&H00FFFFFF,BackColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=60";
        ffmpeg(input)
            .outputOptions(["-y", "-c:v libx264", "-crf 18", "-preset veryfast", "-c:a copy"])
            .videoFilters(`subtitles='${subs}':force_style='${forceStyle}'`)
            .on("end", () => resolve(outputPath))
            .on("error", (err) => reject(new Error(`FFmpeg burn error: ${err.message}`)))
            .save(outputPath);
    });
}
