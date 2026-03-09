"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import Icons from "@/components/global/icons";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/subtitle-generator/video-player";
import { UploadZone } from "@/components/subtitle-generator/upload-zone";
import { ProcessingStatus, type ProcessingStep } from "@/components/subtitle-generator/processing-status";
import { burnSubtitlesWasm, type CaptionStyle } from "@/lib/burn-wasm";
import type { TranscriptionSegment } from "@/lib/fastrouter";
import { motion, AnimatePresence } from "motion/react";
import {
    LogOutIcon,
    DownloadIcon,
    Loader2Icon,
    ArrowRightIcon,
    RotateCcwIcon,
    GripVerticalIcon,
    ClockIcon,
    SaveIcon,
    XIcon,
    FilmIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    TypeIcon,
    InfoIcon,
    MessageSquareIcon,
    CheckCircle2Icon,
    AlertTriangleIcon,
} from "lucide-react";
import { cn } from "@/utils";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = "idle" | "ready" | "processing" | "done" | "error";

interface ProcessResult {
    videoUrl: string;
    srtContent: string;
    vttContent: string;
    segments: TranscriptionSegment[];
    key: string;
}

// ─── Subtitle helpers ─────────────────────────────────────────────────────────

function padZ(n: number, len = 2) { return String(n).padStart(len, "0"); }

function srtTs(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${padZ(h)}:${padZ(m)}:${padZ(sec)},${padZ(ms, 3)}`;
}

function vttTs(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${padZ(h)}:${padZ(m)}:${padZ(sec)}.${padZ(ms, 3)}`;
}

function buildSrtFromSegs(segs: TranscriptionSegment[]): string {
    return segs.map((s, i) => `${i + 1}\n${srtTs(s.start)} --> ${srtTs(s.end)}\n${s.text}\n`).join("\n");
}

function buildVttFromSegs(segs: TranscriptionSegment[]): string {
    return `WEBVTT\n\n${segs.map(s => `${vttTs(s.start)} --> ${vttTs(s.end)}\n${s.text}`).join("\n\n")}`;
}

function fmtTimeDisplay(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${padZ(m)}:${padZ(sec)}.${padZ(ms, 3)}`;
}

function fmtTimeInput(s: number) {
    const m = Math.floor(s / 60), secWhole = Math.floor(s % 60), ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${padZ(m)}:${padZ(secWhole)}.${padZ(ms, 3)}`;
}

function parseTimeStr(input: string): number {
    const parts = input.trim().split(":");
    if (parts.length === 1) return Math.max(0, parseFloat(parts[0]) || 0);
    if (parts.length === 2) return Math.max(0, parseInt(parts[0], 10) * 60 + (parseFloat(parts[1]) || 0));
    return Math.max(0, parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + (parseFloat(parts[2]) || 0));
}

/**
 * Split segments so each shows at most `wordsPerCue` words.
 * Timing is divided proportionally by word count.
 */
