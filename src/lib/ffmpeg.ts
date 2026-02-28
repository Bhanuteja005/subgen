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
// Subtitle burning — drawtext approach
//
// We parse the SRT ourselves and render each segment with ffmpeg's `drawtext`
// filter.  Unlike `ass` / `subtitles` filters, drawtext uses FreeType directly
// (no libass, no system font directory) so it works on every platform including
// Vercel Lambda which has NO system fonts at all.
// ─────────────────────────────────────────────────────────────────────────────

interface SrtSegment {
    start: number;  // seconds (float)
    end: number;
    text: string;   // single line (multi-line joined with " ")
}

/** Parse an SRT string into timed text segments */
function parseSrt(srtContent: string): SrtSegment[] {
    const normalised = srtContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = normalised.trim().split(/\n{2,}/);

    function srtTimeToSec(t: string): number {
        const clean = t.trim();
        const commaIdx = clean.lastIndexOf(",");
        const hms = clean.slice(0, commaIdx);
        const ms = Number(clean.slice(commaIdx + 1));
        const [h, m, s] = hms.split(":").map(Number);
        return h * 3600 + m * 60 + s + ms / 1000;
    }

    const segments: SrtSegment[] = [];
    for (const block of blocks) {
        const lines = block.trim().split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) continue;
        const timeLine = lines[1];
        if (!timeLine.includes("-->")) continue;
        const arrowIdx = timeLine.indexOf("-->");
        const start = srtTimeToSec(timeLine.slice(0, arrowIdx));
        const end = srtTimeToSec(timeLine.slice(arrowIdx + 3));
        // Join multi-line text with a space for drawtext (single-line rendering)
        const text = lines.slice(2).join(" ");
        segments.push({ start, end, text });
    }
    return segments;
}

/**
 * Escape text for use inside ffmpeg's drawtext `text=` value.
 *
 * ffmpeg drawtext escaping rules (we are NOT in a shell — fluent-ffmpeg uses
 * child_process.spawn so no shell quoting is needed; only ffmpeg-level escaping):
 *   \  →  \\       (backslash)
 *   '  →  \'       (single quote — drawtext text option delimiter)
 *   :  →  \:       (colon — ffmpeg option separator)
 *   %  →  \%       (percent — drawtext expansion)
 */
function escapeDrawtext(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/:/g, "\\:")
        .replace(/%/g, "\\%");
}

/**
 * Build a chained `drawtext` filter string for all subtitle segments.
 *
 * Each segment renders white bold text on an opaque black background box,
 * centered horizontally, positioned 55px from the bottom — matching the
 * website's live subtitle overlay exactly.
 *
 * No fontfile/fontsdir needed: ffmpeg's built-in FreeType glyph renderer
 * supplies a default monospace fallback when fontfile is omitted.
 */
function buildDrawtextFilter(segments: SrtSegment[]): string {
    return segments.map(seg => {
        const t = escapeDrawtext(seg.text);
        // x centers the text box; y positions it near the bottom
        return (
            `drawtext=text='${t}'` +
            `:enable='between(t,${seg.start.toFixed(3)},${seg.end.toFixed(3)})'` +
            `:fontcolor=white` +
            `:fontsize=36` +
            `:box=1` +
            `:boxcolor=black@1.0` +
            `:boxborderw=12` +
            `:x=(w-text_w)/2` +
            `:y=h-text_h-55` +
            `:line_spacing=4`
        );
    }).join(",");
}

/**
 * Burn subtitles from an SRT file into a video using ffmpeg's drawtext filter.
 *
 * drawtext uses FreeType directly — no libass, no system fonts, works on
 * every serverless platform including Vercel Lambda.
 *
 * Returns the path to the output MP4 file.
 */
export async function burnSubtitles(videoPath: string, srtPath: string): Promise<string> {
    ensureFfmpegConfigured();
    const id = Date.now();
    const outputPath = path.join(os.tmpdir(), `cap${id}.mp4`);

    const srtContent = fs.readFileSync(srtPath, "utf-8");
    const segments = parseSrt(srtContent);
    console.log(`[ffmpeg] parsed ${segments.length} subtitle segments from SRT`);

    if (segments.length === 0) {
        // Nothing to burn — copy the video as-is
        console.warn("[ffmpeg] no subtitle segments found — copying video without subtitles");
        return new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .outputOptions(["-c", "copy"])
                .on("end", () => resolve(outputPath))
                .on("error", (err: Error) => reject(new Error(`FFmpeg copy error: ${err.message}`)))
                .save(outputPath);
        });
    }

    const filterStr = buildDrawtextFilter(segments);
    console.log("[ffmpeg] drawtext filter length:", filterStr.length, "chars");
    console.log("[ffmpeg] filter preview:", filterStr.slice(0, 200) + "…");

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            // -vf must be passed as TWO separate arguments to avoid shell-quoting
            // issues.  fluent-ffmpeg spawn escapes each arg individually.
            .addOptions(["-vf", filterStr])
            .addOptions([
                "-c:v", "libx264",
                "-crf", "20",
                "-preset", "veryfast",
                "-c:a", "copy",
                "-y",
            ])
            .on("start", (cmd: string) =>
                console.log("[ffmpeg] spawn:", cmd.slice(0, 300))
            )
            .on("end", () => {
                console.log("[ffmpeg] burn complete →", outputPath);
                resolve(outputPath);
            })
            .on("error", (err: Error, _stdout?: unknown, stderr?: unknown) => {
                console.error("[ffmpeg] BURN ERROR:", err.message);
                console.error("[ffmpeg] stderr:", String(stderr ?? "").slice(0, 1000));
                reject(
                    new Error(
                        `FFmpeg burn error: ${err.message}\n${String(stderr ?? "").slice(0, 500)}`
                    )
                );
            })
            .save(outputPath);
    });
}
