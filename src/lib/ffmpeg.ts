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

/**
 * Convert an SRT string to ASS format with embedded styles.
 * This avoids relying on system fonts — libass uses its built-in fallback glyph.
 */
function srtToAss(srtContent: string): string {
    // ASS sections
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
// BorderStyle 1 = outline+shadow (works with built-in libass fallback font, no system font needed)
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,55,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    function toAssTime(srt: string): string {
        // SRT: 00:00:01,000  →  ASS: 0:00:01.00
        const [hms, ms] = srt.trim().split(",");
        const [h, m, s] = hms.split(":");
        const cs = Math.floor(Number(ms) / 10).toString().padStart(2, "0");
        return `${Number(h)}:${m}:${s}.${cs}`;
    }

    const blocks = srtContent.trim().split(/\n\s*\n/);
    const events = blocks.map((block) => {
        const lines = block.trim().split("\n");
        if (lines.length < 3) return "";
        const timeLine = lines[1];
        const [startRaw, endRaw] = timeLine.split(" --> ");
        const text = lines.slice(2).join("\\N").replace(/[{}]/g, ""); // escape braces
        const start = toAssTime(startRaw);
        const end = toAssTime(endRaw);
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    }).filter(Boolean);

    return header + events.join("\n") + "\n";
}

/**
 * Burn subtitles from an SRT file into a video and save as a new file.
 * Returns the path to the output file.
 */
export async function burnSubtitles(videoPath: string, srtPath: string): Promise<string> {
    ensureFfmpegConfigured();
    const id = Date.now();
    const outputPath = path.join(os.tmpdir(), `cap${id}.mp4`);

    // Convert SRT → ASS with embedded style so libass doesn't need system font files.
    // This is the most reliable approach on serverless Linux environments.
    const srtContent = fs.readFileSync(srtPath, "utf-8");
    const assContent = srtToAss(srtContent);
    const assPath = path.join(os.tmpdir(), `sub${id}.ass`);
    fs.writeFileSync(assPath, assContent, "utf-8");
    console.log("[ffmpeg] wrote ASS file:", assPath, "bytes:", assContent.length);

    // Platform-aware path escaping for the `ass` filter
    let assFilterPath: string;
    if (process.platform === "win32") {
        assFilterPath = assPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
    } else {
        assFilterPath = assPath;
    }
    const escapedPath = assFilterPath.replace(/'/g, "\\'");

    // Use the `ass` filter (not `subtitles`) — it renders pre-formatted ASS directly.
    // No fontsdir needed; style fonts fall back to libass built-in glyph renderer.
    const vfFilter = `ass='${escapedPath}'`;

    console.log("[ffmpeg] platform:", process.platform);
    console.log("[ffmpeg] vfFilter:", vfFilter);
    console.log("[ffmpeg] output:", outputPath);

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions(["-y", "-c:v libx264", "-crf 18", "-preset veryfast", "-c:a copy"])
            .videoFilters(vfFilter)
            .on("end", () => {
                cleanupTempFile(assPath);
                console.log("[ffmpeg] done →", outputPath);
                resolve(outputPath);
            })
            .on("error", (err: Error, _stdout?: unknown, stderr?: unknown) => {
                cleanupTempFile(assPath);
                console.error("[ffmpeg] stderr:", stderr);
                reject(new Error(`FFmpeg burn error: ${err.message}\n${String(stderr ?? "")}`));
            })
            .save(outputPath);
    });
}
