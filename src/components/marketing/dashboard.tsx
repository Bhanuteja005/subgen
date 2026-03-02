"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
    FilmIcon,
    LayoutGridIcon,
    LogOutIcon,
    DownloadIcon,
    Trash2Icon,
    Loader2Icon,
    RefreshCwIcon,
    UploadCloudIcon,
    ZapIcon,
    FileTextIcon,
    ShieldAlertIcon,
    BellIcon,
    SearchIcon,
    ArrowRightIcon,
    RotateCcwIcon,
    ListVideoIcon,
    ChevronRightIcon,
    GripVerticalIcon,
    ClockIcon,
    SaveIcon,
    XIcon,
    UserIcon,
    MessageSquareIcon,
    CheckCircle2Icon,
    StarIcon,
} from "lucide-react";
import { burnSubtitlesWasm, type CaptionStyle } from "@/lib/burn-wasm";
import { signOut, useSession } from "@/lib/auth-client";
import Image from "next/image";
import Icons from "../global/icons";
import { Button } from "../ui/button";
import { cn } from "@/utils";
import { UploadZone } from "@/components/subtitle-generator/upload-zone";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/subtitle-generator/video-player";
import {
    ProcessingStatus,
    type ProcessingStep,
} from "@/components/subtitle-generator/processing-status";
import type { TranscriptionSegment } from "@/lib/fastrouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoJob {
    _id: string;
    fileName: string;
    fileSize: number;
    r2Key: string;
    status: "processing" | "done" | "error";
    durationSeconds: number;
    segmentCount: number;
    tokenUsage: number;
    createdAt: string;
    errorMessage?: string;
}

interface ProcessResult {
    videoUrl: string;
    srtContent: string;
    vttContent: string;
    segments: TranscriptionSegment[];
    key: string;
}

