/**
 * Client-side subtitle burning using @ffmpeg/ffmpeg (WebAssembly).
 *
 * Uses `drawtext` filter (FreeType, built into @ffmpeg/core@0.12.x).
 * The `subtitles`/`ass` filters (libass) are NOT present in @ffmpeg/core@0.12.x.
 *
 * DataCloneError prevention:
 *   ffmpeg.wasm transfers (detaches) the ArrayBuffer behind every Uint8Array
 *   passed to writeFile. Always call .slice() before passing cached bytes.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
const FONT_URL = "/fonts/subtitle.ttf";

let _ff: FFmpeg | null = null;
let _loadPromise: Promise<FFmpeg> | null = null;
let _fontCache: Uint8Array | null = null;

// ── Font ──────────────────────────────────────────────────────────────────────

async function getFont(): Promise<Uint8Array> {
    if (_fontCache) return _fontCache;
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`Font fetch failed (${res.status})`);
    _fontCache = new Uint8Array(await res.arrayBuffer());
    return _fontCache;
}

// ── FFmpeg loader ─────────────────────────────────────────────────────────────

async function loadFFmpeg(onPct?: (n: number) => void): Promise<FFmpeg> {
    if (_ff) return _ff;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const ff = new FFmpeg();
        // no-op log handler replaced after load to collect stderr per-exec
        ff.on("log", () => { /* captured per-exec below */ });

        onPct?.(5);
        const [coreURL, wasmURL] = await Promise.all([
            toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
            toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        ]);
        onPct?.(30);
        await ff.load({ coreURL, wasmURL });
        onPct?.(100);
        _ff = ff;
        return ff;
    })();

    try {
        return await _loadPromise;
    } finally {
        _loadPromise = null;
    }
}

export function resetFFmpegInstance(): void {
    _ff = null;
    _loadPromise = null;
}

// ── SRT helpers ───────────────────────────────────────────────────────────────

/** HH:MM:SS,mmm → seconds */
function parseSrtTime(ts: string): number {
    const [hms, frac = "0"] = ts.replace(",", ".").split(".");
    const [h = 0, m = 0, s = 0] = hms.split(":").map(Number);
    return h * 3600 + m * 60 + s + Number(frac) / 1000;
}

/**
 * Sanitise text for use inside drawtext's text='...' (single-quoted).
 *
 * ffmpeg filter-graph escaping (innermost → outermost):
 *   1. Backslash:   \  →  \\
 *   2. Single quote: ' →  \'
 *   3. Colon:       :  →  \:
 *   4. Percent:     %  →  %%
 *
 * In addition we strip HTML tags and any character outside printable ASCII
 * (0x20-0x7E) because drawtext's FreeType renderer only supports the glyphs
 * present in the supplied font file (DejaVu Sans covers full Latin but not
 * Telugu script).  The transcription is transliterated English so this should
 * never drop real content.
 */
