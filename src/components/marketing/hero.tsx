"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import Wrapper from '../global/wrapper';
import { Button } from '../ui/button';
import { ArrowRightIcon, Loader2Icon, CheckCircle2Icon, DownloadIcon, RotateCcwIcon, FileVideoIcon, XCircleIcon, PlayCircleIcon, UploadCloudIcon } from 'lucide-react';
import { motion, useMotionValue, AnimatePresence } from 'motion/react';
import { cn } from '@/utils';
import Balancer from 'react-wrap-balancer';
import Container from "../global/container";
import type { TranscriptionSegment } from '@/lib/fastrouter';

// ─── Floating badges ──────────────────────────────────────────────────────────

const badges = [
    { text: "Upload Video", top: "15%", left: "5%" },
    { text: "Telugu AI Speech", top: "25%", right: "8%" },
    { text: "Transliteration", top: "60%", left: "10%" },
    { text: "Download SRT", top: "70%", right: "18%" },
];

const FloatingBadge = ({ text, top, left, right, index }: { text: string; top: string; left?: string; right?: string; index: number }) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
            transition={{
                opacity: { delay: index * 0.2, duration: 0.5 },
                scale: { delay: index * 0.2, duration: 0.5 },
                y: { duration: 3 + index, repeat: Infinity, ease: "easeInOut" }
            }}
            style={{ x, y, top, left, right }}
            className="absolute hidden lg:block z-30"
        >
            <div className="px-3 py-1 rounded-lg border border-foreground/5 backdrop-blur-md">
                <span className="text-base font-handwriting text-foreground/80 whitespace-nowrap select-none">
                    {text}
                </span>
            </div>
        </motion.div>
    );
};

// ─── Processing step indicator ────────────────────────────────────────────────

type ProcessingStep = "uploading" | "processing" | "transcribing" | "done" | null;

const STEPS: { key: ProcessingStep; label: string }[] = [
    { key: "uploading", label: "Uploading video…" },
    { key: "processing", label: "Extracting audio…" },
    { key: "transcribing", label: "Generating subtitles…" },
    { key: "done", label: "Complete!" },
];

// ─── SRT download helper ──────────────────────────────────────────────────────

