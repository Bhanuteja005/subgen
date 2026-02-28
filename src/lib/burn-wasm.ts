/**
 * Client-side subtitle burning using @ffmpeg/ffmpeg (WebAssembly).
 *
 * Uses `drawtext` filter with `textfile=` option (FreeType, built into
 * @ffmpeg/core@0.12.x).  `subtitles`/`ass` filters require libass which is
 * NOT compiled into @ffmpeg/core@0.12.x.
 *
 * Key design decisions:
 *
 * 1. textfile= instead of text='...'
 *    Putting raw subtitle text into the filter string requires multi-level
 *    escaping (backslash, single-quote, colon, percent).  Any apostrophe,
 *    comma, or colon in the text silently corrupts the option-value parser,
 *    which shifts where enable= starts, which then swallows the filter-chain
 *    separator comma into the expression evaluator → exit 1.
 *    textfile= reads text from an in-memory wasm-FS file – zero escaping.
 *
 * 2. between(t\,a\,b) for enable=
 *    With text= off the filter string, option parsing is stable.  The \,
 *    (backslash-comma) escape is the correct way to include a literal comma
 *    inside an ffmpeg option value.  step() does NOT exist in libavutil eval.
 *
 * 3. .slice() on every Uint8Array passed to writeFile()
 *    ffmpeg.wasm transfers (detaches) the underlying ArrayBuffer via
 *    postMessage.  Module-level caches (.slice() not called) would raise
 *    DataCloneError on the second call.
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

// ── FFmpeg singleton ──────────────────────────────────────────────────────────

async function loadFFmpeg(onPct?: (n: number) => void): Promise<FFmpeg> {
    if (_ff) return _ff;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const ff = new FFmpeg();
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

// ── SRT parsing ───────────────────────────────────────────────────────────────

interface Cue { start: number; end: number; text: string }

/** HH:MM:SS,mmm  or  HH:MM:SS.mmm  →  seconds */
function parseSrtTime(ts: string): number {
    const norm = ts.replace(",", ".");
    const dotIdx = norm.lastIndexOf(".");
    const hms = dotIdx >= 0 ? norm.slice(0, dotIdx) : norm;
    const frac = dotIdx >= 0 ? norm.slice(dotIdx + 1) : "0";
    const [h = 0, m = 0, s = 0] = hms.split(":").map(Number);
    return h * 3600 + m * 60 + s + Number(frac) / Math.pow(10, frac.length);
}

/**
 * Prepare cue text to be written into a wasm-FS file (textfile=).
 *
 * The text is NOT embedded in the filter string, so no ffmpeg filter escaping
 * is needed.  We only:
 *   - strip HTML tags
 *   - flatten multiline cues
 *   - strip non-ASCII (DejaVu Sans covers Latin; transliteration is ASCII)
 *   - double % (ffmpeg expands strftime/pts specifiers even in textfile values)
 */
function prepareText(raw: string): string {
    return raw
        .replace(/<[^>]+>/g, "")      // strip <i>, <b>, etc.
        .replace(/\r?\n/g, " ")       // flatten multiline
        .replace(/[^\x20-\x7E]/g, "") // strip non-ASCII
        .replace(/%/g, "%%")          // guard against strftime expansion
        .replace(/\s+/g, " ")
        .trim();
}

function parseSrt(srt: string): Cue[] {
    const blocks = srt.trim().split(/\r?\n\r?\n+/);
    const cues: Cue[] = [];

    for (const block of blocks) {
        const lines = block.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;
        const ti = lines.findIndex(l => l.includes("-->"));
        if (ti < 0) continue;
        const m = lines[ti].match(
            /(\d{1,2}:\d{2}:\d{2}[,.]\d+)\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d+)/
        );
        if (!m) continue;
        const text = prepareText(lines.slice(ti + 1).join(" "));
        if (!text) continue;
        cues.push({ start: parseSrtTime(m[1]), end: parseSrtTime(m[2]), text });
    }

    return cues;
}

// ── Filter builder ────────────────────────────────────────────────────────────

/**
 * Build the -vf filter string.
 *
 * Each segment uses textfile=cue_N.txt so the subtitle text never appears in
 * the filter string — no escaping issues whatsoever.
 *
 * enable=between(t\,start\,end) — \, is ffmpeg's option-level comma escape
 * (documented in ffmpeg-filters.html#Filtering-Guide).  between() is a real
 * libavutil eval function; step() is NOT.
 */
function buildFilter(cues: Cue[]): { vfFilter: string; cueFiles: string[] } {
    const segments: string[] = [];
    const cueFiles: string[] = [];

    for (let i = 0; i < cues.length; i++) {
        const { start, end } = cues[i];
        const fname = `cue_${i}.txt`;
        cueFiles.push(fname);

        segments.push(
            `drawtext=fontfile=font.ttf` +
            `:textfile=${fname}` +
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
    return { vfFilter: segments.join(","), cueFiles };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function burnSubtitlesWasm(
    videoKey: string,
    srtContent: string,
    outputFilename: string,
    onProgress?: (phase: string, pct: number) => void,
): Promise<void> {
    // 1. Parse SRT (pure JS – fail fast before any network/wasm work) ──────────
    const cues = parseSrt(srtContent);
    if (cues.length === 0) throw new Error("SRT has no parseable cues.");
    const { vfFilter, cueFiles } = buildFilter(cues);

    // 2. Download video + font in parallel ─────────────────────────────────────
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

    // 3. Load wasm (singleton – cached after first load) ───────────────────────
    onProgress?.("Loading encoder…", 0);
    const ff = await loadFFmpeg(n => onProgress?.("Loading encoder…", n));

    // 4. Collect log lines to surface in error messages ────────────────────────
    const logLines: string[] = [];
    const logHandler = ({ message }: { message: string }) => {
        logLines.push(message);
        console.debug("[ffmpeg-wasm]", message);
    };
    ff.on("log", logHandler);

    const onProg = ({ progress }: { progress: number }) =>
        onProgress?.("Burning subtitles…", Math.min(99, Math.round(progress * 100)));
    ff.on("progress", onProg);

    const enc = new TextEncoder();

    try {
        onProgress?.("Burning subtitles…", 0);

        // Write inputs — always slice() so cached ArrayBuffers aren't detached
        await ff.writeFile("input.mp4", new Uint8Array(videoBuf.slice(0)));
        await ff.writeFile("font.ttf", font.slice());

        // Write one text file per cue — no filter-string escaping needed
        for (let i = 0; i < cues.length; i++) {
            await ff.writeFile(`cue_${i}.txt`, enc.encode(cues[i].text));
        }

        const ret = await ff.exec([
            "-i",        "input.mp4",
            "-vf",       vfFilter,
            "-c:v",      "libx264",
            "-preset",   "ultrafast",
            "-crf",      "23",
            "-c:a",      "copy",
            "-movflags", "+faststart",
            "output.mp4",
        ]);

        if (ret !== 0) {
            const tail = logLines.slice(-25).join("\n");
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
        ff.off("log", logHandler);
        ff.off("progress", onProg);
        const toDelete = ["input.mp4", "font.ttf", "output.mp4", ...cueFiles];
        for (const f of toDelete) {
            try { await ff.deleteFile(f); } catch { /**/ }
        }
    }
}
