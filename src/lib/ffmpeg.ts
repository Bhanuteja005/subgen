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
    // Use a short output filename with no special characters
    const id = Date.now();
    const outputPath = path.join(os.tmpdir(), `cap${id}.mp4`);

    // Platform-aware escaping for the subtitles filter path argument.
    // On Windows the drive-letter colon (C:) must be escaped as C\:
    // On Linux/production (Vercel) the path is already safe — do NOT escape colons or it breaks.
    let srtFilterPath: string;
    if (process.platform === "win32") {
        srtFilterPath = srtPath
            .replace(/\\/g, "/")          // backslash → forward slash
            .replace(/^([A-Za-z]):/, "$1\\:"); // C: → C\:
    } else {
        srtFilterPath = srtPath; // Linux: use path as-is
    }
    // Escape any single quotes in the path itself
    const escapedPath = srtFilterPath.replace(/'/g, "\\'");

    // Subtitle style: white text, semi-transparent black opaque-box, raised above controls.
    // No Fontname — Arial is unavailable on Linux; omitting lets ffmpeg pick the best available font.
    const forceStyle = [
        "Fontsize=22",
        "PrimaryColour=&H00FFFFFF",  // white text  (&HAABBGGRR, AA=00 = fully opaque)
        "BackColour=&H80000000",     // semi-transparent black box (AA=80 = ~50% transparent)
        "BorderStyle=3",             // opaque/box style (renders BackColour as solid background)
        "Outline=0",
        "Shadow=0",
        "Alignment=2",               // bottom-center
        "MarginV=55",                // raise above controls / mic / toolbar
    ].join(",");

    const vfFilter = `subtitles='${escapedPath}':force_style='${forceStyle}'`;

    console.log("[ffmpeg] burnSubtitles vf:", vfFilter);

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions(["-y", "-c:v libx264", "-crf 18", "-preset veryfast", "-c:a copy"])
            .videoFilters(vfFilter)
            .on("end", () => {
                console.log("[ffmpeg] burnSubtitles complete →", outputPath);
                resolve(outputPath);
            })
            .on("error", (err, _stdout, stderr) => {
                console.error("[ffmpeg] burnSubtitles stderr:", stderr);
                reject(new Error(`FFmpeg burn error: ${err.message}\n${stderr ?? ""}`));
            })
            .save(outputPath);
    });
}
