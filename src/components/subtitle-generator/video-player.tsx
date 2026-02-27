"use client";

import { useEffect, useRef, useState } from "react";
import { SubtitlesIcon } from "lucide-react";
import { cn } from "@/utils";

interface VideoPlayerProps {
    videoUrl: string;
    vttContent: string;
    className?: string;
}

export function VideoPlayer({ videoUrl, vttContent, className }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [vttUrl, setVttUrl] = useState<string | null>(null);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);

    // Create a blob URL from the VTT content for the <track> element
    useEffect(() => {
        const blob = new Blob([vttContent], { type: "text/vtt" });
        const url = URL.createObjectURL(blob);
        setVttUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [vttContent]);

    // Toggle subtitle track visibility
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const tracks = video.textTracks;
        for (let i = 0; i < tracks.length; i++) {
            tracks[i].mode = subtitlesEnabled ? "showing" : "hidden";
        }
    }, [subtitlesEnabled, vttUrl]);

    return (
        <div className={cn("relative rounded-xl overflow-hidden bg-black group", className)}>
            <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full h-auto max-h-[500px] object-contain"
                crossOrigin="anonymous"
            >
                {vttUrl && (
                    <track
                        key={vttUrl}
                        kind="subtitles"
                        src={vttUrl}
                        srcLang="te"
                        label="Telugu (Transliterated)"
                        default
                    />
                )}
            </video>

            {/* Subtitle toggle button */}
            <button
                onClick={() => setSubtitlesEnabled((prev) => !prev)}
                title={subtitlesEnabled ? "Hide subtitles" : "Show subtitles"}
                className={cn(
                    "absolute top-3 right-3 p-2 rounded-lg text-sm font-medium transition-all",
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
}
