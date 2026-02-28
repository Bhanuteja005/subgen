/**
 * Client-side subtitle burning using @ffmpeg/ffmpeg (WebAssembly).
 *
 * Rendering approach: `drawtext` filter (FreeType, bundled in @ffmpeg/core).
 *
 * Why NOT `subtitles=` (libass):
 *   @ffmpeg/core@0.12.x does NOT include libass, so the `subtitles` filter
 *   silently re-encodes the video with no text rendered at all.
 *
 * Why drawtext works:
 *   FreeType IS compiled into @ffmpeg/core. We supply an explicit TTF file
 *   via fontfile= pointing at the wasm virtual FS — no fontconfig needed.
 *
 * DataCloneError fix:
 *   ffmpeg.wasm transfers (detaches) Uint8Array buffers via postMessage when
 *   writing to the virtual FS. The module-level font cache must never hand the
 *   SAME buffer to writeFile twice — we always pass `.slice()` copies.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
const FONT_URL = "/fonts/subtitle.ttf";

// ── Module-level caches ────────────────────────────────────────────────────────

let _ffmpegInstance: FFmpeg | null = null;
let _loadPromise: Promise<FFmpeg> | null = null;
/** Cached font bytes — NEVER passed directly to writeFile; always .slice() first. */
let _fontCache: Uint8Array | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getFontBytes(): Promise<Uint8Array> {
    if (_fontCache) return _fontCache;
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`Failed to load subtitle font (${res.status})`);
    _fontCache = new Uint8Array(await res.arrayBuffer());
    return _fontCache;
}

/**
 * Escape text for ffmpeg drawtext `text='...'` (single-quoted filter value).
 *   \  →  \\     '  →  \'     :  →  \:     %  →  %%
 */
function escapeDrawtext(raw: string): string {
    return raw
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/:/g, "\\:")
        .replace(/%/g, "%%")
        .replace(/<[^>]+>/g, "")    // strip HTML tags
        .replace(/\r?\n/g, " ")     // flatten multi-line cues
        .replace(/\s+/g, " ")
        .trim();
}

/** Parse SRT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm) → seconds */
function parseSrtTime(ts: string): number {
    const [hms, frac = "0"] = ts.trim().replace(",", ".").split(".");
    const [h = 0, m = 0, s = 0] = hms.split(":").map(Number);
    return h * 3600 + m * 60 + s + Number(frac) / Math.pow(10, frac.length);
}

/**
 * Convert SRT text → ffmpeg -vf filter string.
 * One drawtext segment per cue, gated by enable='between(t,start,end)'.
 * Style: 16px white text, semi-transparent black box, 50px above bottom.
 */
function buildVfFilter(srt: string): string {
    const blocks = srt.trim().split(/\r?\n\r?\n+/);
    const parts: string[] = [];

    for (const block of blocks) {
        const lines = block.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;
        const tIdx = lines.findIndex(l => l.includes("-->"));
        if (tIdx < 0) continue;
        const m = lines[tIdx].match(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/);
        if (!m) continue;
        const start = parseSrtTime(m[1]);
        const end = parseSrtTime(m[2]);
        const text = escapeDrawtext(lines.slice(tIdx + 1).join(" "));
        if (!text) continue;

        parts.push(
            `drawtext=fontfile='/font.ttf'` +
            `:text='${text}'` +
            `:fontsize=16` +
            `:fontcolor=white` +
            `:box=1` +
            `:boxcolor=black@0.75` +
            `:boxborderw=6` +
            `:x=(w-text_w)/2` +
            `:y=h-text_h-50` +
            `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`
        );
    }

    if (parts.length === 0) throw new Error("No subtitle cues found in SRT.");
    return parts.join(",");
}

// ── FFmpeg singleton ───────────────────────────────────────────────────────────

async function getFFmpeg(onProgress?: (pct: number) => void): Promise<FFmpeg> {
    if (_ffmpegInstance) return _ffmpegInstance;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const ff = new FFmpeg();
        ff.on("log", ({ message }: { message: string }) =>
            console.debug("[ffmpeg-wasm]", message)
        );
        onProgress?.(5);
        const [coreURL, wasmURL] = await Promise.all([
            toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
            toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        ]);
        onProgress?.(30);
        await ff.load({ coreURL, wasmURL });
        onProgress?.(100);
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

export async function burnSubtitlesWasm(
    videoKey: string,
    srtContent: string,
    outputFilename: string,
    onProgress?: (phase: string, pct: number) => void,
): Promise<void> {
    // 1. Download video + font in parallel ─────────────────────────────────────
    onProgress?.("Downloading…", 0);
    const [videoRes, fontBytes] = await Promise.all([
        fetch(`/api/download-video?key=${encodeURIComponent(videoKey)}`),
        getFontBytes(),
    ]);
    if (!videoRes.ok) {
        let msg = `Video download failed (${videoRes.status})`;
        try { const b = await videoRes.json(); if (b?.error) msg = b.error; } catch { /**/ }
        throw new Error(msg);
    }
    const videoBuffer = await videoRes.arrayBuffer();
    onProgress?.("Downloading…", 100);

    // 2. Load wasm core (singleton, cached after first call) ───────────────────
    onProgress?.("Loading encoder…", 0);
    const ff = await getFFmpeg(pct => onProgress?.("Loading encoder…", pct));

    // 3. Build -vf filter string (pure JS) ─────────────────────────────────────
    const vfFilter = buildVfFilter(srtContent);

    const onProg = ({ progress }: { progress: number }) =>
        onProgress?.("Burning subtitles…", Math.min(99, Math.round(progress * 100)));
    ff.on("progress", onProg);

    try {
        onProgress?.("Burning subtitles…", 0);

        // CRITICAL: pass .slice() copies — ffmpeg.wasm detaches the source
        // ArrayBuffer via postMessage transfer. Without slicing, the cached
        // _fontCache buffer becomes detached → DataCloneError on second call.
        await ff.writeFile("/input.mp4", new Uint8Array(videoBuffer.slice(0)));
        await ff.writeFile("/font.ttf", fontBytes.slice());

        // drawtext requires video re-encoding (-c:v libx264).
        // Stream-copying video (-c:v copy) while applying a video filter is invalid.
        const ret = await ff.exec([
            "-i", "/input.mp4",
            "-vf", vfFilter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", "copy",
            "-movflags", "+faststart",
            "/output.mp4",
        ]);

        if (ret !== 0) throw new Error(`FFmpeg encode failed (exit ${ret})`);

        onProgress?.("Preparing download…", 99);
        const outData = (await ff.readFile("/output.mp4")) as Uint8Array;
        // slice() yields a plain ArrayBuffer — required for Blob constructor
        const blob = new Blob([outData.slice()], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        onProgress?.("Done!", 100);
    } finally {
        ff.off("progress", onProg);
        for (const f of ["/input.mp4", "/font.ttf", "/output.mp4"]) {
            try { await ff.deleteFile(f); } catch { /**/ }
        }
    }
}