function applyWordsPerCue(segments: TranscriptionSegment[], wordsPerCue: number): TranscriptionSegment[] {
    if (wordsPerCue <= 0) return segments;
    const result: TranscriptionSegment[] = [];
    let idBase = Date.now();
    for (const seg of segments) {
        const words = seg.text.trim().split(/\s+/).filter(Boolean);
        if (words.length <= wordsPerCue) { result.push(seg); continue; }
        const chunks: string[] = [];
        for (let i = 0; i < words.length; i += wordsPerCue) {
            chunks.push(words.slice(i, i + wordsPerCue).join(" "));
        }
        const duration = seg.end - seg.start;
        const timePerChunk = duration / chunks.length;
        chunks.forEach((text, i) => {
            result.push({
                id: idBase++,
                start: Number((seg.start + i * timePerChunk).toFixed(3)),
                end: Number((seg.start + (i + 1) * timePerChunk).toFixed(3)),
                text,
                originalText: text,
            });
        });
    }
    return result;
}

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ imageUrl, name }: { imageUrl?: string | null; name?: string | null }) {
    const initials = name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "?";
    if (imageUrl) {
        return (
            <div className="size-8 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/20">
                <Image src={imageUrl} alt={name ?? "User"} width={32} height={32} className="w-full h-full object-cover" />
            </div>
        );
    }
    return (
        <div className="size-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-primary/20">
            {initials}
        </div>
    );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
    const router = useRouter();
    const { data: session } = useSession();

    const playerRef = useRef<VideoPlayerHandle | null>(null);
    const splitInProgress = useRef(false);
    const [appState, setAppState] = useState<AppState>("idle");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [result, setResult] = useState<ProcessResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [videoKey, setVideoKey] = useState<string | null>(null);

    // Subtitle editor state
    const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
    const [currentVtt, setCurrentVtt] = useState<string>("");
    const [editingSegId, setEditingSegId] = useState<number | string | null>(null);
    const [editText, setEditText] = useState("");
    const [editingTimeSegId, setEditingTimeSegId] = useState<number | string | null>(null);
    const [timeStartText, setTimeStartText] = useState("");
    const [timeEndText, setTimeEndText] = useState("");
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [lastEdit, setLastEdit] = useState<{ segs: TranscriptionSegment[] } | null>(null);
    const [undoToast, setUndoToast] = useState(false);

    // Display settings
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("default");
    const [subtitlePosition, setSubtitlePosition] = useState<"top" | "bottom">("bottom");
    const [wordsPerCue, setWordsPerCue] = useState<number>(0); // 0 = no limit

    // Burn state
    const [burningVideo, setBurningVideo] = useState(false);
    const [burnPhase, setBurnPhase] = useState("");
    const [burnPct, setBurnPct] = useState(0);

    // Feedback modal state
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackMsg, setFeedbackMsg] = useState("");
    const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [feedbackError, setFeedbackError] = useState<string | null>(null);

    // Auto-delete video from R2 after 30 minutes
    useEffect(() => {
        if (!videoKey) return;
        const timer = setTimeout(async () => {
            try {
                await fetch("/api/delete", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: videoKey }),
                });
            } catch { /* ignore */ }
        }, 30 * 60 * 1000);
        return () => clearTimeout(timer);
    }, [videoKey]);

    const rebuildVtt = useCallback((segs: TranscriptionSegment[], wpc = wordsPerCue) => {
        const displaySegs = applyWordsPerCue(segs, wpc);
        setCurrentVtt(buildVttFromSegs(displaySegs));
    }, [wordsPerCue]);

    // Rebuild VTT when wordsPerCue changes
    useEffect(() => {
        if (segments.length > 0) rebuildVtt(segments, wordsPerCue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wordsPerCue]);

    const showUndo = useCallback((prev: TranscriptionSegment[]) => {
        setLastEdit({ segs: prev }); setUndoToast(true); setTimeout(() => setUndoToast(false), 5000);
    }, []);

    // ── Upload flow ──────────────────────────────────────────────────────────

    const handleFileSelected = useCallback((file: File) => {
        const prevKey = videoKey;
        if (prevKey) {
            fetch("/api/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: prevKey }),
            }).catch(() => {});
        }
        setSelectedFile(file); setAppState("ready"); setError(null); setResult(null);
        setVideoKey(null); setSegments([]); setCurrentVtt("");
        setEditingSegId(null); setEditingTimeSegId(null); setLastEdit(null); setUndoToast(false);
    }, [videoKey]);

    const handleProcess = useCallback(async () => {
        if (!selectedFile) return;
        setAppState("processing"); setError(null); setProcessingStep("uploading"); setUploadProgress(0);
        try {
            const presignRes = await fetch("/api/presigned-url", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: selectedFile.name, contentType: selectedFile.type || "video/mp4" }),
            });
            if (!presignRes.ok) { const d = await presignRes.json(); throw new Error(d.error ?? "Failed to get upload URL"); }
            const { uploadUrl, key } = await presignRes.json();
            setVideoKey(key);

            let finalKey = key;
            let xhrCorsBlocked = false;
            try {
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", uploadUrl, true);
                    xhr.setRequestHeader("Content-Type", selectedFile.type || "video/mp4");
                    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress((e.loaded / e.total) * 100); };
                    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { setUploadProgress(100); resolve(); } else reject(new Error(`Upload failed: ${xhr.status}`)); };
                    xhr.onerror = () => { xhrCorsBlocked = true; reject(new Error("__CORS__")); };
                    xhr.send(selectedFile);
                });
            } catch (xhrErr) {
                if (!xhrCorsBlocked) throw xhrErr;
                setUploadProgress(0);
                const fallbackRes = await fetch("/api/upload", {
                    method: "POST",
                    headers: {
                        "Content-Type": selectedFile.type || "video/mp4",
                        "x-file-type": selectedFile.type || "video/mp4",
                        "x-file-name": encodeURIComponent(selectedFile.name),
                        "x-file-size": String(selectedFile.size),
                    },
                    body: selectedFile,
                });
                if (!fallbackRes.ok) { const d = await fallbackRes.json(); throw new Error(d.error ?? "Server upload failed"); }
                const fbData = await fallbackRes.json();
                finalKey = fbData.key;
                setVideoKey(finalKey);
            }

            setProcessingStep("processing");
            const processRes = await fetch("/api/process", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: finalKey, fileName: selectedFile.name, fileSize: selectedFile.size }),
            });
            setProcessingStep("transcribing");

            let data: Record<string, unknown>;
            try {
                data = await processRes.json();
            } catch {
                if (processRes.status === 504 || processRes.status === 502) {
                    throw new Error("Processing timed out. Try a shorter video clip.");
                }
                throw new Error(`Server error (${processRes.status}). Please try again.`);
            }
            if (!processRes.ok) throw new Error((data.error as string | undefined) ?? `Processing failed (${processRes.status})`);

            const segs = (data.segments as TranscriptionSegment[]) ?? [];
            setProcessingStep("done");
            setResult({ videoUrl: data.videoUrl as string, srtContent: data.srtContent as string, vttContent: (data.vttContent as string) ?? "", segments: segs, key: finalKey });
            setSegments(segs);
            rebuildVtt(segs, wordsPerCue);
            setAppState("done");
        } catch (err) {
            const raw = err instanceof Error ? err.message : "An unexpected error occurred";
            const is503 = raw.includes("503") || raw.includes("high demand") || raw.includes("UNAVAILABLE") || raw.includes("overloaded");
            const isTimeout = raw.includes("timed out") || raw.includes("timeout");
            setError(is503 ? "The AI model is temporarily overloaded. Please wait and try again." : isTimeout ? "Processing timed out. Try a shorter video clip." : raw);
            setAppState("error"); setProcessingStep(null);
        }
    }, [selectedFile, wordsPerCue, rebuildVtt]);

    const handleReset = useCallback(() => {
        setAppState("idle"); setSelectedFile(null); setResult(null); setError(null);
        setProcessingStep(null); setUploadProgress(0); setVideoKey(null);
        setSegments([]); setCurrentVtt(""); setEditingSegId(null); setEditingTimeSegId(null);
        setLastEdit(null); setUndoToast(false);
    }, []);

    // ── Subtitle editor ──────────────────────────────────────────────────────

    const startEdit = useCallback((seg: TranscriptionSegment) => { setEditingSegId(seg.id); setEditText(seg.text); }, []);

    const saveEdit = useCallback(async (segId: number | string, nextIdx?: number) => {
        const prev = segments.map(s => ({ ...s }));
        const next = segments.map(s => s.id === segId ? { ...s, text: editText } : s);
        showUndo(prev); setSegments(next); rebuildVtt(next);
        setEditingSegId(null); setEditText("");
        if (nextIdx != null && segments[nextIdx]) setTimeout(() => startEdit(segments[nextIdx]), 30);
    }, [editText, segments, rebuildVtt, showUndo, startEdit]);

    const splitSegment = useCallback(async (seg: TranscriptionSegment, segIdx: number, cursorPos: number) => {
        splitInProgress.current = true;
        const before = editText.slice(0, cursorPos).trim();
        const after = editText.slice(cursorPos).trim();
        if (!before || !after) { await saveEdit(seg.id, segIdx + 1); splitInProgress.current = false; return; }
        const ratio = Math.max(0.1, Math.min(0.9, cursorPos / Math.max(editText.length, 1)));
        const splitTime = Number((seg.start + (seg.end - seg.start) * ratio).toFixed(3));
        const newSeg: TranscriptionSegment = { id: Date.now(), start: splitTime, end: seg.end, text: after, originalText: after };
        const updated = [...segments.slice(0, segIdx), { ...seg, text: before, end: splitTime }, newSeg, ...segments.slice(segIdx + 1)];
        showUndo(segments.map(s => ({ ...s }))); setSegments(updated); rebuildVtt(updated);
        setEditingSegId(null); setEditText("");
        splitInProgress.current = false;
        setTimeout(() => startEdit(newSeg), 30);
    }, [editText, segments, rebuildVtt, showUndo, saveEdit, startEdit]);

    const handleUndo = useCallback(() => {
        if (!lastEdit) return;
        setSegments(lastEdit.segs); rebuildVtt(lastEdit.segs); setLastEdit(null); setUndoToast(false);
    }, [lastEdit, rebuildVtt]);

    const startEditTime = useCallback((seg: TranscriptionSegment) => {
        setEditingTimeSegId(seg.id); setTimeStartText(fmtTimeInput(seg.start)); setTimeEndText(fmtTimeInput(seg.end));
    }, []);

    const adjustTimeText = useCallback((isStart: boolean, delta: number) => {
        if (isStart) setTimeStartText(t => fmtTimeInput(Math.max(0, Number((parseTimeStr(t) + delta).toFixed(3)))));
        else setTimeEndText(t => fmtTimeInput(Math.max(0, Number((parseTimeStr(t) + delta).toFixed(3)))));
    }, []);

    const saveEditTime = useCallback((segId: number | string) => {
        const prev = segments.map(s => ({ ...s }));
        const next = segments.map(s => s.id !== segId ? s : { ...s, start: parseTimeStr(timeStartText), end: parseTimeStr(timeEndText) });
        showUndo(prev); setSegments(next); rebuildVtt(next); setEditingTimeSegId(null);
    }, [timeStartText, timeEndText, segments, rebuildVtt, showUndo]);

    const handleDropSegment = useCallback((targetIdx: number) => {
        if (dragIndex === null || dragIndex === targetIdx) { setDragIndex(null); setDragOverIndex(null); return; }
        const reordered = [...segments];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(targetIdx, 0, moved);
        setSegments(reordered); rebuildVtt(reordered); setDragIndex(null); setDragOverIndex(null);
    }, [dragIndex, segments, rebuildVtt]);

    const handleDownloadSRT = useCallback(() => {
        const srt = buildSrtFromSegs(applyWordsPerCue(segments, wordsPerCue));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([srt], { type: "text/plain;charset=utf-8" }));
        a.download = (selectedFile?.name ?? "video").replace(/\.[^/.]+$/, "") + "_subtitles.srt";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }, [segments, selectedFile, wordsPerCue]);

    const handleDownloadVideo = useCallback(async () => {
        if (!videoKey || !segments.length) {
            if (videoKey) {
                const a = document.createElement("a");
                a.href = `/api/download-video?key=${encodeURIComponent(videoKey)}`;
                a.download = (selectedFile?.name ?? "video").replace(/\.[^/.]+$/, "") + "_subtitled.mp4";
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }
            return;
        }
        setBurningVideo(true); setBurnPhase("Starting…"); setBurnPct(0);
        try {
            const srt = buildSrtFromSegs(applyWordsPerCue(segments, wordsPerCue));
            const outName = (selectedFile?.name ?? "video").replace(/\.[^/.]+$/, "") + "_subtitled.mp4";
            await burnSubtitlesWasm(videoKey, srt, outName, (phase, pct) => { setBurnPhase(phase); setBurnPct(pct); }, captionStyle, subtitlePosition);
        } catch (e) {
            console.error("[burnWasm]", e);
            const a = document.createElement("a");
            a.href = `/api/download-video?key=${encodeURIComponent(videoKey)}`;
            a.download = (selectedFile?.name ?? "video").replace(/\.[^/.]+$/, "") + ".mp4";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } finally { setBurningVideo(false); setBurnPhase(""); setBurnPct(0); }
    }, [videoKey, segments, selectedFile, captionStyle, subtitlePosition, wordsPerCue]);

    const handleFeedbackSubmit = useCallback(async () => {
        if (!feedbackMsg.trim()) return;
        setFeedbackStatus("sending"); setFeedbackError(null);
        try {
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: feedbackMsg.trim() }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Send failed"); }
            setFeedbackStatus("sent");
            setFeedbackMsg("");
            setTimeout(() => { setFeedbackStatus("idle"); setFeedbackOpen(false); }, 2500);
        } catch (e) {
            setFeedbackError(e instanceof Error ? e.message : "Something went wrong");
            setFeedbackStatus("error");
        }
    }, [feedbackMsg]);

    const isProcessing = appState === "processing";
    const userName = session?.user?.name ?? null;
    const userImage = session?.user?.image ?? null;
    const userEmail = session?.user?.email ?? null;

    return (
        <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">

            {/* ── Top header ── */}
            <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-foreground/10 bg-background/95 backdrop-blur-sm z-20">
                <Icons.wordmark className="h-5 w-auto text-foreground" />

                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2.5">
                        <UserAvatar imageUrl={userImage} name={userName} />
                        <div className="leading-tight">
                            <p className="text-sm font-medium">{userName ?? "User"}</p>
                            <p className="text-xs text-muted-foreground">{userEmail}</p>
                        </div>
                    </div>
                    <button
                        onClick={async () => { await signOut(); router.push("/auth/sign-in"); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                        <LogOutIcon className="size-4" />
                        <span className="hidden sm:inline">Logout</span>
                    </button>
                </div>
            </header>

            {/* ── Main content ── */}
            <main className="flex-1 overflow-auto">
                <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

                    {/* Subtitle generator card */}
                    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                        <AnimatePresence mode="wait">

                            {/* idle / ready */}
                            {(appState === "idle" || appState === "ready") && (
                                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-8">
                                    <div className="mb-6">
                                        <h1 className="text-xl font-semibold">Generate Subtitles</h1>
                                        <p className="text-sm text-muted-foreground mt-1">Upload a video to generate word-accurate Tenglish captions.</p>
                                    </div>
                                    <UploadZone onFileSelected={handleFileSelected} disabled={isProcessing} />
                                    <AnimatePresence>
                                        {appState === "ready" && selectedFile && (
                                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="mt-6 flex justify-center">
                                                <button onClick={handleProcess} disabled={isProcessing} className={cn(
                                                    "flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-primary text-white font-semibold text-sm",
                                                    "hover:bg-primary/90 active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(0,85,255,0.3)]",
                                                    "disabled:opacity-60 disabled:cursor-not-allowed"
                                                )}>
                                                    Generate Subtitles <ArrowRightIcon className="size-4" />
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            )}

                            {/* processing */}
                            {appState === "processing" && (
                                <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-8 lg:p-12">
                                    <div className="max-w-lg mx-auto">
                                        <div className="mb-8 text-center">
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium mb-4">
                                                <span className="size-1.5 rounded-full bg-primary animate-pulse" /> Processing
                                            </div>
                                            <h3 className="text-xl font-bold">Processing your video</h3>
                                            <p className="text-sm text-muted-foreground mt-1">This may take a minute depending on video length.</p>
                                        </div>
                                        <ProcessingStatus step={processingStep} uploadProgress={uploadProgress} />
                                    </div>
                                </motion.div>
                            )}

                            {/* error */}
                            {appState === "error" && (
                                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-8 lg:p-12">
                                    <div className="max-w-md mx-auto text-center">
                                        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-red-500/10 text-red-400 mb-6 text-3xl">⚠️</div>
                                        <h3 className="text-lg font-bold mb-2">{error?.includes("overloaded") ? "Service Temporarily Busy" : "Something went wrong"}</h3>
                                        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{error}</p>
                                        <button onClick={handleReset} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 shadow-[0_0_20px_rgba(0,85,255,0.25)]">
                                            <RotateCcwIcon className="size-4" /> Try again
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* done */}
                            {appState === "done" && result && (
                                <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

                                    {/* Toolbar */}
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-foreground/10 bg-foreground/[0.02] flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                                                <span className="size-1.5 rounded-full bg-green-400" />
                                                {segments.length} subtitle{segments.length !== 1 ? "s" : ""}
                                            </span>
                                            {undoToast && lastEdit && (
                                                <button onClick={handleUndo} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                                                    <RotateCcwIcon className="size-3" /> Undo
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {/* Caption style */}
                                            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-foreground/10 bg-foreground/[0.03]">
                                                {(["default", "plain", "outline"] as const).map(s => (
                                                    <button key={s} onClick={() => setCaptionStyle(s)}
                                                        className={cn("text-[10px] px-2 py-0.5 rounded-md transition-all",
                                                            captionStyle === s ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                                                        )}>
                                                        {s === "default" ? "Box" : s === "plain" ? "Plain" : "Outline"}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Subtitle position toggle */}
                                            <button
                                                onClick={() => setSubtitlePosition(p => p === "bottom" ? "top" : "bottom")}
                                                title={subtitlePosition === "bottom" ? "Move to top" : "Move to bottom"}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                                    "border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
                                                )}
                                            >
                                                {subtitlePosition === "bottom" ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
                                                <span className="hidden sm:inline">{subtitlePosition === "bottom" ? "Bottom" : "Top"}</span>
                                            </button>

                                            {/* Words per cue */}
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-foreground/10 bg-foreground/[0.03]">
                                                <TypeIcon className="size-3 text-muted-foreground" />
                                                <span className="text-[10px] text-muted-foreground hidden sm:inline">Words/cue:</span>
                                                <select
                                                    value={wordsPerCue}
                                                    onChange={e => setWordsPerCue(Number(e.target.value))}
                                                    className="text-[11px] border-none outline-none cursor-pointer bg-background text-foreground"
                                                    style={{ colorScheme: "dark" }}
                                                >
                                                    <option value={0}>All</option>
                                                    <option value={1}>1</option>
                                                    <option value={2}>2</option>
                                                    <option value={3}>3</option>
                                                    <option value={4}>4</option>
                                                    <option value={5}>5</option>
                                                    <option value={6}>6</option>
                                                    <option value={8}>8</option>
                                                </select>
                                            </div>

                                            {/* Download SRT */}
                                            <button onClick={handleDownloadSRT} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground/10 hover:bg-foreground/15 text-foreground/80 hover:text-foreground transition-all">
                                                <DownloadIcon className="size-3.5" /> SRT
                                            </button>

                                            {/* Download Video */}
                                            <button onClick={handleDownloadVideo} disabled={burningVideo} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground/10 hover:bg-foreground/15 text-foreground/80 hover:text-foreground transition-all disabled:opacity-60 disabled:cursor-wait">
                                                {burningVideo ? (
                                                    <><Loader2Icon className="size-3.5 animate-spin" /><span className="max-w-[90px] truncate">{burnPhase}{burnPct > 0 && burnPct < 100 ? ` ${burnPct}%` : ""}</span></>
                                                ) : (
                                                    <><DownloadIcon className="size-3.5" /> Video</>
                                                )}
                                            </button>

                                            {/* New video */}
                                            <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-all">
                                                <RotateCcwIcon className="size-3.5" /> New
                                            </button>
                                        </div>
                                    </div>

                                    {/* Two-column layout: video + subtitle editor */}
                                    <div className="flex divide-x divide-foreground/10 overflow-hidden" style={{ height: "min(560px, calc(100vh - 260px))" }}>
                                        {/* Video player */}
                                        <div className="w-[55%] shrink-0 p-4 flex items-start justify-center bg-black/20">
                                            <VideoPlayer
                                                ref={playerRef}
                                                videoUrl={result.videoUrl}
                                                vttContent={currentVtt}
                                                subtitleFontBase={22}
                                                captionStyle={captionStyle}
                                                subtitlePosition={subtitlePosition}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Subtitle editor */}
                                        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                            <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center justify-between shrink-0 bg-foreground/[0.01]">
                                                <span className="text-xs font-medium text-muted-foreground">Subtitle Editor</span>
                                                <span className="text-[10px] text-muted-foreground/40 hidden lg:block">
                                                    Click → seek · Click time to edit · Enter splits · Shift+Enter saves · drag ⠿ reorder
                                                </span>
                                            </div>

                                            <div className="overflow-y-auto flex-1 divide-y divide-foreground/[0.05]">
                                                {segments.length === 0 && (
                                                    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">No subtitle segments detected.</div>
                                                )}
                                                {segments.map((seg, idx) => {
                                                    const isEditText = editingSegId === seg.id;
                                                    const isEditTime = editingTimeSegId === seg.id;
                                                    const isDragOver = dragOverIndex === idx;
                                                    const isDragging = dragIndex === idx;
                                                    return (
                                                        <div
                                                            key={seg.id}
                                                            draggable={!isEditText && !isEditTime}
                                                            onDragStart={() => setDragIndex(idx)}
                                                            onDragOver={e => { e.preventDefault(); setDragOverIndex(idx); }}
                                                            onDrop={() => handleDropSegment(idx)}
                                                            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                                                            onClick={() => { if (!isEditText && !isEditTime) playerRef.current?.seek(seg.start); }}
                                                            className={cn(
                                                                "flex items-start gap-2 px-3 py-2.5 group/row transition-colors cursor-pointer",
                                                                isDragOver && "bg-primary/5 border-t border-primary/30",
                                                                isDragging && "opacity-40",
                                                                !isEditText && !isEditTime && "hover:bg-foreground/[0.04]"
                                                            )}
                                                        >
                                                            <GripVerticalIcon className="size-3.5 mt-[18px] shrink-0 text-muted-foreground/20 group-hover/row:text-muted-foreground/50 cursor-grab active:cursor-grabbing transition-colors" />

                                                            <div className="flex-1 min-w-0 space-y-1">
                                                                {/* Time editor */}
                                                                {isEditTime ? (
                                                                    <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <div className="flex items-center gap-1">
                                                                                <button onClick={() => adjustTimeText(true, -0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">-</button>
                                                                                <input autoFocus value={timeStartText} onChange={e => setTimeStartText(e.target.value)}
                                                                                    className="w-[72px] text-[11px] font-mono bg-foreground/10 border border-foreground/20 rounded px-1.5 py-0.5 focus:outline-none focus:border-primary/50 text-foreground" placeholder="00:00.0" />
                                                                                <button onClick={() => adjustTimeText(true, 0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">+</button>
                                                                            </div>
                                                                            <span className="text-muted-foreground/50 text-[10px]">→</span>
                                                                            <div className="flex items-center gap-1">
                                                                                <button onClick={() => adjustTimeText(false, -0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">-</button>
                                                                                <input value={timeEndText} onChange={e => setTimeEndText(e.target.value)}
                                                                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveEditTime(seg.id); } if (e.key === "Escape") setEditingTimeSegId(null); }}
                                                                                    className="w-[72px] text-[11px] font-mono bg-foreground/10 border border-foreground/20 rounded px-1.5 py-0.5 focus:outline-none focus:border-primary/50 text-foreground" placeholder="00:00.0" />
                                                                                <button onClick={() => adjustTimeText(false, 0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">+</button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex gap-2">
                                                                            <button onClick={() => saveEditTime(seg.id)} className="p-1 rounded bg-primary/10 hover:bg-primary/20 text-primary"><SaveIcon className="size-3" /></button>
                                                                            <button onClick={() => setEditingTimeSegId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground"><XIcon className="size-3" /></button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button onClick={e => { e.stopPropagation(); startEditTime(seg); }}
                                                                        className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/50 hover:text-primary transition-colors">
                                                                        <ClockIcon className="size-2.5" />
                                                                        {fmtTimeDisplay(seg.start)} – {fmtTimeDisplay(seg.end)}
                                                                    </button>
                                                                )}

                                                                {/* Text editor */}
                                                                {isEditText ? (
                                                                    <textarea
                                                                        autoFocus
                                                                        value={editText}
                                                                        onChange={e => setEditText(e.target.value)}
                                                                        rows={2}
                                                                        onClick={e => e.stopPropagation()}
                                                                        onKeyDown={async e => {
                                                                            if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); await saveEdit(seg.id, idx + 1); }
                                                                            else if (e.key === "Enter") { e.preventDefault(); const cursor = (e.currentTarget as HTMLTextAreaElement).selectionStart ?? editText.length; await splitSegment(seg, idx, cursor); }
                                                                            else if (e.key === "Escape") { setEditingSegId(null); setEditText(""); }
                                                                        }}
                                                                        onBlur={() => { if (!splitInProgress.current) saveEdit(seg.id); }}
                                                                        className="w-full text-sm bg-foreground/[0.08] border border-primary/30 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:border-primary/60 text-foreground leading-snug"
                                                                    />
                                                                ) : (
                                                                    <p onClick={e => { e.stopPropagation(); startEdit(seg); }}
                                                                        className="text-sm text-foreground/90 leading-snug hover:text-foreground transition-colors cursor-text">
                                                                        {seg.text || <span className="text-muted-foreground/30 italic text-xs">empty — click to add</span>}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            <span className="text-[10px] text-muted-foreground/25 shrink-0 mt-[18px] tabular-nums w-5 text-right">{idx + 1}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Storage + 3-min limit info banner */}
                    {(appState === "idle" || appState === "ready") && (
                        <div className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3.5">
                            <InfoIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground/80">No videos saved</p>
                                <p className="text-xs text-muted-foreground">
                                    Videos are temporarily stored in Cloudflare R2 and auto-deleted after 30 minutes.
                                    Uploading a new video immediately deletes the previous one.
                                    Download your captioned video and SRT before leaving.
                                </p>
                                <p className="text-xs text-yellow-400/80 flex items-center gap-1">
                                    <AlertTriangleIcon className="size-3 shrink-0" />
                                    Maximum recommended video length: <strong>3 minutes</strong>. Longer videos may time out.
                                </p>
                            </div>
                            <FilmIcon className="size-4 text-muted-foreground/30 shrink-0 mt-0.5 hidden sm:block" />
                        </div>
                    )}

                </div>
            </main>

            {/* ── Floating feedback button ── */}
            <button
                onClick={() => { setFeedbackOpen(true); setFeedbackStatus("idle"); setFeedbackError(null); }}
                title="Send feedback"
                className="fixed bottom-6 right-6 z-50 size-12 rounded-full bg-primary text-white shadow-[0_0_20px_rgba(0,85,255,0.4)] flex items-center justify-center hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all"
            >
                <MessageSquareIcon className="size-5" />
            </button>

            {/* ── Feedback modal ── */}
            <AnimatePresence>
                {feedbackOpen && (
                    <motion.div
                        key="feedback-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={e => { if (e.target === e.currentTarget) setFeedbackOpen(false); }}
                    >
                        <motion.div
                            key="feedback-panel"
                            initial={{ opacity: 0, y: 30, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="w-full max-w-md rounded-2xl border border-foreground/10 bg-background shadow-2xl p-6 space-y-4"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                        <MessageSquareIcon className="size-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold">Send Feedback</h3>
                                        <p className="text-xs text-muted-foreground">We read every message</p>
                                    </div>
                                </div>
                                <button onClick={() => setFeedbackOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
                                    <XIcon className="size-4" />
                                </button>
                            </div>

                            {/* Sent state */}
                            {feedbackStatus === "sent" ? (
                                <div className="flex flex-col items-center gap-3 py-4">
                                    <CheckCircle2Icon className="size-10 text-green-400" />
                                    <p className="text-sm font-medium">Thank you for your feedback!</p>
                                    <p className="text-xs text-muted-foreground">We&apos;ll review it shortly.</p>
                                </div>
                            ) : (
                                <>
                                    <textarea
                                        autoFocus
                                        value={feedbackMsg}
                                        onChange={e => setFeedbackMsg(e.target.value)}
                                        placeholder="Tell us what you think, report a bug, or request a feature…"
                                        rows={5}
                                        className="w-full text-sm bg-foreground/[0.06] border border-foreground/10 rounded-xl px-3.5 py-3 resize-none focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground/40"
                                    />
                                    {feedbackError && (
                                        <p className="text-xs text-red-400">{feedbackError}</p>
                                    )}
                                    <button
                                        onClick={handleFeedbackSubmit}
                                        disabled={!feedbackMsg.trim() || feedbackStatus === "sending"}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(0,85,255,0.25)]"
                                    >
                                        {feedbackStatus === "sending" ? (
                                            <><Loader2Icon className="size-4 animate-spin" /> Sending…</>
                                        ) : (
                                            <><MessageSquareIcon className="size-4" /> Send Feedback</>
                                        )}
                                    </button>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

