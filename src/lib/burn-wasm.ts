/**
 * Client-side subtitle burning using @ffmpeg/ffmpeg (WebAssembly).
 *
 * Uses single-thread core (no SharedArrayBuffer required) → no COOP/COEP
 * headers needed → safe with Vercel and R2 presigned URLs.
 *
 * The wasm build bundles its own libass + freetype so subtitles render
 * regardless of system fonts — unlike the Lambda server environment.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// CDN base for @ffmpeg/core single-thread UMD build
const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let _ffmpegInstance: FFmpeg | null = null;
let _loadPromise: Promise<FFmpeg> | null = null;

/**
 * Returns a loaded FFmpeg instance (singleton — loaded only once per page).
 * @param onLoadProgress  Called with 0–100 while the wasm core is downloading.
 */
async function getFFmpeg(onLoadProgress?: (pct: number) => void): Promise<FFmpeg> {
    if (_ffmpegInstance) return _ffmpegInstance;

    // Deduplicate concurrent calls
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
        const ff = new FFmpeg();

        // Optionally log
        ff.on("log", ({ message }: { message: string }) => {
            if (process.env.NODE_ENV === "development") {
                console.debug("[ffmpeg-wasm]", message);
            }
        });

        onLoadProgress?.(5);

        // toBlobURL fetches the URL and returns a same-origin blob: URL so the
        // browser allows loading it as a script/wasm module.
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
        const ff = await _loadPromise;
        return ff;
    } finally {
        _loadPromise = null;
    }
}

/** Reset the cached instance (call on component unmount if needed). */
export function resetFFmpegInstance(): void {
    _ffmpegInstance = null;
    _loadPromise = null;
}

/**
 * Burns SRT subtitles into a video entirely in the browser using ffmpeg.wasm.
 *
 * Workflow:
 *  1. Download the source video via `/api/download-video` (server proxy).
 *  2. Load @ffmpeg/core wasm (cached after first call).
 *  3. Write video + SRT into the wasm virtual FS.
 *  4. Run: ffmpeg -i input.mp4 -vf subtitles=subs.srt -c:a copy output.mp4
 *  5. Trigger browser download of the resulting blob.
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
    // ── 1. Download source video ──────────────────────────────────────────────
    onProgress?.("Downloading video…", 0);
    const videoRes = await fetch(
        `/api/download-video?key=${encodeURIComponent(videoKey)}`,
    );
    if (!videoRes.ok) {
        throw new Error(`Video download failed (${videoRes.status})`);
    }
    const videoData = await videoRes.arrayBuffer();
    onProgress?.("Downloading video…", 100);

    // ── 2. Load wasm core (cached after first run) ────────────────────────────
    onProgress?.("Loading encoder…", 0);
    const ff = await getFFmpeg((pct) => onProgress?.("Loading encoder…", pct));

    // ── 3. Progress events from ffmpeg ────────────────────────────────────────
    const progressHandler = ({ progress }: { progress: number }) => {
        onProgress?.("Burning subtitles…", Math.min(99, Math.round(progress * 100)));
    };
    ff.on("progress", progressHandler);

    try {
        // ── 4. Write files to wasm virtual FS ────────────────────────────────
        onProgress?.("Burning subtitles…", 0);
        await ff.writeFile("input.mp4", new Uint8Array(videoData));
        await ff.writeFile("subs.srt", new TextEncoder().encode(srtContent));

        // ── 5. Encode ─────────────────────────────────────────────────────────
        // subtitles filter burns SRT text directly into the video pixels.
        // force_style overrides make the text legible on any background.
        // The @ffmpeg/core wasm build ships with its own libass + freetype
        // so this works without any system fonts.
        await ff.exec([
            "-i",
            "input.mp4",
            "-vf",
            "subtitles=subs.srt:force_style='FontSize=18,PrimaryColour=&H00ffffff,OutlineColour=&H00000000,Outline=2,Bold=1,BackColour=&H80000000,BorderStyle=3'",
            "-c:a",
            "copy",
            "output.mp4",
        ]);

        // ── 6. Read output & trigger download ─────────────────────────────────
        onProgress?.("Preparing download…", 99);
        const outputData = (await ff.readFile("output.mp4")) as Uint8Array;
        // Copy into a plain ArrayBuffer-backed Uint8Array so Blob() accepts it
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
        // Revoke after a tick to allow the download to start
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

        onProgress?.("Done!", 100);
    } finally {
        ff.off("progress", progressHandler);
        // Clean up wasm FS to free memory
        try { await ff.deleteFile("input.mp4"); } catch { /* ignored */ }
        try { await ff.deleteFile("subs.srt"); } catch { /* ignored */ }
        try { await ff.deleteFile("output.mp4"); } catch { /* ignored */ }
    }
}
