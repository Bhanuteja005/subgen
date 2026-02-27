"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRightIcon, RotateCcwIcon, InfoIcon } from "lucide-react";
import { cn } from "@/utils";
import { UploadZone } from "@/components/subtitle-generator/upload-zone";
import { VideoPlayer } from "@/components/subtitle-generator/video-player";
import { ResultPanel } from "@/components/subtitle-generator/result-panel";
import {
    ProcessingStatus,
    type ProcessingStep,
} from "@/components/subtitle-generator/processing-status";
import type { TranscriptionSegment } from "@/lib/fastrouter";

interface ProcessResult {
    videoUrl: string;
    srtContent: string;
    vttContent: string;
    segments: TranscriptionSegment[];
    key: string;
}

type AppState = "idle" | "ready" | "processing" | "done" | "error";

export default function SubtitleGeneratorPage() {
    const [appState, setAppState] = useState<AppState>("idle");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [result, setResult] = useState<ProcessResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [videoKey, setVideoKey] = useState<string | null>(null);

    // Auto-delete video from R2 after 5 minutes
    useEffect(() => {
        if (!videoKey) return;

        const timer = setTimeout(async () => {
            try {
                await fetch("/api/delete", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: videoKey }),
                });
            } catch {
                // Ignore auto-cleanup errors
            }
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearTimeout(timer);
    }, [videoKey]);

    const handleFileSelected = useCallback((file: File) => {
        setSelectedFile(file);
        setAppState("ready");
        setError(null);
        setResult(null);
    }, []);

    const handleProcess = useCallback(async () => {
        if (!selectedFile) return;

        setAppState("processing");
        setError(null);
        setProcessingStep("uploading");
        setUploadProgress(0);

        try {
            // Step 1: Get pre-signed upload URL from our API
            const presignRes = await fetch("/api/presigned-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: selectedFile.name,
                    contentType: selectedFile.type || "video/mp4",
                }),
            });

            if (!presignRes.ok) {
                const data = await presignRes.json();
                throw new Error(data.error ?? "Failed to get upload URL");
            }

            const { uploadUrl, key } = await presignRes.json();
            setVideoKey(key);

            // Step 2: Upload directly to R2 using XHR (for progress tracking)
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("PUT", uploadUrl, true);
                xhr.setRequestHeader("Content-Type", selectedFile.type || "video/mp4");

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        setUploadProgress((e.loaded / e.total) * 100);
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setUploadProgress(100);
                        resolve();
                    } else {
                        reject(new Error(`Upload failed with status ${xhr.status}`));
                    }
                };

                xhr.onerror = () => reject(new Error("Network error during upload"));
                xhr.send(selectedFile);
            });

            // Step 3: Trigger AI processing on the server
            setProcessingStep("processing");

            const processRes = await fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key }),
            });

            setProcessingStep("transcribing");

            if (!processRes.ok) {
                const data = await processRes.json();
                throw new Error(data.error ?? "Processing failed");
            }

            const data = await processRes.json();
            setProcessingStep("done");

            setResult({
                videoUrl: data.videoUrl,
                srtContent: data.srtContent,
                vttContent: data.vttContent,
                segments: data.segments,
                key: data.key,
            });

            setAppState("done");
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unexpected error occurred";
            setError(message);
            setAppState("error");
            setProcessingStep(null);
        }
    }, [selectedFile]);

    const handleReset = useCallback(() => {
        setAppState("idle");
        setSelectedFile(null);
        setResult(null);
        setError(null);
        setProcessingStep(null);
        setUploadProgress(0);
        setVideoKey(null);
    }, []);

    const isProcessing = appState === "processing";

    return (
        <div className="min-h-dvh w-full bg-background text-foreground">
            {/* Background glow */}
            <div className="fixed inset-0 pointer-events-none -z-10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/8 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-primary/5 rounded-full blur-[100px]" />
            </div>

            <div className="max-w-5xl mx-auto px-4 py-16 lg:py-24">

                {/* ── Header ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-12"
                >
                    <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6",
                        "border border-primary/20 bg-primary/5 text-primary text-xs font-medium"
                    )}>
                        <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                        AI-Powered · Telugu Speech Recognition
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                        Telugu{" "}
                        <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                            Subtitle
                        </span>{" "}
                        Generator
                    </h1>

                    <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        Upload a video with Telugu speech and receive phonetically{" "}
                        <span className="text-foreground/80 font-medium">transliterated</span>{" "}
                        subtitle files with frame-accurate timestamps — export-ready in SRT and VTT format.
                    </p>

                    {/* Transliteration explainer */}
                    <div className={cn(
                        "inline-flex items-start gap-2.5 mt-6 px-4 py-3 rounded-xl text-left",
                        "border border-foreground/10 bg-foreground/[0.04] text-sm text-muted-foreground max-w-lg"
                    )}>
                        <InfoIcon className="size-4 text-primary shrink-0 mt-0.5" />
                        <span>
                            <strong className="text-foreground">Transliteration</strong> converts Telugu script to phonetic English letters —
                            preserving the original sounds without altering the meaning or translating the content.
                        </span>
                    </div>
                </motion.div>

                {/* ── Main card ── */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                    className={cn(
                        "rounded-2xl border border-foreground/10 bg-foreground/[0.03]",
                        "backdrop-blur-sm overflow-hidden"
                    )}
                >
                    <AnimatePresence mode="wait">
                        {(appState === "idle" || appState === "ready") && (
                            <motion.div
                                key="upload"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="p-8 lg:p-10"
                            >
                                <UploadZone
                                    onFileSelected={handleFileSelected}
                                    disabled={isProcessing}
                                />

                                <AnimatePresence>
                                    {appState === "ready" && selectedFile && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            transition={{ duration: 0.25 }}
                                            className="mt-6 flex justify-center"
                                        >
                                            <button
                                                onClick={handleProcess}
                                                disabled={isProcessing}
                                                className={cn(
                                                    "flex items-center gap-2.5 px-8 py-3.5 rounded-xl",
                                                    "bg-primary text-white font-semibold text-sm",
                                                    "hover:bg-primary/90 active:scale-[0.98] transition-all",
                                                    "shadow-[0_0_30px_rgba(0,85,255,0.3)]",
                                                    "disabled:opacity-60 disabled:cursor-not-allowed"
                                                )}
                                            >
                                                Generate Subtitles
                                                <ArrowRightIcon className="size-4" />
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}

                        {appState === "processing" && (
                            <motion.div
                                key="processing"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="p-8 lg:p-10"
                            >
                                <div className="max-w-sm mx-auto">
                                    <h2 className="text-base font-semibold text-foreground mb-6">
                                        Processing your video…
                                    </h2>
                                    <ProcessingStatus
                                        step={processingStep}
                                        uploadProgress={uploadProgress}
                                    />
                                    <p className="mt-6 text-xs text-muted-foreground/60">
                                        This may take a minute depending on video length.
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {appState === "error" && (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="p-8 lg:p-10 text-center"
                            >
                                <div className="max-w-sm mx-auto">
                                    <div className="text-3xl mb-4">⚠️</div>
                                    <h2 className="text-base font-semibold text-foreground mb-2">
                                        Something went wrong
                                    </h2>
                                    <p className="text-sm text-muted-foreground mb-6">
                                        {error}
                                    </p>
                                    <button
                                        onClick={handleReset}
                                        className="flex items-center gap-2 mx-auto px-6 py-2.5 rounded-lg bg-foreground/10 hover:bg-foreground/15 text-sm font-medium transition-colors"
                                    >
                                        <RotateCcwIcon className="size-4" />
                                        Try again
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {appState === "done" && result && (
                            <motion.div
                                key="done"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                                className="p-8 lg:p-10 space-y-6"
                            >
                                <VideoPlayer
                                    videoUrl={result.videoUrl}
                                    vttContent={result.vttContent}
                                    className="w-full"
                                />

                                <ResultPanel
                                    srtContent={result.srtContent}
                                    segments={result.segments}
                                    filename={selectedFile?.name ?? "video"}
                                />

                                <div className="flex items-center justify-between pt-2">
                                    <p className="text-xs text-muted-foreground/50 flex items-center gap-1.5">
                                        <InfoIcon className="size-3.5" />
                                        Video will be auto-deleted from storage in 5 minutes.
                                    </p>
                                    <button
                                        onClick={handleReset}
                                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <RotateCcwIcon className="size-3.5" />
                                        Process another video
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* ── How it works ── */}
                {appState === "idle" && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.35 }}
                        className="mt-10 grid grid-cols-3 gap-4 text-center"
                    >
                        {[
                            { step: "1", title: "Upload", desc: "Drag & drop your Telugu video" },
                            { step: "2", title: "AI Analysis", desc: "Our AI detects & transcribes speech" },
                            { step: "3", title: "Download SRT", desc: "Get transliterated subtitle file" },
                        ].map((item) => (
                            <div
                                key={item.step}
                                className="flex flex-col items-center gap-2 px-4 py-4 rounded-xl border border-foreground/5 bg-foreground/[0.02]"
                            >
                                <div className="text-xs font-bold text-primary/60 bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center">
                                    {item.step}
                                </div>
                                <p className="text-sm font-medium text-foreground">{item.title}</p>
                                <p className="text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                        ))}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
