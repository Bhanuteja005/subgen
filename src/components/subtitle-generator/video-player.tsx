"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { SubtitlesIcon } from "lucide-react";
import { cn } from "@/utils";

export interface VideoPlayerHandle {
    seek: (time: number) => void;
    getCurrentTime: () => number;
}

interface VideoPlayerProps {
    videoUrl: string;
    vttContent: string;
    className?: string;
    /** Base font size used for subtitle overlay (relative to native video height). Default 52. */
    subtitleFontBase?: number;
    /** Caption visual style matching the 3 burn styles. */
    captionStyle?: "default" | "plain" | "outline";
    /** Vertical position of subtitle overlay: "bottom" (default) or "top". */
    subtitlePosition?: "top" | "bottom";
}

interface Cue {
    start: number;
    end: number;
    lines: string[];
}

// ─── VTT Parser ───────────────────────────────────────────────────────────────

function parseVttTime(ts: string): number {
    const parts = ts.trim().split(":");
    let h = 0, m = 0, s = 0;
    if (parts.length === 3) {
        h = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        s = parseFloat(parts[2].replace(",", "."));
    } else if (parts.length === 2) {
        m = parseInt(parts[0], 10);
        s = parseFloat(parts[1].replace(",", "."));
    }
    return h * 3600 + m * 60 + s;
}

function wrapLine(text: string, maxChars = 40): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
        if (!w) continue;
        if (cur.length === 0) { cur = w; }
        else if (cur.length + 1 + w.length <= maxChars) { cur += " " + w; }
        else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
}

function parseVtt(vtt: string): Cue[] {
    const blocks = vtt.trim().split(/\r?\n\r?\n+/);
    const cues: Cue[] = [];
    for (const block of blocks) {
        const rawLines = block.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (rawLines.length < 2) continue;
        const ti = rawLines.findIndex(l => l.includes("-->"));
        if (ti < 0) continue;
        const m = rawLines[ti].match(/(\d{1,2}:\d{2}:\d{2}[,.]?\d*)\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]?\d*)/);
        if (!m) continue;
        const rawText = rawLines.slice(ti + 1).join(" ").replace(/<[^>]+>/g, "").trim();
        if (!rawText) continue;
        const lines = rawText.split("\n").flatMap(l => wrapLine(l.trim())).filter(Boolean);
        cues.push({ start: parseVttTime(m[1]), end: parseVttTime(m[2]), lines });
    }
    return cues;
}

// ─── VideoPlayer ──────────────────────────────────────────────────────────────

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
function VideoPlayer({ videoUrl, vttContent, className, subtitleFontBase = 52, captionStyle = "default", subtitlePosition = "bottom" }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cuesRef = useRef<Cue[]>([]);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
    const subtitlesEnabledRef = useRef(true);

    // Expose imperative handle so parent can seek the video
    useImperativeHandle(ref, () => ({
        seek: (time: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
                videoRef.current.play().catch(() => {});
            }
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    }));

    useEffect(() => { cuesRef.current = parseVtt(vttContent); }, [vttContent]);

    useEffect(() => { subtitlesEnabledRef.current = subtitlesEnabled; }, [subtitlesEnabled]);

    const drawFrame = useCallback((currentTime: number) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Sync canvas size to rendered video size
        const rect = video.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width  = rect.width;
            canvas.height = rect.height;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!subtitlesEnabledRef.current) return;

        const cue = cuesRef.current.find(c => currentTime >= c.start && currentTime <= c.end);
        if (!cue || cue.lines.length === 0) return;

        // Match burnSubtitlesWasm: fontsize on native video height
        const nativeHeight = video.videoHeight || canvas.height;
        const scale = canvas.height / nativeHeight;
        const fontSize = Math.max(10, Math.round(subtitleFontBase * scale));

        ctx.font = ` ${fontSize}px Arial, sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.textAlign = "center";

        const lineHeight = fontSize * 1.25;
        const padding = Math.max(6, Math.round(10 * scale));
        const edgeOffset = Math.max(20, Math.round(80 * scale));

        // Compute block bottom position based on subtitlePosition
        const blockBottom = subtitlePosition === "top"
            ? edgeOffset + cue.lines.length * lineHeight + padding * 2
            : canvas.height - edgeOffset;

        let maxWidth = 0;
        for (const line of cue.lines) {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        }

        const totalH = cue.lines.length * lineHeight;

        if (captionStyle === "default") {
            ctx.fillStyle = "rgba(0,0,0,0.75)";
            ctx.beginPath();
            const bx = canvas.width / 2 - maxWidth / 2 - padding;
            const by = blockBottom - totalH - padding;
            ctx.roundRect(bx, by, maxWidth + padding * 2, totalH + padding * 2, 4);
            ctx.fill();
        }

        ctx.fillStyle = "white";
        if (captionStyle === "outline") {
            ctx.strokeStyle = "black";
            ctx.lineWidth = Math.max(2, Math.round(3 * scale));
            ctx.lineJoin = "round";
        }

        for (let i = 0; i < cue.lines.length; i++) {
            const y = blockBottom - (cue.lines.length - 1 - i) * lineHeight;
            if (captionStyle === "outline") ctx.strokeText(cue.lines[i], canvas.width / 2, y);
            ctx.fillText(cue.lines[i], canvas.width / 2, y);
        }
    }, [subtitleFontBase, captionStyle, subtitlePosition]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        let rafId: number;
        const onTimeUpdate = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => drawFrame(video.currentTime));
        };
        const onClear = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        };
        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("ended", onClear);
        video.addEventListener("pause", onTimeUpdate);
        return () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("ended", onClear);
            video.removeEventListener("pause", onTimeUpdate);
            cancelAnimationFrame(rafId);
        };
    }, [drawFrame]);

    useEffect(() => {
        const video = videoRef.current;
        if (video) drawFrame(video.currentTime);
    }, [subtitlesEnabled, drawFrame]);

    return (
        <div className={cn("relative rounded-xl overflow-hidden bg-black group", className)}>
            <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full h-auto max-h-[500px] object-contain"
            />

            {/* Canvas overlay — draws subtitles matching the burn style */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ maxHeight: "500px" }}
            />

            {/* Toggle button */}
            <button
                onClick={() => setSubtitlesEnabled(prev => !prev)}
                title={subtitlesEnabled ? "Hide subtitles" : "Show subtitles"}
                className={cn(
                    "absolute top-3 right-3 p-2 rounded-lg text-sm font-medium transition-all z-10",
                    "opacity-0 group-hover:opacity-100",
                    subtitlesEnabled
                        ? "bg-primary text-white"
                        : "bg-black/60 text-white/60 hover:text-white"
                )}
            >
                <SubtitlesIcon className="size-4" />
            </button>
        </div>
    );
});

VideoPlayer.displayName = "VideoPlayer";
