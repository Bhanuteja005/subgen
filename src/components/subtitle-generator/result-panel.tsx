"use client";

import { useState } from "react";
import { DownloadIcon, CheckIcon, FileTextIcon, ListIcon } from "lucide-react";
import { cn } from "@/utils";
import type { TranscriptionSegment } from "@/lib/fastrouter";

interface ResultPanelProps {
    srtContent: string;
    segments: TranscriptionSegment[];
    filename: string;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ResultPanel({ srtContent, segments, filename }: ResultPanelProps) {
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");

    const downloadSrt = () => {
        const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename.replace(/\.[^/.]+$/, "") + "_telugu_subtitles.srt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copySrt = async () => {
        try {
            await navigator.clipboard.writeText(srtContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback
        }
    };

    return (
        <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
                <div className="flex items-center gap-2">
                    <FileTextIcon className="size-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                        Telugu Subtitles — {segments.length} segment{segments.length !== 1 ? "s" : ""}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copySrt}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                            copied
                                ? "bg-green-500/20 text-green-400"
                                : "bg-foreground/10 hover:bg-foreground/15 text-foreground/70 hover:text-foreground"
                        )}
                    >
                        {copied ? (
                            <>
                                <CheckIcon className="size-3.5" />
                                Copied!
                            </>
                        ) : (
                            "Copy SRT"
                        )}
                    </button>
                    <button
                        onClick={downloadSrt}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-all"
                    >
                        <DownloadIcon className="size-3.5" />
                        Download SRT
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-foreground/10">
                <button
                    onClick={() => setActiveTab("preview")}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                        activeTab === "preview"
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                >
                    <ListIcon className="size-3.5" />
                    Preview
                </button>
                <button
                    onClick={() => setActiveTab("raw")}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                        activeTab === "raw"
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                >
                    <FileTextIcon className="size-3.5" />
                    Raw SRT
                </button>
            </div>

            {/* Content */}
            <div className="max-h-64 overflow-y-auto">
                {activeTab === "preview" ? (
                    segments.length === 0 ? (
                        <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No speech detected in the video.
                        </div>
                    ) : (
                        <div className="divide-y divide-foreground/5">
                            {segments.map((seg) => (
                                <div key={seg.id} className="flex items-start gap-3 px-4 py-2.5">
                                    <span className="text-xs text-muted-foreground/60 font-mono mt-0.5 shrink-0 w-16">
                                        {formatTime(seg.start)}
                                    </span>
                                    <p className="text-sm text-foreground/90 leading-relaxed">
                                        {seg.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <pre className="px-4 py-4 text-xs text-foreground/70 font-mono whitespace-pre-wrap leading-relaxed">
                        {srtContent}
                    </pre>
                )}
            </div>
        </div>
    );
}
