/**
 * Client-side subtitle burning using @ffmpeg/ffmpeg (WebAssembly).
 *
 * Uses single-thread core (no SharedArrayBuffer required) → no COOP/COEP
 * headers needed → safe with Vercel and R2 presigned URLs.
 *
 * Subtitle rendering strategy:
 *   Uses the `drawtext` filter (FreeType) NOT the `subtitles` filter (libass).
 *   Reason: libass inside the wasm sandbox has no fontconfig / system fonts,
 *   so the `subtitles` filter silently renders nothing.  drawtext works with
 *   a single explicit font file we load from CDN once and cache.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// CDN base for @ffmpeg/core single-thread UMD build
const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

// Font file served from our own public/ directory — no external CDN dependency.
// DejaVu Sans TTF: public/fonts/subtitle.ttf (757 KB, copied at build time)
const FONT_URL = "/fonts/subtitle.ttf";

// ── Module-level caches ────────────────────────────────────────────────────────

let _ffmpegInstance: FFmpeg | null = null;
let _loadPromise: Promise<FFmpeg> | null = null;
let _fontBytes: Uint8Array | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Fetch and cache the subtitle font (called once per page load). */
async function getFontBytes(): Promise<Uint8Array> {
    if (_fontBytes) return _fontBytes;
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`Failed to load subtitle font (${res.status})`);
    _fontBytes = new Uint8Array(await res.arrayBuffer());
    return _fontBytes;
}

/**
 * Escape a subtitle text string for use as an ffmpeg drawtext `text=` value.
 * Rules (filter-level quoting with surrounding single quotes):
 *   \ → \\    ' → \'    : → \:    % → %%    newlines → space
 */
function escapeDrawtext(raw: string): string {
    return raw
        .replace(/\\/g, "\\\\")          // backslash — must be first
        .replace(/'/g, "\\'")            // single quote
        .replace(/:/g, "\\:")            // colon (option separator)
        .replace(/%/g, "%%")             // drawtext variable prefix
        .replace(/<[^>]+>/g, "")         // strip SRT HTML tags like <i>
        .replace(/\n/g, " ")             // join multi-line entries
        .replace(/\s+/g, " ")            // collapse whitespace
        .trim();
}

/** Parse an SRT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm) to seconds. */
function parseSrtTimestamp(ts: string): number {
    const [timePart, fracPart = "0"] = ts.replace(",", ".").split(".");
    const parts = timePart.split(":").map(Number);
    const [h = 0, m = 0, s = 0] = parts;
    return h * 3600 + m * 60 + s + Number(fracPart) / Math.pow(10, fracPart.length);
}

/**
 * Convert SRT content → an ffmpeg drawtext filter string.
 * Each subtitle entry becomes one drawtext segment gated by `enable='between(t,...)'`.
 */
function buildDrawtextFilter(srtContent: string, fontPath: string): string {
    const blocks = srtContent.trim().split(/\n\n+/);
    const filters: string[] = [];

    for (const block of blocks) {
        const lines = block.trim().split("\n").filter((l) => l.trim());
        if (lines.length < 2) continue;

        // Find the timecode line (contains -->)
        const timeIdx = lines.findIndex((l) => l.includes("-->"));
        if (timeIdx < 0) continue;

        const m = lines[timeIdx].match(
            /(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/,
        );
        if (!m) continue;

        const start = parseSrtTimestamp(m[1]);
        const end = parseSrtTimestamp(m[2]);
        const rawText = lines.slice(timeIdx + 1).join("\n");
        const text = escapeDrawtext(rawText);
        if (!text) continue;

        filters.push(
            `drawtext=fontfile='${fontPath}'` +
            `:text='${text}'` +
            `:fontsize=28` +
            `:fontcolor=white` +
            `:bordercolor=black` +
            `:borderw=3` +
            `:shadowcolor=black@0.6` +
            `:shadowx=2:shadowy=2` +
            `:x=(w-text_w)/2` +
            `:y=h-80` +
            `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`,
        );
    }

    if (filters.length === 0) {
        throw new Error("No subtitle entries found in the SRT content.");
    }

    return filters.join(",");
}

// ── FFmpeg singleton ───────────────────────────────────────────────────────────

/**
 * Returns a loaded FFmpeg instance (singleton — loaded only once per page).
 * @param onLoadProgress  Called with 0–100 while the wasm core is downloading.
 */
async function getFFmpeg(onLoadProgress?: (pct: number) => void): Promise<FFmpeg> {
    if (_ffmpegInstance) return _ffmpegInstance;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const ff = new FFmpeg();

        ff.on("log", ({ message }: { message: string }) => {
            // Always log so we can see filter errors in production DevTools
            console.debug("[ffmpeg-wasm]", message);
        });

        onLoadProgress?.(5);

        const [coreURL, wasmURL] = await Promise.all([
            toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
            toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        ]);

        onLoadProgress?.(30);
        await ff.load({ coreURL, wasmURL });
        onLoadProgress?.(100);

        _ffmpegInstance = ff;
        return ff;
    })();

    try {
        return await _loadPromise;
    } finally {
        _loadPromise = null;
    }
}