type AppState = "idle" | "ready" | "processing" | "done" | "error";
type NavSection = "dashboard" | "myvideos" | "upload" | "profile" | "feedback";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDuration(sec: number) {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtSize(bytes: number) {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchVideos(): Promise<VideoJob[]> {
    const res = await fetch("/api/dashboard/videos");
    if (!res.ok) throw new Error("Failed to load videos");
    const data = await res.json();
    return data.videos ?? [];
}

async function deleteVideo(id: string): Promise<void> {
    const res = await fetch(`/api/dashboard/videos?id=${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete video");
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ imageUrl, name, size = "md" }: {
    imageUrl?: string | null;
    name?: string | null;
    size?: "sm" | "md";
}) {
    const initials = name
        ? name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
        : "?";
    const dim = size === "sm" ? "size-7" : "size-8";
    const textSize = size === "sm" ? "text-[10px]" : "text-xs";

    if (imageUrl) {
        return (
            <div className={cn(dim, "rounded-full overflow-hidden shrink-0 ring-2 ring-primary/20")}>
                <Image src={imageUrl} alt={name ?? "User"} width={32} height={32} className="w-full h-full object-cover" />
            </div>
        );
    }
    return (
        <div className={cn(dim, "rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary flex items-center justify-center font-bold shrink-0 ring-2 ring-primary/20", textSize)}>
            {initials}
        </div>
    );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: {
    icon: React.FC<{ className?: string }>;
    label: string;
    value: string | number;
    sub?: string;
}) {
    return (
        <div className="flex items-center gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Icon className="size-5" />
            </div>
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </div>
        </div>
    );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VideoJob["status"] }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
            status === "done"       && "bg-green-500/10 text-green-400",
            status === "processing" && "bg-yellow-500/10 text-yellow-400",
            status === "error"      && "bg-red-500/10 text-red-400",
        )}>
            {status === "processing" && <Loader2Icon className="size-3 animate-spin" />}
            {status === "done"       && <span className="size-1.5 rounded-full bg-green-400 inline-block" />}
            {status === "error"      && <span className="size-1.5 rounded-full bg-red-400 inline-block" />}
            {status}
        </span>
    );
}

// ─── Videos Table ─────────────────────────────────────────────────────────────

function VideosTable({
    videos,
    isLoading,
    isError,
    deletingId,
    onDelete,
    onDownloadSRT,
    onRefetch,
    onUpload,
}: {
    videos: VideoJob[];
    isLoading: boolean;
    isError: boolean;
    deletingId: string | null;
    onDelete: (id: string) => void;
    onDownloadSRT: (id: string, name: string) => void;
    onRefetch: () => void;
    onUpload: () => void;
}) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2Icon className="size-5 animate-spin" />
                <span>Loading your videos…</span>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex items-center justify-center py-20 gap-2 text-sm">
                <span className="text-red-400">Failed to load videos.</span>
                <button className="text-primary underline text-sm" onClick={onRefetch}>Retry</button>
            </div>
        );
    }

    if (videos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-5 border border-dashed border-foreground/10 rounded-2xl bg-foreground/[0.01]">
                <div className="p-5 rounded-2xl bg-primary/10 text-primary">
                    <UploadCloudIcon className="size-10" />
                </div>
                <div className="text-center">
                    <p className="font-semibold text-lg">No videos uploaded yet</p>
                    <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
                        Upload your first video to generate Tenglish captions instantly.
                    </p>
                </div>
                <Button className="shadow-[0_0_20px_rgba(0,85,255,0.2)]" onClick={onUpload}>
                    <UploadCloudIcon className="size-4 mr-2" />
                    Upload Video
                </Button>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-foreground/10 overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-foreground/10 bg-foreground/[0.03] text-muted-foreground">
                        <th className="px-4 py-3 text-left font-medium">File</th>
                        <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Status</th>
                        <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Duration</th>
                        <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Segments</th>
                        <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Date</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-foreground/[0.06]">
                    {videos.map((v) => (
                        <tr key={v._id} className="hover:bg-foreground/[0.02] transition-colors">
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-foreground/5 text-muted-foreground shrink-0">
                                        <FilmIcon className="size-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium truncate max-w-[200px]">{v.fileName}</p>
                                        <p className="text-xs text-muted-foreground">{fmtSize(v.fileSize)}</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                                <StatusBadge status={v.status} />
                            </td>
                            <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                {fmtDuration(v.durationSeconds)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                                {v.segmentCount > 0 ? v.segmentCount : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                                {fmtDate(v.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5 justify-end">
                                    {v.status === "done" && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onDownloadSRT(v._id, v.fileName)}
                                            title="Download SRT"
                                        >
                                            <DownloadIcon className="size-3.5 mr-1" />
                                            <span className="hidden sm:inline">SRT</span>
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        onClick={() => onDelete(v._id)}
                                        disabled={deletingId === v._id}
                                        title="Delete"
                                    >
                                        {deletingId === v._id ? (
                                            <Loader2Icon className="size-3.5 animate-spin" />
                                        ) : (
                                            <Trash2Icon className="size-3.5" />
                                        )}
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Subtitle helpers (used by UploadPanel) ───────────────────────────────────

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

/** Display time as MM:SS.mm */
function fmtTimeDisplay(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${padZ(m)}:${padZ(sec)}.${padZ(ms, 3)}`;
}

/** Format for time input fields: MM:SS.d */
function fmtTimeInput(s: number) {
    const m = Math.floor(s / 60);
    const secWhole = Math.floor(s % 60);
    const ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${padZ(m)}:${padZ(secWhole)}.${padZ(ms, 3)}`;
}

/** Parse "MM:SS.d" or "SS.d" back to seconds */
function parseTimeStr(input: string): number {
    const parts = input.trim().split(":");
    if (parts.length === 1) return Math.max(0, parseFloat(parts[0]) || 0);
    if (parts.length === 2) return Math.max(0, parseInt(parts[0], 10) * 60 + (parseFloat(parts[1]) || 0));
    return Math.max(0, parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + (parseFloat(parts[2]) || 0));
}

// ─── Upload Panel (full subtitle-generator workflow) ──────────────────────────

function UploadPanel({ onDone }: { onDone?: () => void }) {
    // ── Upload state ──────────────────────────────────────────────────────────
    const [appState, setAppState]               = useState<AppState>("idle");
    const [selectedFile, setSelectedFile]       = useState<File | null>(null);
    const [processingStep, setProcessingStep]   = useState<ProcessingStep>(null);
    const [uploadProgress, setUploadProgress]   = useState(0);
    const [result, setResult]                   = useState<ProcessResult | null>(null);
    const [error, setError]                     = useState<string | null>(null);
    const [videoKey, setVideoKey]               = useState<string | null>(null);

    // ── Subtitle editor state ─────────────────────────────────────────────────
    const playerRef         = useRef<VideoPlayerHandle | null>(null);
    const splitInProgress   = useRef(false);
    const [segments, setSegments]                     = useState<TranscriptionSegment[]>([]);
    const [currentVtt, setCurrentVtt]                 = useState<string>("");
    const [editingSegId, setEditingSegId]             = useState<number | string | null>(null);
    const [editText, setEditText]                     = useState("");
    const [editingTimeSegId, setEditingTimeSegId]     = useState<number | string | null>(null);
    const [timeStartText, setTimeStartText]           = useState("");
    const [timeEndText, setTimeEndText]               = useState("");
    const [dragIndex, setDragIndex]                   = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex]           = useState<number | null>(null);
    const [lastEdit, setLastEdit]                     = useState<{ segs: TranscriptionSegment[] } | null>(null);
    const [undoToast, setUndoToast]                   = useState(false);
    const [burningVideo, setBurningVideo]             = useState(false);
    const [burnPhase, setBurnPhase]                   = useState("");
    const [burnPct, setBurnPct]                       = useState(0);
    const [captionStyle, setCaptionStyle]             = useState<CaptionStyle>("default");
    const [feedbackMsg, setFeedbackMsg]               = useState("");
    const [feedbackStatus, setFeedbackStatus]         = useState<"idle" | "sending" | "sent" | "error">("idle");

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
            } catch { /* ignore */ }
        }, 5 * 60 * 1000);
        return () => clearTimeout(timer);
    }, [videoKey]);

    // ── Upload flow ───────────────────────────────────────────────────────────
    const handleFileSelected = useCallback((file: File) => {
        setSelectedFile(file); setAppState("ready"); setError(null); setResult(null);
    }, []);

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

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("PUT", uploadUrl, true);
                xhr.setRequestHeader("Content-Type", selectedFile.type || "video/mp4");
                xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress((e.loaded / e.total) * 100); };
                xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { setUploadProgress(100); resolve(); } else reject(new Error(`Upload failed: ${xhr.status}`)); };
                xhr.onerror = () => reject(new Error("Network error during upload"));
                xhr.send(selectedFile);
            });

            setProcessingStep("processing");
            const processRes = await fetch("/api/process", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key }),
            });
            setProcessingStep("transcribing");
            if (!processRes.ok) { const d = await processRes.json(); throw new Error(d.error ?? "Processing failed"); }

            const data = await processRes.json();
            setProcessingStep("done");
            setResult({ videoUrl: data.videoUrl, srtContent: data.srtContent, vttContent: data.vttContent, segments: data.segments, key: data.key });
            setSegments(data.segments ?? []);
            setCurrentVtt(data.vttContent ?? "");
            setAppState("done");
        } catch (err) {
            const raw = err instanceof Error ? err.message : "An unexpected error occurred";
            const is503 = raw.includes("503") || raw.includes("high demand") || raw.includes("UNAVAILABLE");
            setError(is503 ? "The AI model is temporarily overloaded. Please wait a moment and try again." : raw);
            setAppState("error"); setProcessingStep(null);
        }
    }, [selectedFile]);

    const handleReset = useCallback(() => {
        setAppState("idle"); setSelectedFile(null); setResult(null); setError(null);
        setProcessingStep(null); setUploadProgress(0); setVideoKey(null);
        setSegments([]); setCurrentVtt(""); setEditingSegId(null); setEditingTimeSegId(null);
        setLastEdit(null); setUndoToast(false);
    }, []);

    const handleFeedback = async () => {
        if (!feedbackMsg.trim()) return;
        setFeedbackStatus("sending");
        try {
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: feedbackMsg.trim() }),
            });
            if (!res.ok) throw new Error();
            setFeedbackStatus("sent");
            setFeedbackMsg("");
            setTimeout(() => setFeedbackStatus("idle"), 3000);
        } catch {
            setFeedbackStatus("error");
            setTimeout(() => setFeedbackStatus("idle"), 3000);
        }
    };

    // ── Subtitle helpers ──────────────────────────────────────────────────────
    const rebuildVtt = useCallback((segs: TranscriptionSegment[]) => { setCurrentVtt(buildVttFromSegs(segs)); }, []);

    const persistSrt = useCallback(async (_segs: TranscriptionSegment[]) => { /* non-fatal, best-effort */ }, []);

    const showUndo = useCallback((prev: TranscriptionSegment[]) => {
        setLastEdit({ segs: prev }); setUndoToast(true); setTimeout(() => setUndoToast(false), 5000);
    }, []);

    const startEdit = useCallback((seg: TranscriptionSegment) => {
        setEditingSegId(seg.id); setEditText(seg.text);
    }, []);

    const saveEdit = useCallback(async (segId: number | string, nextIdx?: number) => {
        const prev = segments.map(s => ({ ...s }));
        const next = segments.map(s => s.id === segId ? { ...s, text: editText } : s);
        showUndo(prev); setSegments(next); rebuildVtt(next);
        setEditingSegId(null); setEditText("");
        await persistSrt(next);
        if (nextIdx != null && segments[nextIdx]) setTimeout(() => startEdit(segments[nextIdx]), 30);
    }, [editText, segments, rebuildVtt, persistSrt, showUndo, startEdit]);

    const splitSegment = useCallback(async (seg: TranscriptionSegment, segIdx: number, cursorPos: number) => {
        splitInProgress.current = true;
        const before = editText.slice(0, cursorPos).trim();
        const after  = editText.slice(cursorPos).trim();
        if (!before || !after) { await saveEdit(seg.id, segIdx + 1); splitInProgress.current = false; return; }
        const ratio = Math.max(0.1, Math.min(0.9, cursorPos / Math.max(editText.length, 1)));
        const splitTime = Number((seg.start + (seg.end - seg.start) * ratio).toFixed(3));
        const newSeg: TranscriptionSegment = { id: Date.now(), start: splitTime, end: seg.end, text: after, originalText: after };
        const updated = [...segments.slice(0, segIdx), { ...seg, text: before, end: splitTime }, newSeg, ...segments.slice(segIdx + 1)];
        showUndo(segments.map(s => ({ ...s }))); setSegments(updated); rebuildVtt(updated);
        setEditingSegId(null); setEditText("");
        await persistSrt(updated);
        splitInProgress.current = false;
        setTimeout(() => startEdit(newSeg), 30);
    }, [editText, segments, rebuildVtt, persistSrt, showUndo, saveEdit, startEdit]);

    const handleUndo = useCallback(async () => {
        if (!lastEdit) return;
        setSegments(lastEdit.segs); rebuildVtt(lastEdit.segs); setLastEdit(null); setUndoToast(false);
        await persistSrt(lastEdit.segs);
    }, [lastEdit, rebuildVtt, persistSrt]);

    const startEditTime = useCallback((seg: TranscriptionSegment) => {
        setEditingTimeSegId(seg.id); setTimeStartText(fmtTimeInput(seg.start)); setTimeEndText(fmtTimeInput(seg.end));
    }, []);

    const adjustTimeText = useCallback((isStart: boolean, delta: number) => {
        const parse = (v: string) => parseTimeStr(v);
        if (isStart) {
            const ns = Math.max(0, Number((parse(timeStartText) + delta).toFixed(3)));
            setTimeStartText(fmtTimeInput(ns));
        } else {
            const ns = Math.max(0, Number((parse(timeEndText) + delta).toFixed(3)));
            setTimeEndText(fmtTimeInput(ns));
        }
    }, [timeStartText, timeEndText]);

    const saveEditTime = useCallback(async (segId: number | string) => {
        const prev = segments.map(s => ({ ...s }));
        const next = segments.map(s => s.id !== segId ? s : { ...s, start: parseTimeStr(timeStartText), end: parseTimeStr(timeEndText) });
        showUndo(prev); setSegments(next); rebuildVtt(next); setEditingTimeSegId(null);
        await persistSrt(next);
    }, [timeStartText, timeEndText, segments, rebuildVtt, persistSrt, showUndo]);

    const handleDrop = useCallback(async (targetIdx: number) => {
        if (dragIndex === null || dragIndex === targetIdx) { setDragIndex(null); setDragOverIndex(null); return; }
        const reordered = [...segments];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(targetIdx, 0, moved);
        setSegments(reordered); rebuildVtt(reordered); setDragIndex(null); setDragOverIndex(null);
        await persistSrt(reordered);
    }, [dragIndex, segments, rebuildVtt, persistSrt]);

    const handleDownloadSRT = useCallback(() => {
        const srt = buildSrtFromSegs(segments);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([srt], { type: "text/plain;charset=utf-8" }));
        a.download = (selectedFile?.name ?? "video").replace(/\.[^/.]+$/, "") + "_subtitles.srt";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }, [segments, selectedFile]);

    const handleDownloadVideo = useCallback(async () => {
        if (!videoKey || !segments.length) {
            // fallback: download via proxy API
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
            const srt = buildSrtFromSegs(segments);
            const outName = (selectedFile?.name ?? "video").replace(/\.[^/.]+$/, "") + "_subtitled.mp4";
            await burnSubtitlesWasm(videoKey, srt, outName, (phase, pct) => {
                setBurnPhase(phase); setBurnPct(pct);
            }, captionStyle);
        } catch (e) {
            console.error("[burnWasm]", e);
            // fallback: proxy download
            const a = document.createElement("a");
            a.href = `/api/download-video?key=${encodeURIComponent(videoKey)}`;
            a.download = (selectedFile?.name ?? "video").replace(/\.[^/.]+$/, "") + ".mp4";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } finally {
            setBurningVideo(false); setBurnPhase(""); setBurnPct(0);
        }
    }, [videoKey, segments, selectedFile, captionStyle]);

    const isProcessing = appState === "processing";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold">Upload Video</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Upload a video to generate Tenglish captions in seconds.
                </p>
            </div>

            <div className={cn("rounded-2xl border border-foreground/10 bg-foreground/[0.03] backdrop-blur-sm overflow-hidden")}>
                <AnimatePresence mode="wait">
                    {/* ── idle / ready ── */}
                    {(appState === "idle" || appState === "ready") && (
                        <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-8">
                            <UploadZone onFileSelected={handleFileSelected} disabled={isProcessing} />
                            <AnimatePresence>
                                {appState === "ready" && selectedFile && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.25 }} className="mt-6 flex justify-center">
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

                    {/* ── processing ── */}
                    {appState === "processing" && (
                        <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-8 lg:p-12">
                            <div className="max-w-lg mx-auto">
                                <div className="mb-8 text-center">
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium mb-4">
                                        <span className="size-1.5 rounded-full bg-primary animate-pulse" /> Processing
                                    </div>
                                    <h3 className="text-xl font-bold text-foreground">Processing your video</h3>
                                    <p className="text-sm text-muted-foreground mt-1">This may take a minute depending on video length.</p>
                                </div>
                                <ProcessingStatus step={processingStep} uploadProgress={uploadProgress} />
                            </div>
                        </motion.div>
                    )}

                    {/* ── error ── */}
                    {appState === "error" && (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-8 lg:p-12">
                            <div className="max-w-md mx-auto text-center">
                                <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-red-500/10 text-red-400 mb-6">
                                    <span className="text-3xl">⚠️</span>
                                </div>
                                <h3 className="text-lg font-bold text-foreground mb-2">
                                    {error?.includes("overloaded") ? "Service Temporarily Busy" : "Something went wrong"}
                                </h3>
                                <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{error}</p>
                                <button onClick={handleReset} className={cn(
                                    "inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all",
                                    "bg-primary text-white hover:bg-primary/90 shadow-[0_0_20px_rgba(0,85,255,0.25)]"
                                )}>
                                    <RotateCcwIcon className="size-4" /> Try again
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* ── done — two-column layout ── */}
                    {appState === "done" && result && (
                        <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                            {/* Toolbar */}
                            <div className="flex items-center justify-between px-5 py-3 border-b border-foreground/10 bg-foreground/[0.02]">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                                        <span className="size-1.5 rounded-full bg-green-400" />
                                        {segments.length} subtitle{segments.length !== 1 ? "s" : ""}
                                    </span>
                                    {undoToast && lastEdit && (
                                        <button onClick={handleUndo} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                                            <RotateCcwIcon className="size-3" /> Undo
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="flex items-center gap-0.5 mr-1 p-0.5 rounded-lg border border-foreground/10 bg-foreground/[0.03]">
                                        {(["default", "plain", "outline"] as const).map(s => (
                                            <button key={s} onClick={() => setCaptionStyle(s)}
                                                className={cn("text-[10px] px-1.5 py-0.5 rounded-md transition-all",
                                                    captionStyle === s ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                                                )}>
                                                {s === "default" ? "S1" : s === "plain" ? "S2" : "S3"}
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={handleDownloadSRT} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground/10 hover:bg-foreground/15 text-foreground/80 hover:text-foreground transition-all">
                                        <DownloadIcon className="size-3.5" /> SRT
                                    </button>
                                    <button onClick={handleDownloadVideo} disabled={burningVideo} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground/10 hover:bg-foreground/15 text-foreground/80 hover:text-foreground transition-all disabled:opacity-60 disabled:cursor-wait">
                                        {burningVideo ? (
                                            <><Loader2Icon className="size-3.5 animate-spin" />
                                            <span className="max-w-[90px] truncate">{burnPhase}{burnPct > 0 && burnPct < 100 ? ` ${burnPct}%` : ""}</span></>
                                        ) : (
                                            <><DownloadIcon className="size-3.5" /> Video</>
                                        )}
                                    </button>
                                    {onDone && (
                                        <button onClick={onDone} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                            My Videos
                                        </button>
                                    )}
                                    <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-all">
                                        <RotateCcwIcon className="size-3.5" /> New
                                    </button>
                                </div>
                            </div>

                            {/* Two-column body */}
                            <div className="flex divide-x divide-foreground/10" style={{ minHeight: "min(520px, calc(100vh - 220px))" }}>
                                {/* Left — video player */}
                                <div className="w-[55%] shrink-0 p-4 flex items-start justify-center bg-black/20">
                                    <VideoPlayer
                                        ref={playerRef}
                                        videoUrl={result.videoUrl}
                                        vttContent={currentVtt}
                                        subtitleFontBase={20}
                                        captionStyle={captionStyle}
                                        className="w-full"
                                    />
                                </div>

                                {/* Right — subtitle editor */}
                                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center justify-between shrink-0 bg-foreground/[0.01]">
                                        <span className="text-xs font-medium text-muted-foreground">Subtitle Editor</span>
                                        <span className="text-[10px] text-muted-foreground/40 hidden md:block">
                                            Click row → seek · Click time to edit (+/- adjust) · Enter splits · Shift+Enter saves · drag ⠿ to reorder
                                        </span>
                                    </div>

                                    <div className="overflow-y-auto max-h-[56vh] divide-y divide-foreground/[0.05]">
                                        {segments.length === 0 && (
                                            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                                                No subtitle segments detected.
                                            </div>
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
                                                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                                                    onDrop={() => handleDrop(idx)}
                                                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                                                    onClick={() => { if (!isEditText && !isEditTime) playerRef.current?.seek(seg.start); }}
                                                    className={cn(
                                                        "flex items-start gap-2 px-3 py-2.5 group/row transition-colors cursor-pointer",
                                                        isDragOver  && "bg-primary/5 border-t border-primary/30",
                                                        isDragging  && "opacity-40",
                                                        !isEditText && !isEditTime && "hover:bg-foreground/[0.04]"
                                                    )}
                                                >
                                                    {/* Drag handle */}
                                                    <GripVerticalIcon className="size-3.5 mt-[18px] shrink-0 text-muted-foreground/20 group-hover/row:text-muted-foreground/50 cursor-grab active:cursor-grabbing transition-colors" />

                                                    <div className="flex-1 min-w-0 space-y-1">
                                                        {/* Time badge / time editor */}
                                                        {isEditTime ? (
                                                            <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <div className="flex items-center gap-1">
                                                                        <button onClick={() => adjustTimeText(true, -0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">-</button>
                                                                        <input
                                                                            autoFocus
                                                                            value={timeStartText}
                                                                            onChange={e => setTimeStartText(e.target.value)}
                                                                            className="w-[72px] text-[11px] font-mono bg-foreground/10 border border-foreground/20 rounded px-1.5 py-0.5 focus:outline-none focus:border-primary/50 text-foreground"
                                                                            placeholder="00:00.0"
                                                                        />
                                                                        <button onClick={() => adjustTimeText(true, 0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">+</button>
                                                                    </div>
                                                                    <span className="text-muted-foreground/50 text-[10px]">→</span>
                                                                    <div className="flex items-center gap-1">
                                                                        <button onClick={() => adjustTimeText(false, -0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">-</button>
                                                                        <input
                                                                            value={timeEndText}
                                                                            onChange={e => setTimeEndText(e.target.value)}
                                                                            onKeyDown={async e => {
                                                                                if (e.key === "Enter") { e.preventDefault(); await saveEditTime(seg.id); }
                                                                                if (e.key === "Escape") setEditingTimeSegId(null);
                                                                            }}
                                                                            className="w-[72px] text-[11px] font-mono bg-foreground/10 border border-foreground/20 rounded px-1.5 py-0.5 focus:outline-none focus:border-primary/50 text-foreground"
                                                                            placeholder="00:00.0"
                                                                        />
                                                                        <button onClick={() => adjustTimeText(false, 0.1)} className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 font-mono">+</button>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button onClick={() => saveEditTime(seg.id)} className="p-1 rounded bg-primary/10 hover:bg-primary/20 text-primary"><SaveIcon className="size-3" /></button>
                                                                    <button onClick={() => setEditingTimeSegId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground"><XIcon className="size-3" /></button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={e => { e.stopPropagation(); startEditTime(seg); }}
                                                                className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/50 hover:text-primary transition-colors"
                                                            >
                                                                <ClockIcon className="size-2.5" />
                                                                {fmtTimeDisplay(seg.start)} – {fmtTimeDisplay(seg.end)}
                                                            </button>
                                                        )}

                                                        {/* Text / text editor */}
                                                        {isEditText ? (
                                                            <textarea
                                                                autoFocus
                                                                value={editText}
                                                                onChange={e => setEditText(e.target.value)}
                                                                rows={2}
                                                                onClick={e => e.stopPropagation()}
                                                                onKeyDown={async e => {
                                                                    if (e.key === "Enter" && e.shiftKey) {
                                                                        // Shift+Enter: save & advance to next
                                                                        e.preventDefault();
                                                                        await saveEdit(seg.id, idx + 1);
                                                                    } else if (e.key === "Enter") {
                                                                        // Enter: split at cursor (matches hero section)
                                                                        e.preventDefault();
                                                                        const cursor = (e.currentTarget as HTMLTextAreaElement).selectionStart ?? editText.length;
                                                                        await splitSegment(seg, idx, cursor);
                                                                    } else if (e.key === "Escape") {
                                                                        setEditingSegId(null); setEditText("");
                                                                    }
                                                                }}
                                                                onBlur={() => { if (!splitInProgress.current) saveEdit(seg.id); }}
                                                                className="w-full text-sm bg-foreground/[0.08] border border-primary/30 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:border-primary/60 text-foreground leading-snug"
                                                            />
                                                        ) : (
                                                            <p
                                                                onClick={e => { e.stopPropagation(); startEdit(seg); }}
                                                                className="text-sm text-foreground/90 leading-snug hover:text-foreground transition-colors cursor-text"
                                                            >
                                                                {seg.text || <span className="text-muted-foreground/30 italic text-xs">empty — click to add</span>}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Segment index */}
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
        </div>
    );
}


// ─── Profile Panel ──────────────────────────────────────────────────────────

function ProfilePanel() {
    const { data: session } = useSession();
    const [name, setName]         = useState("");
    const [saving, setSaving]     = useState(false);
    const [saved, setSaved]       = useState(false);
    const [error, setError]       = useState<string | null>(null);

    useEffect(() => {
        if (session?.user?.name) setName(session.user.name);
    }, [session?.user?.name]);

    const handleSave = async () => {
        setSaving(true); setError(null); setSaved(false);
        try {
            const res = await fetch("/api/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Update failed"); }
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error saving");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-xl space-y-6">
            <div>
                <h2 className="text-xl font-semibold">Profile</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage your account information.</p>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6 space-y-5">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                    <div className="size-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary flex items-center justify-center text-xl font-bold">
                        {(session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div>
                        <p className="font-semibold">{session?.user?.name ?? "User"}</p>
                        <p className="text-sm text-muted-foreground">{session?.user?.email ?? ""}</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Your name"
                        className="w-full text-sm bg-foreground/[0.06] border border-foreground/10 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary/40 text-foreground"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                    <input
                        value={session?.user?.email ?? ""}
                        readOnly
                        className="w-full text-sm bg-foreground/[0.03] border border-foreground/10 rounded-lg px-3 py-2.5 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-[11px] text-muted-foreground/50">Email cannot be changed.</p>
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}

                <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                    {saving ? <Loader2Icon className="size-4 animate-spin" /> : saved ? <CheckCircle2Icon className="size-4" /> : <UserIcon className="size-4" />}
                    {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
                </button>
            </div>
        </div>
    );
}

// ─── Feedback Panel ───────────────────────────────────────────────────────────

function FeedbackPanel() {
    const { data: session } = useSession();
    const [senderName, setSenderName]   = useState("");
    const [email, setEmail]             = useState("");
    const [rating, setRating]           = useState<number>(0);
    const [subject, setSubject]         = useState("");
    const [message, setMessage]         = useState("");
    const [status, setStatus]           = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [errorMsg, setErrorMsg]       = useState<string | null>(null);

    useEffect(() => {
        if (session?.user?.name) setSenderName(session.user.name);
        if (session?.user?.email) setEmail(session.user.email);
    }, [session?.user?.name, session?.user?.email]);

    const handleSubmit = async () => {
        if (!message.trim()) return;
        setStatus("sending"); setErrorMsg(null);
        try {
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: senderName.trim(), email: email.trim(), subject: subject.trim(), rating, message: message.trim() }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Send failed"); }
            setStatus("sent");
            setMessage("");
            setSubject("");
            setRating(0);
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
            setStatus("error");
        }
    };

    const reset = () => { setStatus("idle"); setErrorMsg(null); };

    return (
        <div className="max-w-xl space-y-6">
            <div>
                <h2 className="text-xl font-semibold">Feedback</h2>
                <p className="text-sm text-muted-foreground mt-1">Any feedback? Send us a message instantly.</p>
            </div>

            {status === "sent" ? (
                <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-8 flex flex-col items-center gap-4">
                    <CheckCircle2Icon className="size-12 text-green-400" />
                    <p className="text-lg font-semibold">Message sent. Thank you!</p>
                    <p className="text-sm text-muted-foreground text-center">We&apos;ll review your feedback and get back to you if needed.</p>
                    <button onClick={reset} className="px-4 py-2 text-sm rounded-lg border border-foreground/10 hover:bg-foreground/[0.06] transition-colors">Send another</button>
                </div>
            ) : (
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Your Name</label>
                            <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Name (optional)" className="w-full text-sm bg-foreground/[0.06] border border-foreground/10 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground/40" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Email</label>
                            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className="w-full text-sm bg-foreground/[0.06] border border-foreground/10 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground/40" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Subject <span className="text-muted-foreground/40">(optional)</span></label>
                        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Feature request, Bug report…" className="w-full text-sm bg-foreground/[0.06] border border-foreground/10 rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground/40" />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Rating <span className="text-muted-foreground/40">(optional)</span></label>
                        <div className="flex items-center gap-1">
                            {[1,2,3,4,5].map(star => (
                                <button key={star} onClick={() => setRating(star === rating ? 0 : star)}
                                    className={cn("transition-colors", star <= rating ? "text-yellow-400" : "text-foreground/20 hover:text-yellow-400/60")}>
                                    <StarIcon className="size-5" fill={star <= rating ? "currentColor" : "none"} />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Message <span className="text-red-400">*</span></label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Tell us what you think or report any issue…"
                            rows={5}
                            className="w-full text-sm bg-foreground/[0.06] border border-foreground/10 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground/40"
                        />
                    </div>

                    {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

                    <button
                        onClick={handleSubmit}
                        disabled={!message.trim() || status === "sending"}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(0,85,255,0.25)]"
                    >
                        {status === "sending" ? <Loader2Icon className="size-4 animate-spin" /> : <MessageSquareIcon className="size-4" />}
                        {status === "sending" ? "Sending…" : "Send Feedback"}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
    const router = useRouter();
    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<NavSection>("dashboard");

    const { data: videos = [], isLoading, isError, refetch } = useQuery({
        queryKey: ["dashboard-videos"],
        queryFn: fetchVideos,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteVideo,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-videos"] }),
        onSettled: () => setDeletingId(null),
    });

    const handleLogout = async () => {
        await signOut();
        router.push("/auth/sign-in");
    };

    const handleDelete = (id: string) => {
        setDeletingId(id);
        deleteMutation.mutate(id);
    };

    const handleDownloadSRT = async (jobId: string, fileName: string) => {
        try {
            const res = await fetch(`/api/dashboard/videos/srt?id=${jobId}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.srtContent) return;
            const blob = new Blob([data.srtContent], { type: "text/plain" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = fileName.replace(/\.[^/.]+$/, "") + ".srt";
            a.click();
        } catch { /* silently fail */ }
    };

    const totalTokens = videos.reduce((acc, v) => acc + (v.tokenUsage ?? 0), 0);
    const doneCount   = videos.filter(v => v.status === "done").length;
    const isAdmin     = (session?.user as Record<string, unknown>)?.role === "admin";
    const userImage   = session?.user?.image ?? null;
    const userName    = session?.user?.name ?? null;

    const navItems: { id: NavSection; label: string; icon: React.FC<{ className?: string }> }[] = [
        { id: "dashboard", label: "Dashboard",    icon: LayoutGridIcon  },
        { id: "myvideos",  label: "My Videos",    icon: ListVideoIcon   },
        { id: "upload",    label: "Upload Video",  icon: UploadCloudIcon },
        { id: "profile",   label: "Profile",       icon: UserIcon        },
        { id: "feedback",  label: "Feedback",      icon: MessageSquareIcon },
    ];

    const sectionTitle: Record<NavSection, string> = {
        dashboard: "Dashboard",
        myvideos:  "My Videos",
        upload:    "Upload Video",
        profile:   "Profile",
        feedback:  "Feedback",
    };

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            {/* ── Sidebar ── */}
            <aside className="w-60 shrink-0 flex flex-col border-r border-foreground/10 bg-foreground/[0.02]">
                {/* Logo */}
                <div className="h-14 flex items-center px-5 border-b border-foreground/10">
                    <Icons.wordmark className="h-5 w-auto text-foreground" />
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = activeSection === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                                    active
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                                )}
                            >
                                <Icon className="size-4 shrink-0" />
                                {item.label}
                                {active && (
                                    <span className="ml-auto size-1.5 rounded-full bg-primary" />
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Bottom: user profile */}
                <div className="border-t border-foreground/10 p-3 space-y-2">
                    {isAdmin && (
                        <button
                            onClick={() => router.push("/admin")}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                        >
                            <ShieldAlertIcon className="size-3.5" />
                            Admin Panel
                        </button>
                    )}
                    <div className="flex items-center gap-3 px-2 py-1.5">
                        <UserAvatar imageUrl={userImage} name={userName} />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate leading-tight">
                                {userName ?? "User"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                                {session?.user?.email ?? ""}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
                    >
                        <LogOutIcon className="size-3.5" />
                        Sign out
                    </button>
                </div>
            </aside>

            {/* ── Main area ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-14 shrink-0 border-b border-foreground/10 bg-background flex items-center justify-between px-6">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground">Dashboard</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="font-medium">{sectionTitle[activeSection]}</span>
                    </div>

                    {/* Right controls */}
                    <div className="flex items-center gap-3">
                        {/* Search (cosmetic) */}
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] text-muted-foreground text-sm w-48">
                            <SearchIcon className="size-3.5 shrink-0" />
                            <span className="text-xs">Search…</span>
                        </div>

                        {/* Bell */}
                        <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors relative">
                            <BellIcon className="size-4" />
                        </button>

                        <UserAvatar imageUrl={userImage} name={userName} />
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-y-auto p-6">
                    <AnimatePresence mode="wait">
                        {activeSection === "dashboard" && (
                            <motion.div
                                key="dashboard"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-8"
                            >
                                {/* Greeting */}
                                <div>
                                    <h1 className="text-2xl font-semibold">
                                        Welcome back{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}!
                                    </h1>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Here&apos;s an overview of your captioned video jobs.
                                    </p>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatCard icon={FilmIcon}     label="Total Videos"    value={videos.length} />
                                    <StatCard icon={LayoutGridIcon}  label="Completed"       value={doneCount} />
                                    <StatCard icon={ZapIcon}      label="Tokens Used"     value={totalTokens > 999 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} />
                                    <StatCard icon={FileTextIcon} label="SRT Files Ready" value={doneCount} sub="ready to download" />
                                </div>

                                {/* Recent videos */}
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-semibold">Recent Videos</h2>
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" variant="outline" onClick={() => refetch()}>
                                                <RefreshCwIcon className="size-3.5 mr-1.5" />
                                                Refresh
                                            </Button>
                                            <Button size="sm" onClick={() => setActiveSection("upload")}>
                                                <UploadCloudIcon className="size-3.5 mr-1.5" />
                                                New Upload
                                            </Button>
                                        </div>
                                    </div>
                                    <VideosTable
                                        videos={videos.slice(0, 5)}
                                        isLoading={isLoading}
                                        isError={isError}
                                        deletingId={deletingId}
                                        onDelete={handleDelete}
                                        onDownloadSRT={handleDownloadSRT}
                                        onRefetch={refetch}
                                        onUpload={() => setActiveSection("upload")}
                                    />
                                    {videos.length > 5 && (
                                        <button
                                            onClick={() => setActiveSection("myvideos")}
                                            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                        >
                                            View all {videos.length} videos
                                            <ChevronRightIcon className="size-3.5" />
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {activeSection === "myvideos" && (
                            <motion.div
                                key="myvideos"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-semibold">My Videos</h2>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {videos.length} video{videos.length !== 1 ? "s" : ""} total
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" variant="outline" onClick={() => refetch()}>
                                            <RefreshCwIcon className="size-3.5 mr-1.5" />
                                            Refresh
                                        </Button>
                                        <Button size="sm" onClick={() => setActiveSection("upload")}>
                                            <UploadCloudIcon className="size-3.5 mr-1.5" />
                                            New Upload
                                        </Button>
                                    </div>
                                </div>
                                <VideosTable
                                    videos={videos}
                                    isLoading={isLoading}
                                    isError={isError}
                                    deletingId={deletingId}
                                    onDelete={handleDelete}
                                    onDownloadSRT={handleDownloadSRT}
                                    onRefetch={refetch}
                                    onUpload={() => setActiveSection("upload")}
                                />
                            </motion.div>
                        )}

                        {activeSection === "upload" && (
                            <motion.div
                                key="upload"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                            >
                                <UploadPanel
                                    onDone={() => {
                                        queryClient.invalidateQueries({ queryKey: ["dashboard-videos"] });
                                        setActiveSection("myvideos");
                                    }}
                                />
                            </motion.div>
                        )}

                        {activeSection === "profile" && (
                            <motion.div
                                key="profile"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-full max-w-2xl">
                                        <ProfilePanel />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeSection === "feedback" && (
                            <motion.div
                                key="feedback"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-full max-w-2xl">
                                        <FeedbackPanel />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
};

export default Dashboard;