function sanitise(raw: string): string {
    return raw
        .replace(/<[^>]+>/g, "")               // strip <i>, <b> …
        .replace(/\r?\n/g, " ")                 // flatten multiline
        .replace(/[^\x20-\x7E]/g, "")           // ASCII printable only
        .replace(/\\/g, "\\\\")                 // 1. backslash
        .replace(/'/g, "\\'")                   // 2. single quote
        .replace(/:/g, "\\:")                   // 3. colon
        .replace(/%/g, "%%")                    // 4. percent
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Build the ffmpeg -vf filter string from SRT content.
 * Each cue becomes one drawtext segment gated by enable='between(t,…)'.
 */
function buildFilter(srt: string): string {
    const cues = srt.trim().split(/\r?\n\r?\n+/);
    const segments: string[] = [];

    for (const cue of cues) {
        const lines = cue.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;
        const ti = lines.findIndex(l => l.includes("-->"));
        if (ti < 0) continue;
        const m = lines[ti].match(
            /(\d{1,2}:\d{2}:\d{2}[,.]\d+)\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d+)/
        );
        if (!m) continue;

        const start = parseSrtTime(m[1]);
        const end   = parseSrtTime(m[2]);
        const text  = sanitise(lines.slice(ti + 1).join(" "));
        if (!text) continue;

        // ffmpeg filter-option escaping: \, is a literal comma inside an option
        // value; the unescaped , after the closing paren is the filter-chain
        // separator.  between(t,a,b) is available in libavutil eval; step() is
        // NOT.  Single-quoting the enable= value is unreliable in the wasm UMD
        // build, so we use \, (backslash-comma) escaping instead.
        //
        // Resulting string passed to ffmpeg (per segment):
        //   drawtext=fontfile=font.ttf:...:enable=between(t\,14.000\,18.500)
        //                                                 ^^           ^^  — literal commas
        //   then , before next drawtext= is the chain separator.
        segments.push(
            `drawtext=fontfile=font.ttf` +
            `:text='${text}'` +
            `:fontsize=16` +
            `:fontcolor=white` +
            `:box=1` +
            `:boxcolor=black@0.75` +
            `:boxborderw=6` +
            `:x=(w-text_w)/2` +
            `:y=h-text_h-50` +
            `:enable=between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`
        );
    }

    if (segments.length === 0) throw new Error("SRT has no parseable cues.");
    return segments.join(",");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function burnSubtitlesWasm(
    videoKey: string,
    srtContent: string,
    outputFilename: string,
    onProgress?: (phase: string, pct: number) => void,
): Promise<void> {
    // 1. Download video + font in parallel ─────────────────────────────────────
    onProgress?.("Downloading…", 0);
    const [videoRes, font] = await Promise.all([
        fetch(`/api/download-video?key=${encodeURIComponent(videoKey)}`),
        getFont(),
    ]);
    if (!videoRes.ok) {
        let msg = `Video download failed (${videoRes.status})`;
        try { const b = await videoRes.json(); if (b?.error) msg = b.error; } catch { /**/ }
        throw new Error(msg);
    }
    const videoBuf = await videoRes.arrayBuffer();
    onProgress?.("Downloading…", 100);

    // 2. Load wasm (singleton) ─────────────────────────────────────────────────
    onProgress?.("Loading encoder…", 0);
    const ff = await loadFFmpeg(n => onProgress?.("Loading encoder…", n));

    // 3. Build filter (pure JS — validate before touching wasm) ───────────────
    const vfFilter = buildFilter(srtContent);

    // 4. Collect log lines so we can surface the real error if exit ≠ 0 ───────
    const logLines: string[] = [];
    const logHandler = ({ message }: { message: string }) => {
        logLines.push(message);
        console.debug("[ffmpeg-wasm]", message);
    };
    ff.on("log", logHandler);

    const onProg = ({ progress }: { progress: number }) =>
        onProgress?.("Burning subtitles…", Math.min(99, Math.round(progress * 100)));
    ff.on("progress", onProg);

    try {
        onProgress?.("Burning subtitles…", 0);

        // IMPORTANT: always slice() — writeFile() transfers the ArrayBuffer
        // via postMessage, detaching the source.  Cached copies must survive.
        await ff.writeFile("input.mp4", new Uint8Array(videoBuf.slice(0)));
        await ff.writeFile("font.ttf",  font.slice());

        const ret = await ff.exec([
            "-i",      "input.mp4",
            "-vf",     vfFilter,
            "-c:v",    "libx264",
            "-preset", "ultrafast",
            "-crf",    "23",
            "-c:a",    "copy",
            "-movflags", "+faststart",
            "output.mp4",
        ]);

        if (ret !== 0) {
            // Grab last 20 log lines for diagnosis
            const tail = logLines.slice(-20).join("\n");
            throw new Error(`FFmpeg encode failed (exit ${ret}):\n${tail}`);
        }

        onProgress?.("Preparing download…", 99);
        const out = (await ff.readFile("output.mp4")) as Uint8Array;
        const blob = new Blob([out.slice()], { type: "video/mp4" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        onProgress?.("Done!", 100);
    } finally {
        ff.off("log",      logHandler);
        ff.off("progress", onProg);
        for (const f of ["input.mp4", "font.ttf", "output.mp4"]) {
            try { await ff.deleteFile(f); } catch { /**/ }
        }
    }
}