/** Reset the cached instance (call if you need to free memory). */
export function resetFFmpegInstance(): void {
    _ffmpegInstance = null;
    _loadPromise = null;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Burns SRT subtitles into a video entirely in the browser using ffmpeg.wasm.
 *
 * Workflow:
 *  1. Download the source video via `/api/download-video` (server proxy).
 *  2. Fetch subtitle font from CDN (cached after first call).
 *  3. Load @ffmpeg/core wasm (cached after first call).
 *  4. Write video + font into the wasm virtual FS.
 *  5. Run: ffmpeg -i /input.mp4 -vf <drawtext-chain> -c:a copy /output.mp4
 *  6. Trigger browser download of the resulting blob.
 *
 * @param videoKey       R2 object key for the source video.
 * @param srtContent     SRT subtitle string (UTF-8).
 * @param outputFilename Filename for the downloaded file.
 * @param onProgress     Optional callback: (phase: string, pct: 0–100) => void
 */
export async function burnSubtitlesWasm(
    videoKey: string,
    srtContent: string,
    outputFilename: string,
    onProgress?: (phase: string, pct: number) => void,
): Promise<void> {
    // ── 1. Download source video + font in parallel ───────────────────────────
    onProgress?.("Downloading…", 0);
    const [videoRes, fontBytes] = await Promise.all([
        fetch(`/api/download-video?key=${encodeURIComponent(videoKey)}`),
        getFontBytes(),
    ]);

    if (!videoRes.ok) {
        let detail = `Video download failed (${videoRes.status})`;
        try {
            const body = await videoRes.json();
            if (body?.error) detail = body.error;
        } catch { /* non-JSON body */ }
        throw new Error(detail);
    }
    const videoData = await videoRes.arrayBuffer();
    onProgress?.("Downloading…", 100);

    // ── 2. Load wasm core (cached after first run, ~30 MB) ────────────────────
    onProgress?.("Loading encoder…", 0);
    const ff = await getFFmpeg((pct) => onProgress?.("Loading encoder…", pct));

    // ── 3. Build drawtext filter before touching the FS ───────────────────────
    const vfFilter = buildDrawtextFilter(srtContent, "/font.ttf");

    // ── 4. Progress events ────────────────────────────────────────────────────
    const progressHandler = ({ progress }: { progress: number }) => {
        onProgress?.("Burning subtitles…", Math.min(99, Math.round(progress * 100)));
    };
    ff.on("progress", progressHandler);

    try {
        // ── 5. Write files to wasm virtual FS ────────────────────────────────
        onProgress?.("Burning subtitles…", 0);
        await ff.writeFile("/input.mp4", new Uint8Array(videoData));
        await ff.writeFile("/font.ttf", fontBytes);

        // ── 6. Encode ─────────────────────────────────────────────────────────
        await ff.exec([
            "-i", "/input.mp4",
            "-vf", vfFilter,
            "-c:a", "copy",
            "/output.mp4",
        ]);

        // ── 7. Read output & trigger download ─────────────────────────────────
        onProgress?.("Preparing download…", 99);
        const outputData = (await ff.readFile("/output.mp4")) as Uint8Array;
        // Copy into a regular ArrayBuffer-backed Uint8Array so Blob() accepts it
        const safeData = new Uint8Array(outputData.byteLength);
        safeData.set(outputData);
        const blob = new Blob([safeData], { type: "video/mp4" });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

        onProgress?.("Done!", 100);
    } finally {
        ff.off("progress", progressHandler);
        // Free wasm FS memory
        for (const f of ["/input.mp4", "/font.ttf", "/output.mp4"]) {
            try { await ff.deleteFile(f); } catch { /* ignored */ }
        }
    }
}
