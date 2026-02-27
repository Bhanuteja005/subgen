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
 *
 * Style: white bold text on a solid black box (BorderStyle=3).
 * This matches the website subtitle overlay exactly and works with libass's
 * built-in glyph renderer — no system fonts needed on Lambda.
 */
function srtToAss(srtContent: string): string {
    // Normalise Windows CRLF → LF so block splitting works regardless of origin
    const normalised = srtContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // ASS header — NO // comments inside sections (ASS only allows ; comments)
    // BorderStyle=3  → opaque box drawn behind text (solid black background)
    // BackColour=&H00000000 → fully opaque black (AA=00 means opaque in ASS)
    // PrimaryColour=&H00FFFFFF → solid white text
    // Bold=-1 (true) → heavier weight, easier to read over video
    // Alignment=2 → bottom-center
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,36,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,1,0,2,20,20,60,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    function toAssTime(srt: string): string {
        // SRT: 00:00:01,000  →  ASS: 0:00:01.00
        const clean = srt.trim();
        const commaIdx = clean.lastIndexOf(",");
        const hms = clean.slice(0, commaIdx);
        const ms = clean.slice(commaIdx + 1);
        const [h, m, s] = hms.split(":");
        const cs = Math.floor(Number(ms) / 10).toString().padStart(2, "0");
        return `${Number(h)}:${m.padStart(2,"0")}:${s.padStart(2,"0")}.${cs}`;
    }

    const blocks = normalised.trim().split(/\n{2,}/);
    const events = blocks.map((block) => {
        const lines = block.trim().split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) return "";
        // lines[0] = sequence number, lines[1] = timestamps, lines[2+] = text
        const timeLine = lines[1];
        if (!timeLine.includes("-->")) return "";
        const arrowIdx = timeLine.indexOf("-->");
        const startRaw = timeLine.slice(0, arrowIdx).trim();
        const endRaw = timeLine.slice(arrowIdx + 3).trim();
        // Join multi-line subtitle text, escape ASS special chars
        const text = lines
            .slice(2)
            .join("\\N")
            .replace(/\{/g, "\\{")   // escape ASS override tags
            .replace(/\}/g, "\\}");
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
    const srtContent = fs.readFileSync(srtPath, "utf-8");
    const assContent = srtToAss(srtContent);
    const assPath = path.join(os.tmpdir(), `sub${id}.ass`);
    fs.writeFileSync(assPath, assContent, "utf-8");
    console.log("[ffmpeg] assPath:", assPath, "| size:", assContent.length, "bytes");
    // Log first 400 chars so we can verify the header is correct in production logs
    console.log("[ffmpeg] ASS preview:\n" + assContent.slice(0, 400));

    // Build the filter string — path escaping varies by platform
    let assFilterPath: string;
    if (process.platform === "win32") {
        // Windows: convert backslashes and escape drive-letter colon
        assFilterPath = assPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
    } else {
        // Linux / Lambda: /tmp/sub....ass — no special escaping needed
        assFilterPath = assPath;
    }
    // Escape single quotes in the path (unusual but safe)
    const escapedPath = assFilterPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const vfFilter = `ass='${escapedPath}'`;

    console.log("[ffmpeg] platform:", process.platform);
    console.log("[ffmpeg] vfFilter:", vfFilter);
    console.log("[ffmpeg] input:", videoPath, "| output:", outputPath);

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions([
                "-c:v", "libx264",
                "-crf", "20",
                "-preset", "veryfast",
                "-c:a", "copy",
            ])
            .videoFilters(vfFilter)
            .on("start", (cmd: string) => console.log("[ffmpeg] cmd:", cmd))
            .on("end", () => {
                cleanupTempFile(assPath);
                console.log("[ffmpeg] burn complete →", outputPath);
                resolve(outputPath);
            })
            .on("error", (err: Error, _stdout?: unknown, stderr?: unknown) => {
                console.error("[ffmpeg] BURN ERROR:", err.message);
                console.error("[ffmpeg] stderr:", String(stderr ?? "").slice(0, 1000));
                cleanupTempFile(assPath);
                reject(new Error(`FFmpeg burn error: ${err.message}\n${String(stderr ?? "").slice(0, 500)}`));
            })
            .save(outputPath);
    });
}
