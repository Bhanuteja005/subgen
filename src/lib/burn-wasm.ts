/**
 * Client-side subtitle burning using @ffmpeg/ffmpeg (WebAssembly).
 *
 * Uses single-thread core (no SharedArrayBuffer required) → no COOP/COEP
 * headers needed → safe with Vercel and R2 presigned URLs.
 *
 * Subtitle rendering:
 *   Uses `subtitles=subs.srt:fontsdir=/fonts` — libass native SRT parsing
 *   with an explicit font directory written into the wasm virtual FS.
 *   This bypasses fontconfig entirely and works inside the wasm sandbox.
 *   Previous approach (chained drawtext filters) produced corrupted output
 *   on longer videos because the massive filter string caused silent encode
 *   failures in the wasm encoder.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// @ffmpeg/core single-thread UMD build (no SharedArrayBuffer / COOP needed)
const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

// Font served from our own public/ — never 404, no CORS issues
const FONT_URL = "/fonts/subtitle.ttf";

// ── Module-level caches ────────────────────────────────────────────────────────

let _ffmpegInstance: FFmpeg | null = null;
let _loadPromise: Promise<FFmpeg> | null = null;
let _fontBytes: Uint8Array | null = null;

// ── Font loader ────────────────────────────────────────────────────────────────

async function getFontBytes(): Promise<Uint8Array> {
    if (_fontBytes) return _fontBytes;
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`Failed to load subtitle font (${res.status})`);
    _fontBytes = new Uint8Array(await res.arrayBuffer());
    return _fontBytes;
}

// ── FFmpeg singleton ───────────────────────────────────────────────────────────

async function getFFmpeg(onLoadProgress?: (pct: number) => void): Promise<FFmpeg> {
    if (_ffmpegInstance) return _ffmpegInstance;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const ff = new FFmpeg();
        ff.on("log", ({ message }: { message: string }) => {
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

export function resetFFmpegInstance(): void {
    _ffmpegInstance = null;
    _loadPromise = null;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Burns SRT subtitles into a video in the browser using ffmpeg.wasm.
 *
 * Flow:
 *  1. Fetch source video (/api/download-video) + font in parallel.
 *  2. Load @ffmpeg/core wasm singleton (cached after first call, ~30 MB).
 *  3. Write /input.mp4, /fonts/subtitle.ttf, /subs.srt into the wasm FS.
 *  4. ffmpeg -i /input.mp4
 *           -vf subtitles=/subs.srt:fontsdir=/fonts:force_style='...'
 *           -c:v libx264 -preset ultrafast -crf 23 -c:a copy /output.mp4
 *  5. Read output blob → trigger browser download.
 */
export async function burnSubtitlesWasm(
    videoKey: string,
    srtContent: string,
    outputFilename: string,
    onProgress?: (phase: string, pct: number) => void,
): Promise<void> {
    // ── 1. Fetch video + font in parallel ─────────────────────────────────────
    onProgress?.("Downloading…", 0);
    const [videoRes, fontBytes] = await Promise.all([
        fetch(`/api/download-video?key=${encodeURIComponent(videoKey)}`),
        getFontBytes(),
    ]);

    if (!videoRes.ok) {
        let detail = `Video download failed (${videoRes.status})`;
        try { const b = await videoRes.json(); if (b?.error) detail = b.error; } catch { /* */ }
        throw new Error(detail);
    }
    const videoData = await videoRes.arrayBuffer();
    onProgress?.("Downloading…", 100);

    // ── 2. Load wasm core ─────────────────────────────────────────────────────
    onProgress?.("Loading encoder…", 0);
    const ff = await getFFmpeg((pct) => onProgress?.("Loading encoder…", pct));

    // ── 3. Progress events ────────────────────────────────────────────────────
    const onProg = ({ progress }: { progress: number }) =>
        onProgress?.("Burning subtitles…", Math.min(99, Math.round(progress * 100)));
    ff.on("progress", onProg);

    try {
        // ── 4. Write to wasm FS ───────────────────────────────────────────────
        onProgress?.("Burning subtitles…", 0);
        // /fonts/ directory so libass can discover the font via fontsdir=
        try { await ff.createDir("/fonts"); } catch { /* already exists */ }

        await ff.writeFile("/input.mp4", new Uint8Array(videoData));
        await ff.writeFile("/fonts/subtitle.ttf", fontBytes);
        await ff.writeFile("/subs.srt", new TextEncoder().encode(srtContent));

        // ── 5. Encode ─────────────────────────────────────────────────────────
        // subtitles filter + explicit fontsdir  →  libass renders without
        // fontconfig or system fonts (both absent in the wasm sandbox).
        // force_style: minimal white text, solid black background box, 50px
        // from the bottom so it clears player control bars.
        const forceStyle = [
            "FontSize=16",
            "PrimaryColour=&H00FFFFFF",    // white text
            "OutlineColour=&H00000000",    // black outline
            "BackColour=&HCC000000",       // ~80% black box
            "BorderStyle=4",               // opaque background box
            "Outline=1",
            "Shadow=0",
            "Bold=0",
            "Alignment=2",                 // bottom-center
            "MarginV=50",                  // 50 px above bottom edge
        ].join(",");

        const ret = await ff.exec([
            "-i", "/input.mp4",
            "-vf", `subtitles=/subs.srt:fontsdir=/fonts:force_style='${forceStyle}'`,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", "copy",
            "-movflags", "+faststart",
            "/output.mp4",
        ]);

        if (ret !== 0) throw new Error(`FFmpeg exited with code ${ret}`);

        // ── 6. Download ───────────────────────────────────────────────────────
        onProgress?.("Preparing download…", 99);
        const outputData = (await ff.readFile("/output.mp4")) as Uint8Array;
        // .slice() creates a new ArrayBuffer copy — required for Blob()
        const blob = new Blob([outputData.slice()], { type: "video/mp4" });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

        onProgress?.("Done!", 100);
    } finally {
        ff.off("progress", onProg);
        for (const f of ["/input.mp4", "/fonts/subtitle.ttf", "/subs.srt", "/output.mp4"]) {
            try { await ff.deleteFile(f); } catch { /* ignored */ }
        }
    }
}