function downloadSrt(srtContent: string, filename: string) {
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/\.[^/.]+$/, "") + "_telugu_subtitles.srt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function downloadVideo(videoUrl: string, filename: string) {
    try {
        const res = await fetch(videoUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch {
        // fallback: open in new tab
        window.open(videoUrl, "_blank");
    }
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

const Hero = () => {
    const badge = "Telugu Subtitle AI";
    const description = "Upload any video and get accurate, timestamped English subtitles in seconds —  Download SRT files ready for YouTube, Premiere Pro, and every major video platform.";

    // State
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [appState, setAppState] = useState<"idle" | "ready" | "processing" | "done" | "error">("idle");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [videoKey, setVideoKey] = useState<string | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [vttUrl, setVttUrl] = useState<string | null>(null);
    const [srtContent, setSrtContent] = useState<string>("");
    const [teluguSrtContent, setTeluguSrtContent] = useState<string>("");
    const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
    const [activeSubtitle, setActiveSubtitle] = useState<string>("");
    const [error, setError] = useState<string | null>(null);

    // Auto-delete from R2 after 5 min
    useEffect(() => {
        if (!videoKey) return;
        const t = setTimeout(async () => {
            try { await fetch("/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: videoKey }) }); } catch { /* noop */ }
        }, 5 * 60 * 1000);
        return () => clearTimeout(t);
    }, [videoKey]);

    // Build VTT blob URL whenever segments arrive
    useEffect(() => {
        if (!vttUrl) return;
        return () => { URL.revokeObjectURL(vttUrl); };
    }, [vttUrl]);

    const validateFile = useCallback((file: File) => {
        if (file.size > 500 * 1024 * 1024) { setError("File exceeds 500 MB limit."); return false; }
        return true;
    }, []);

    const handleFileChosen = useCallback((file: File) => {
        if (!validateFile(file)) return;
        setSelectedFile(file);
        setAppState("ready");
        setError(null);
        setVideoKey(null);
        setVideoUrl(null);
        setVttUrl(null);
        setSrtContent("");
        setSegments([]);
    }, [validateFile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (f) handleFileChosen(f);
    };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const f = e.dataTransfer.files?.[0]; if (f) handleFileChosen(f);
    };

    const handleProcess = useCallback(async () => {
        if (!selectedFile) return;
        setAppState("processing"); setError(null);
        setProcessingStep("uploading"); setUploadProgress(0);

        try {
            // 1. Upload to server — stream raw binary body to avoid FormData 413 limits
            const res = await fetch("/api/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "X-File-Name": encodeURIComponent(selectedFile.name),
                    "X-File-Type": selectedFile.type || "video/mp4",
                    "X-File-Size": String(selectedFile.size),
                },
                body: selectedFile,
                // @ts-expect-error — duplex is required for streaming request bodies
                duplex: "half",
            });
            if (!res.ok) {
                let errMsg = "Upload failed";
                try { errMsg = (await res.json()).error ?? errMsg; } catch { errMsg = `Upload failed (${res.status})`; }
                throw new Error(errMsg);
            }
            const { key } = await res.json();
            setVideoKey(key);
            setUploadProgress(100);

            // 2. Process on server
            setProcessingStep("processing");
            const pRes = await fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key }),
            });
            setProcessingStep("transcribing");
            if (!pRes.ok) {
                let errMsg = "Processing failed";
                try { errMsg = (await pRes.json()).error ?? errMsg; } catch { errMsg = `Processing failed (${pRes.status})`; }
                throw new Error(errMsg);
            }
            const data = await pRes.json();

            // 3. Build VTT blob
            const vttBlob = new Blob([data.vttContent], { type: "text/vtt" });
            setVttUrl(URL.createObjectURL(vttBlob));
            setVideoUrl(data.videoUrl);
            setSrtContent(data.srtContent);
            setTeluguSrtContent(data.teluguSrtContent ?? "");
            setSegments(data.segments);
            setProcessingStep("done");
            setAppState("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setAppState("error");
            setProcessingStep(null);
        }
    }, [selectedFile]);

    const handleTimeUpdate = useCallback(() => {
        const t = videoRef.current?.currentTime ?? 0;
        const active = segments.find(s => t >= s.start && t <= s.end);
        setActiveSubtitle(active?.text ?? "");
    }, [segments]);

    const handleReset = useCallback(() => {
        setAppState("idle"); setSelectedFile(null); setError(null);
        setProcessingStep(null); setUploadProgress(0);
        setVideoKey(null); setVideoUrl(null); setVttUrl(null);
        setSrtContent(""); setTeluguSrtContent(""); setSegments([]);
        setActiveSubtitle("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const stepIndex = (s: ProcessingStep) => STEPS.findIndex(x => x.key === s);
    const currentStepIndex = stepIndex(processingStep);

    return (
        <section id="upload" className="relative w-full flex items-center justify-center pt-16 lg:pt-32 pb-4 overflow-hidden">
            <Wrapper className="relative z-10">
                <div className="flex flex-col items-center text-center">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className={cn(
                            "flex items-center justify-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full",
                            "badge-glow backdrop-blur-md"
                        )}
                    >
                        <span className={cn("px-2 py-0.5 text-xs font-semibold rounded-full", "bg-foreground text-background")}>
                            New
                        </span>
                        <Container words={true} className="w-min flex text-sm text-foreground/80">
                            {badge.split(" ").map((word, index) => (
                                <span className="w-min" key={index}>{word}&nbsp;</span>
                            ))}
                        </Container>
                    </motion.div>

                    {/* Heading */}
                    <h1 className="text-4xl md:text-6xl font-semibold tracking-tight font-heading mt-8">
                        <Balancer>
                            {"Telugu Speech to".split(" ").map((word, index) => (
                                <motion.span
                                    initial={{ filter: "blur(10px)", opacity: 0, y: 10 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: index * 0.05 }}
                                    className="inline-block"
                                    key={index}
                                >
                                    {word}&nbsp;
                                </motion.span>
                            ))}
                            <br />
                            {"English Subtitles".split(" ").map((word, index) => (
                                <motion.span
                                    initial={{ filter: "blur(10px)", opacity: 0, y: 10 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: (4 + index) * 0.05 }}
                                    className={cn(
                                        "inline-block",
                                        word === "English" && "bg-linear-to-r from-primary via-blue-500 to-primary bg-size-[200%_100%] animate-[shimmer_3s_ease-in-out_infinite] text-transparent bg-clip-text"
                                    )}
                                    key={index}
                                >
                                    {word}&nbsp;
                                </motion.span>
                            ))}
                        </Balancer>
                    </h1>

                    {/* Description */}
                    <p className="text-base md:text-lg text-foreground/70 mt-6 max-w-2xl">
                        <Balancer>
                            {description.split(" ").map((word, index) => (
                                <motion.span
                                    initial={{ filter: "blur(10px)", opacity: 0, y: 5 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.3 + index * 0.02 }}
                                    className="inline-block"
                                    key={index}
                                >
                                    {word}&nbsp;
                                </motion.span>
                            ))}
                        </Balancer>
                    </p>

                    {/* Buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                        className={cn("flex items-center gap-4 flex-wrap justify-center mt-8")}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            className="sr-only"
                            onChange={handleInputChange}
                        />
                        <Button
                            size="lg"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={appState === "processing"}
                        >
                            {appState === "processing" ? (
                                <><Loader2Icon className="size-4 animate-spin mr-2" />Processing…</>
                            ) : (
                                <><UploadCloudIcon className="size-4 mr-2" />Upload Video</>
                            )}
                        </Button>
                        {appState === "done" ? (
                            <Button size="lg" variant="outline" onClick={handleReset}>
                                <RotateCcwIcon className="size-4 mr-2" />New Video
                            </Button>
                        ) : (
                            <Button size="lg" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={appState === "processing"}>
                                <ArrowRightIcon className="size-4 mr-2" />Get Started
                            </Button>
                        )}
                    </motion.div>
                </div>

                {/* ── Dashboard frame ── */}
                <motion.div
                    initial={{ opacity: 0, filter: "blur(20px)", y: 30 }}
                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                    transition={{ duration: 1, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("mt-10 lg:mt-20 relative")}
                >
                    <div className="relative mx-auto max-w-6xl rounded-2xl md:rounded-[32px] border border-foreground/10 bg-foreground/5 backdrop-blur-lg p-2">
                        <div className="absolute top-1/4 left-1/2 -z-10 w-4/5 h-1/3 -translate-x-1/2 -translate-y-1/2 bg-primary/20 blur-[10rem] opacity-50" />

                        <div
                            className={cn(
                                "rounded-lg md:rounded-[24px] border border-foreground/10 bg-background overflow-hidden",
                                "min-h-[300px] lg:min-h-[480px] flex flex-col"
                            )}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <AnimatePresence mode="wait">

                                {/* ── IDLE: drop zone ── */}
                                {(appState === "idle" || appState === "ready") && (
                                    <motion.div
                                        key="idle"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="flex-1 flex flex-col items-center justify-center gap-6 p-8 lg:p-16"
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <div className={cn(
                                            "w-full max-w-lg flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed py-14 transition-all duration-200",
                                            isDragging ? "border-primary bg-primary/10 scale-105" : "border-foreground/15 hover:border-primary/40",
                                            selectedFile ? "border-primary/40 bg-primary/5" : ""
                                        )}>
                                            {selectedFile ? (
                                                <>
                                                    <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                                                        <UploadCloudIcon className="size-10 text-primary" />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to process</p>
                                                    </div>
                                                    <Button
                                                        size="lg"
                                                        onClick={(e) => { e.stopPropagation(); handleProcess(); }}
                                                    >
                                                        Generate Subtitles
                                                        <ArrowRightIcon className="size-4 ml-2" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className={cn(
                                                        "p-5 rounded-2xl border transition-colors",
                                                        isDragging ? "border-primary/40 bg-primary/10" : "border-foreground/10 bg-foreground/5"
                                                    )}>
                                                        <UploadCloudIcon className={cn("size-12", isDragging ? "text-primary" : "text-muted-foreground/50")} />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-base font-medium text-foreground">
                                                            {isDragging ? "Drop your video here" : "Drop your video here"}
                                                        </p>
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            or <span className="text-primary font-medium">click to browse</span>
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground/50">MP4 · MOV · AVI · WebM · up to 500 MB</p>
                                                </>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── PROCESSING ── */}
                                {appState === "processing" && (
                                    <motion.div
                                        key="processing"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="flex-1 flex flex-col items-center justify-center gap-8 p-8 lg:p-16"
                                    >
                                        <div className="w-full max-w-sm space-y-5">
                                            <p className="text-sm font-semibold text-foreground mb-6">Processing your video…</p>
                                            {STEPS.map((s, i) => {
                                                const isCurrent = s.key === processingStep;
                                                const isDoneStep = i < currentStepIndex || processingStep === "done";
                                                const isPending = i > currentStepIndex;
                                                return (
                                                    <div key={s.key} className="flex items-center gap-3">
                                                        <div className={cn("shrink-0 size-5", isDoneStep ? "text-primary" : isCurrent ? "text-primary" : "text-muted-foreground/30")}>
                                                            {isDoneStep && i < STEPS.length - 1 ? (
                                                                <CheckCircle2Icon className="size-5" />
                                                            ) : isCurrent ? (
                                                                <Loader2Icon className="size-5 animate-spin" />
                                                            ) : (
                                                                <div className={cn("size-3.5 rounded-full border-2 mx-auto", isPending ? "border-foreground/20" : "border-primary")} />
                                                            )}
                                                        </div>
                                                        <p className={cn("text-sm", isCurrent ? "text-foreground font-medium" : isDoneStep ? "text-foreground/60" : "text-muted-foreground/40")}>
                                                            {s.label}
                                                            {isCurrent && s.key === "uploading" && (
                                                                <span className="ml-2 text-primary">{Math.round(uploadProgress)}%</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── ERROR ── */}
                                {appState === "error" && (
                                    <motion.div
                                        key="error"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="flex-1 flex flex-col items-center justify-center gap-4 p-8"
                                    >
                                        <XCircleIcon className="size-12 text-red-400" />
                                        <p className="text-sm font-medium text-foreground">Processing failed</p>
                                        <p className="text-xs text-muted-foreground max-w-xs text-center">{error}</p>
                                        <Button variant="outline" size="sm" onClick={handleReset}>
                                            <RotateCcwIcon className="size-3.5 mr-2" />Try again
                                        </Button>
                                    </motion.div>
                                )}

                                {/* ── DONE: video player + subtitles ── */}
                                {appState === "done" && videoUrl && (
                                    <motion.div
                                        key="done"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.35 }}
                                        className="flex-1 flex flex-col lg:flex-row overflow-hidden"
                                    >
                                        {/* Video pane with custom subtitle overlay */}
                                        <div className="flex-1 bg-black flex items-center justify-center min-h-[260px] lg:min-h-0 relative">
                                            <video
                                                ref={videoRef}
                                                src={videoUrl}
                                                controls
                                                onTimeUpdate={handleTimeUpdate}
                                                className="w-full h-full max-h-[480px] object-contain"
                                            />
                                            {activeSubtitle && (
                                                <div className="absolute bottom-12 left-0 right-0 flex justify-center px-6 pointer-events-none">
                                                    <span className="bg-black/80 text-white text-sm md:text-base px-4 py-1.5 rounded-md text-center leading-snug max-w-[90%] shadow-lg">
                                                        {activeSubtitle}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Subtitles pane */}
                                        <div className="lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-foreground/10 flex flex-col bg-background">
                                            <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
                                                <span className="text-xs font-semibold text-foreground">
                                                    Subtitles · {segments.length} segments
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs px-2 gap-1"
                                                        title="Download transliterated (romanized) subtitles"
                                                        onClick={() => downloadSrt(srtContent, selectedFile?.name ?? "video")}
                                                    >
                                                        <DownloadIcon className="size-3" />SRT
                                                    </Button>
                                                    {teluguSrtContent && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs px-2 gap-1"
                                                            title="Download Telugu script subtitles"
                                                            onClick={() => downloadSrt(teluguSrtContent, (selectedFile?.name ?? "video") + "_telugu")}
                                                        >
                                                            <DownloadIcon className="size-3" />తెలుగు
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs px-2 gap-1"
                                                        title="Download original video"
                                                        onClick={() => downloadVideo(videoUrl!, selectedFile?.name ?? "video.mp4")}
                                                    >
                                                        <DownloadIcon className="size-3" />Video
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto divide-y divide-foreground/5 max-h-[300px] lg:max-h-[480px]">
                                                {segments.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground p-4 text-center">No speech detected.</p>
                                                ) : (
                                                    segments.map((seg) => (
                                                        <div key={seg.id} className="flex items-start gap-2 px-4 py-2.5">
                                                            <span className="text-xs text-muted-foreground/50 font-mono mt-0.5 shrink-0 w-12">
                                                                {formatTime(seg.start)}
                                                            </span>
                                                            <p className="text-xs text-foreground/90 leading-relaxed">{seg.text}</p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="absolute top-0 inset-x-0 w-3/5 mx-auto h-1/10 rounded-full bg-primary blur-[4rem] opacity-40 -z-10" />

                    {appState !== "done" && badges.map((b, i) => (
                        <FloatingBadge key={i} text={b.text} top={b.top} left={b.left} right={b.right} index={i} />
                    ))}
                </motion.div>
            </Wrapper>
        </section>
    );
};

export default Hero;
