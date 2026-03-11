"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { SubtitlesIcon, Maximize2Icon } from "lucide-react";
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
    /**
     * Vertical position as a percentage (0 = very top, 100 = very bottom).
     * When provided, overrides subtitlePosition. Default 88.
     */
    subtitleYPercent?: number;
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

function wrapLine(text: string, maxChars = 28): string[] {
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
function VideoPlayer({ videoUrl, vttContent, className, subtitleFontBase = 52, captionStyle = "default", subtitlePosition = "bottom", subtitleYPercent }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
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

    // Resolve the Y position (as fraction 0..1) from the two possible prop sources
    // subtitleYPercent takes priority over subtitlePosition
    // "top" uses 0.20 so multi-line subtitles never clip off the top edge
    const resolvedYFraction = subtitleYPercent != null
        ? subtitleYPercent / 100
        : subtitlePosition === "top" ? 0.20 : 0.88;

    const drawFrame = useCallback((currentTime: number) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Sync canvas to the RENDERED video rect inside the container.
        // In fullscreen the container fills the screen so this rect is correct.
        const rect = video.getBoundingClientRect();
        if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
            canvas.width  = Math.round(rect.width);
            canvas.height = Math.round(rect.height);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!subtitlesEnabledRef.current) return;

        const cue = cuesRef.current.find(c => currentTime >= c.start && currentTime <= c.end);
        if (!cue || cue.lines.length === 0) return;

        // Font size: 3% of rendered canvas height, clamped 13–34px.
        // Intentionally slightly smaller than the burn formula so preview
        // text doesn't dominate the player UI on larger screens.
        const fontSize = Math.min(34, Math.max(13, Math.round(canvas.height * 0.030)));

        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.textAlign = "center";

        // Dynamically re-wrap any line that exceeds 88% of canvas width at the
        // current font size — prevents overflow on small/mobile screens.
        const maxLineWidth = canvas.width * 0.88;
        const fittedLines: string[] = [];
        for (const rawLine of cue.lines) {
            if (ctx.measureText(rawLine).width <= maxLineWidth) {
                fittedLines.push(rawLine);
            } else {
                const words = rawLine.split(" ");
                let cur = "";
                for (const w of words) {
                    const test = cur ? `${cur} ${w}` : w;
                    if (ctx.measureText(test).width <= maxLineWidth) {
                        cur = test;
                    } else {
                        if (cur) fittedLines.push(cur);
                        cur = w;
                    }
                }
                if (cur) fittedLines.push(cur);
            }
        }
        const lines = fittedLines.length > 0 ? fittedLines : cue.lines;

        const lineHeight = fontSize * 1.3;
        const padding = Math.max(8, Math.round(fontSize * 0.4));
        const totalH = lines.length * lineHeight;

        // blockBottom = bottom edge of last text line.
        // Clamped so text never overflows top or bottom of canvas.
        const rawBottom = canvas.height * resolvedYFraction;
        const blockBottom = Math.min(
            canvas.height - padding,
            Math.max(totalH + padding * 2, rawBottom)
        );

        let maxWidth = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        }

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
            ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.1));
            ctx.lineJoin = "round";
        }

        for (let i = 0; i < lines.length; i++) {
            const y = blockBottom - (lines.length - 1 - i) * lineHeight;
            if (captionStyle === "outline") ctx.strokeText(lines[i], canvas.width / 2, y);
            ctx.fillText(lines[i], canvas.width / 2, y);
        }
    }, [captionStyle, resolvedYFraction]);

    // Redraw on timeupdate / end / pause
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

    // Redraw when subtitles toggled or props change
    useEffect(() => {
        const video = videoRef.current;
        if (video) drawFrame(video.currentTime);
    }, [subtitlesEnabled, drawFrame]);

    // ResizeObserver: re-sync canvas on any container resize (fullscreen, window resize)
    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const ro = new ResizeObserver(() => {
            // Force canvas size reset then redraw
            canvas.width = 0;
            canvas.height = 0;
            drawFrame(video.currentTime);
        });
        ro.observe(video);
        return () => ro.disconnect();
    }, [drawFrame]);

    // Intercept native video fullscreen and redirect it to our container
    // so the canvas overlay stays visible in fullscreen mode.
    useEffect(() => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        const onFsChange = () => {
            if (document.fullscreenElement === video) {
                // Browser fullscreened the raw video — swap to container
                document.exitFullscreen().then(() => {
                    container.requestFullscreen().catch(() => {});
                }).catch(() => {});
            }
        };

        document.addEventListener("fullscreenchange", onFsChange);
        document.addEventListener("webkitfullscreenchange", onFsChange);
        return () => {
            document.removeEventListener("fullscreenchange", onFsChange);
            document.removeEventListener("webkitfullscreenchange", onFsChange);
        };
    }, []);

    const enterFullscreen = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        if (container.requestFullscreen) container.requestFullscreen().catch(() => {});
    }, []);

    return (
        <div ref={containerRef} className={cn("relative rounded-xl overflow-hidden bg-black group", className)}>
            <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full h-full max-h-[80vh] object-contain"
            />

            {/* Canvas overlay — draws subtitles; sits above video, below controls */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ maxHeight: "80vh" }}
            />

            {/* Container-level fullscreen button (keeps canvas visible) */}
            <button
                onClick={enterFullscreen}
                title="Fullscreen (with subtitles)"
                className={cn(
                    "absolute bottom-14 right-3 p-2 rounded-lg text-sm font-medium transition-all z-10",
                    "opacity-0 group-hover:opacity-100",
                    "bg-black/60 text-white/70 hover:text-white"
                )}
            >
                <Maximize2Icon className="size-4" />
            </button>

            {/* Subtitle toggle button */}
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
